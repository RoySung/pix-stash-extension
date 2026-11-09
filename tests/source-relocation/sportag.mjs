/** Opt-in live-site regression. Uses only normal page interactions and a disposable extension profile. */
import assert from 'node:assert/strict';
import {mkdtemp,rm,cp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const executablePath=process.env.EXTENSION_CHROMIUM_PATH;
if (!executablePath) throw new Error('Set EXTENSION_CHROMIUM_PATH to a Chromium executable supporting unpacked extensions');
let extension=resolve(process.env.EXTENSION_PATH ?? '.output/chrome-mv3');
const profile=await mkdtemp(join(tmpdir(),'pixstash-sportag-'));
let context;
if (process.env.NO_AUTO_CONTENT_SCRIPT === '1') {
  const isolated=join(profile,'test-extension');await cp(extension,isolated,{recursive:true});
  const manifest=JSON.parse(await readFile(join(isolated,'manifest.json'),'utf8'));delete manifest.content_scripts;
  await writeFile(join(isolated,'manifest.json'),JSON.stringify(manifest));extension=isolated;
}
try {
  context=await chromium.launchPersistentContext(profile,{headless:true,executablePath,viewport:{width:1360,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  context.setDefaultTimeout(20000);
  const worker=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;

  const library=await context.newPage();
  const errors=[];library.on('pageerror',error=>errors.push(error.message));
  await library.goto(`chrome-extension://${id}/library.html`,{waitUntil:'domcontentloaded'});
  await library.evaluate(()=>chrome.storage.local.set({'pixstash.language':'en-US'}));
  const source=await context.newPage();
  const url='https://www.sportag.net/web/event-photo.php?event_id=1204&view=all';
  await source.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  // Site-specific selectors belong only to this opt-in reproduction, never to production matching.
  const photoId=process.env.SPORTAG_PHOTO_ID ?? '29340315';
  const thumbnail=source.locator(`img[alt="照片 ID: ${photoId}"]`).first();
  await thumbnail.waitFor();
  const expected=await thumbnail.getAttribute('src');
  const expectedPath=new URL(expected).pathname;
  await thumbnail.click();
  await source.locator('[role="dialog"]:visible img[src]').filter({visible:true}).first().waitFor();
  await source.waitForFunction(path=>[...document.querySelectorAll('[role="dialog"] img')].some(image=>image.getClientRects().length && new URL(image.src).pathname===path),expectedPath);
  // Wait for the public site's modal transition, without guessing a content-script ready delay.
  await source.waitForFunction(()=>[...document.querySelectorAll('[role="dialog"]')].some(el=>el.getClientRects().length&&getComputedStyle(el).opacity==='1'));
  await source.bringToFront();
  const captured=await library.evaluate(()=>chrome.runtime.sendMessage({type:'pixstash/capture-page-image'}));
  assert(captured.ok,`Capture failed: ${captured.errorCode ?? 'unknown'}`);
  assert.equal(new URL(captured.item.originalImageUrl).pathname,expectedPath,'The active preview must win over background images');
  assert.equal(captured.item.sourceLocator?.anchors[0]?.weak,false,'Preview duplication must not destroy saved evidence');
  assert(captured.item.sourceLocator.anchors[0].alt?.includes('ID:'),'Save the paired thumbnail identity');
  console.log('PASS live Sportag foreground page-image capture');
  const duplicate=await library.evaluate(()=>chrome.runtime.sendMessage({type:'pixstash/capture-page-image'}));
  assert.equal(duplicate.ok,true);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.item.id,captured.item.id);
  console.log('PASS live Sportag duplicate capture keeps one item');
  async function revisit(label) {
    await library.bringToFront();
    await library.reload({waitUntil:'domcontentloaded'});
    const link=library.locator('a.library__inline-action').first();
    await link.waitFor();
    const opened=context.waitForEvent('page');
    await link.click();
    const page=await opened;
    await page.waitForURL(url,{waitUntil:'domcontentloaded',timeout:45000});
    const active=page.locator('img[data-pixstash-active]');
    await active.waitFor({timeout:15000}).catch(async error=>{
      const state=await page.evaluate(()=>({hidden:document.hidden,status:document.querySelector('[data-pixstash-ui="relocation"]')?.shadowRoot?.querySelector('[role="status"]')?.textContent,photoImages:[...document.images].filter(el=>el.alt.startsWith('照片 ID:')).length}));
      throw new Error('Thumbnail not active: '+JSON.stringify({state,errors}),{cause:error});
    });
    assert.equal(await active.count(),1);
    assert.equal(new URL(await active.getAttribute('src')).pathname,expectedPath,'The highlighted thumbnail must be the collected photo');
    assert.equal(await active.evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.waitForTimeout(2400);
    assert.equal(await active.count(),1,'The active state outlasts the transient overlay');
    console.log(`PASS live Sportag ${label}: exact thumbnail active`);
    return page;
  }
  const revisited=await revisit('source revisit');
  await revisited.screenshot({path:'/tmp/pixstash-sportag-active.png'});
  await revisited.getByRole('button',{name:'Dismiss highlight',exact:true}).click();
  assert.equal(await revisited.locator('[data-pixstash-active]').count(),0);
  console.log('PASS live Sportag dismiss clears the active style');
  // Change only the saved signing envelope, never resource IDs, network credentials or the site itself.
  await library.evaluate(async itemId=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pixstash');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('items','readwrite');const store=tx.objectStore('items');const request=store.get(itemId);request.onsuccess=()=>{const item=request.result;item.sourceLocator.anchors=item.sourceLocator.anchors.map(anchor=>({...anchor,urls:anchor.urls.map(value=>{const url=new URL(value);if(url.searchParams.has('Signature')&&url.searchParams.has('Expires')){url.searchParams.set('Signature','expired-test-signature');url.searchParams.set('Expires','1700000000');}return url.href;})}));store.put(item);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();
  },captured.item.id);
  const renewed=await revisit('expired signing evidence');
  await renewed.getByRole('button',{name:'Dismiss highlight',exact:true}).click();
  console.log('5 live-site checks passed');
} finally {await context?.close();await rm(profile,{recursive:true,force:true});}
