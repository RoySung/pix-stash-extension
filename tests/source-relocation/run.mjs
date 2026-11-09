/** Real layout tests. Set PLAYWRIGHT_MODULE to an installed playwright module when not local. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,mkdtemp,rm,cp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {createServer}=await import(new URL('./dist/node/index.js', 'file://'+createRequire(require.resolve('wxt')).resolve('vite/package.json')).href);
const {chromium,firefox}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},appType:'custom'});
const html=await readFile(new URL('./fixture.html',import.meta.url),'utf8');
const otherPhoto=await readFile(new URL('../../public/icon/96.png',import.meta.url));
const photo=await readFile(new URL('../../public/icon/128.png',import.meta.url));
server.middlewares.use((req,res,next)=>{
 if(req.url?.startsWith('/detail')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Photo details</title><img id="detail-photo" src="/mirror.png" style="width:450px;height:600px">');}
 else if(req.url?.startsWith('/wrong-detail')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Other photo</title><img src="/other.png" style="width:450px;height:600px">');}
 else if(req.url?.startsWith('/mirror.png')){res.setHeader('Content-Type','image/png');res.end(photo);}
 else if(req.url?.startsWith('/other.png')){res.setHeader('Content-Type','image/png');res.end(otherPhoto);}
 else if(req.url?.startsWith('/fixture')){res.setHeader('Content-Type','text/html');res.end(html);}
 else if(req.url?.startsWith('/photo.png')){res.setHeader('Content-Type','image/png');res.end(photo);}
 else next();
});
await server.listen();
const base=server.resolvedUrls.local[0].replace(/\/$/,'');
const engine=process.env.BROWSER==='firefox'?firefox:chromium;
const browser=await engine.launch({headless:true,executablePath:process.env.BROWSER==='firefox'?process.env.FIREFOX_PATH:process.env.CHROMIUM_PATH});
let passed=0;
async function check(name,fn){if(process.env.CASE_FILTER&&!name.includes(process.env.CASE_FILTER))return;await fn();passed++;console.log(`PASS ${name}`);}
async function load(page){await page.goto(base+'/fixture');await page.evaluate(async()=>{window.dom=await import('/src/lib/source-locator-dom.ts');window.probe=await import('/tests/source-relocation/probe-entry.ts');window.relocate=await import('/src/lib/source-relocation-dom.ts');window.strings={searching:'Finding your saved position…',found:'Found your saved material or section',nearby:'Returned near your saved position',ambiguous:'Found similar positions; not confirmed','not-found':'Could not locate saved material',unsupported:'Automatic positioning is unavailable',cancelled:'Search stopped',cancel:'Stop searching',close:'Close',clues:'Saved clues',original:'Open original image',retry:'Retry from library',retry_search:'Search this page again'};});}
try {
const context=await browser.newContext({viewport:{width:1100,height:760},deviceScaleFactor:2});
const page=await context.newPage();page.setDefaultTimeout(12000);
await check('region captures painted content only, CSS pixels and privacy',async()=>{
 await load(page);
 const result=await page.evaluate(()=>{document.querySelector('#finish').scrollIntoView({block:'start'});const el=document.querySelector('#finish');const r=el.getBoundingClientRect();const snapshot=dom.captureSourceLocator('region_screenshot',{x:r.x,y:r.y,width:r.width,height:r.height});window.saved=snapshot.locator;return {snapshot,valid:dom.verifySourceCapture(snapshot.token)};});
 assert.equal(result.valid,true);assert.equal(result.snapshot.locator.viewport.dpr,2);
 const serialized=JSON.stringify(result.snapshot.locator);assert(!serialized.includes('PRIVATE'));assert(!serialized.includes('HIDDEN'));assert(!serialized.includes('DO NOT INCLUDE'));assert(serialized.includes('A123'));
});
await check('screenshot relocates its section after viewport resize',async()=>{
 await page.setViewportSize({width:780,height:760});
 const result=await page.evaluate(()=>relocate.matchDomAnchors(saved,[...dom.domElements()].flatMap(el=>{if(!dom.visible(el))return [];const texts=dom.textAnchors(el);const urls=dom.imageUrls(el);if(urls.length)texts.push({element:el,anchor:dom.describeElement(el,undefined,urls)});return texts;})));
 assert.equal(result.status,'found');
});
await check('duplicate image is ambiguous and contradictory headings never win',async()=>{
 await load(page);
 const result=await page.evaluate(()=>{const photo=document.querySelector('#photo');const snap=dom.captureSourceLocator('page_image',undefined,photo.src);const duplicate=document.querySelector('#finish').cloneNode(true);duplicate.removeAttribute('id');duplicate.querySelector('img').removeAttribute('id');document.body.append(duplicate);const candidates=[...document.images].map(element=>({element,anchor:dom.describeElement(element)}));const same=relocate.matchDomAnchors(snap.locator,candidates);duplicate.querySelector('h2').textContent='Different unrelated album title';document.querySelector('#finish h2').textContent='Other contradictory album title';return {same:same.status,conflict:relocate.matchDomAnchors(snap.locator,candidates.map(c=>({...c,anchor:dom.describeElement(c.element)}))).status};});
 assert.equal(result.same,'ambiguous');assert.notEqual(result.conflict,'found');
});
await check('foreground preview keeps a reliable locator when the list repeats its image',async()=>{
 await load(page);
 const saved=await page.evaluate(()=>{
   const photo=document.querySelector('#photo');photo.alt='照片 ID: 29340293';
   const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.style.cssText='position:fixed;inset:0;z-index:5000;background:#fff';
   const image=document.createElement('img');image.src=photo.src;image.alt='大圖預覽';image.style.cssText='width:450px;height:600px';modal.append(image);const preload=document.createElement('div');preload.style.opacity='0';preload.innerHTML='<img src="/photo.png?id=invisible-preload" style="width:1200px;height:900px">';modal.append(preload);document.body.append(modal);
   const candidate=probe.detectPageCandidate(document,location.href,location.hostname);
   window.dialogSaved=dom.captureSourceLocator('page_image',undefined,candidate.imageUrl).locator;
   const info={source:candidate.metadata.source_type,weak:dialogSaved.anchors[0].weak,alt:dialogSaved.anchors[0].alt};modal.remove();return info;
 });
 assert.equal(saved.source,'foreground-image');assert.equal(saved.weak,false);assert.equal(saved.alt,'照片 ID: 29340293');
 await page.evaluate(()=>{window.statuses=[];window.dispose=relocate.runSourceRelocation({requestId:'dialog',locator:dialogSaved,expires:Date.now()+8000},strings,status=>statuses.push(status));});
 await page.waitForFunction(()=>statuses.length>0);assert.equal(await page.evaluate(()=>statuses[0]),'found');
 assert.equal(await page.locator('#photo[data-pixstash-active]').count(),1);
 await page.waitForTimeout(5300);assert.equal(await page.locator('#photo[data-pixstash-active]').count(),1);
 assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#photo')).outlineStyle),'solid');
 await page.mouse.move(200,200);await page.mouse.wheel(0,200);await page.waitForTimeout(150);assert.equal(await page.locator('#photo[data-pixstash-active]').count(),1);
 await page.evaluate(()=>dispose());assert.equal(await page.locator('[data-pixstash-active]').count(),0);assert.equal(await page.locator('[data-pixstash-ui]').count(),0);
});
await check('older URL-only ambiguous preview records can recheck a unique exact thumbnail without rewriting data',async()=>{
 await load(page);
 await page.evaluate(()=>{const photo=document.querySelector('#photo');const saved=dom.captureSourceLocator('page_image',undefined,photo.src).locator;saved.anchors=[{kind:'image',urls:[photo.src],hint:{path:[]},rect:{x:0,y:0,width:0,height:0},relative:{x:0,y:0},weak:true}];window.oldSaved=saved;window.statuses=[];window.dispose=relocate.runSourceRelocation({requestId:'legacy-preview',locator:saved,originalImageUrl:photo.src,expires:Date.now()+8000},strings,status=>statuses.push(status));});
 await page.waitForFunction(()=>statuses.length>0);assert.equal(await page.evaluate(()=>statuses[0]),'found');assert.equal(await page.locator('#photo[data-pixstash-active]').count(),1);
 assert.equal(await page.evaluate(()=>oldSaved.anchors[0].weak),true);await page.evaluate(()=>dispose());
});
await check('persistent active styling never follows a recycled image to a different photo',async()=>{
 await load(page);
 await page.evaluate(()=>{const photo=document.querySelector('#photo');const saved=dom.captureSourceLocator('page_image',undefined,photo.src).locator;window.statuses=[];window.dispose=relocate.runSourceRelocation({requestId:'active-reuse',locator:saved,expires:Date.now()+8000},strings,status=>statuses.push(status));});
 await page.waitForFunction(()=>statuses[0]==='found');assert.equal(await page.locator('#photo[data-pixstash-active]').count(),1);
 await page.evaluate(()=>{const photo=document.querySelector('#photo');photo.setAttribute('data-src',photo.src);photo.setAttribute('data-srcset',photo.src+' 100w');photo.src='/photo.png?id=different';});
 await page.waitForFunction(()=>!document.querySelector('[data-pixstash-active]'));
 assert.equal(await page.locator('[data-pixstash-ui]').count(),0);
});
await check('manual page changes can retry without reporting position-only recovery as found',async()=>{
 await load(page);
 await page.evaluate(()=>{const photo=document.querySelector('#photo');window.savedRetry=dom.captureSourceLocator('page_image',undefined,photo.src).locator;photo.remove();window.statuses=[];window.dispose=relocate.runSourceRelocation({requestId:'retry',locator:savedRetry,expires:Date.now()+800},strings,status=>statuses.push(status));});
 await page.waitForFunction(()=>statuses.length>0);assert.notEqual(await page.evaluate(()=>statuses[0]),'found');assert.equal(await page.locator('[data-pixstash-active]').count(),0);
 await page.evaluate(()=>{const photo=document.createElement('img');photo.id='photo';photo.src=savedRetry.anchors[0].urls[0];photo.alt=savedRetry.anchors[0].alt ?? '';document.querySelector('#finish').append(photo);});
 await page.getByRole('button',{name:'Search this page again',exact:true}).click();await page.waitForFunction(()=>statuses.includes('found'));assert.equal(await page.locator('#photo[data-pixstash-active]').count(),1);await page.evaluate(()=>dispose());assert.equal(await page.locator('[data-pixstash-ui]').count(),0);
});
await check('background URLs keep parentheses and complete identity paths',async()=>{
 await load(page);
 const urls=await page.evaluate(()=>{const box=document.createElement('div');box.style.backgroundImage='url("/transform(width_100)/photo-A.png")';document.body.append(box);return dom.imageUrls(box);});
 assert(urls.some(url=>url.endsWith('/transform(width_100)/photo-A.png')));assert(!urls.some(url=>url.endsWith('/transform(width_100')));
});
await check('srcset preserves commas inside image URLs and excludes stale lazy evidence',async()=>{
 await load(page);
 const urls=await page.evaluate(()=>{const img=document.querySelector('#photo');img.srcset='/cdn/w_100,h_100/photo.png?id=17 100w, /cdn/w_200,h_200/photo.png?id=17 200w';img.setAttribute('data-src','/photo.png?id=stale');img.setAttribute('data-srcset','/photo.png?id=stale 100w');return dom.imageUrls(img,false);});
 assert(urls.some(url=>url.includes('/cdn/w_100,h_100/photo.png?id=17')));assert(!urls.some(url=>url.includes('stale')));assert(!urls.some(url=>url.endsWith('/cdn/w_100')));
});
await check('picture captures and relocates the loaded source instead of its fallback',async()=>{
 await load(page);
 const result=await page.evaluate(async()=>{
   document.querySelectorAll('meta[property^="og:image"],meta[name="twitter:image"],link[rel="image_src"]').forEach(element=>element.remove());
   document.body.innerHTML='<picture><source media="(min-width: 1px)" srcset="/photo.png?id=selected"><img src="/other.png" style="width:600px;height:400px"></picture>';
   const image=document.images[0];await image.decode();
   const candidate=probe.detectPageCandidate(document,location.href,location.hostname);
   const snapshot=dom.captureSourceLocator('page_image',undefined,candidate.imageUrl);
   const urls=dom.imageUrls(image,false);
   const match=relocate.matchDomAnchors(snapshot.locator,[{element:image,anchor:dom.describeElement(image,undefined,urls)}]);
   return {rendered:image.currentSrc,chosen:candidate.imageUrl,urls,anchor:snapshot.locator.anchors[0],match:match.status};
 });
 assert(result.rendered.endsWith('/photo.png?id=selected'));assert.equal(result.chosen,result.rendered);
 assert(result.urls.includes(result.rendered));assert.equal(result.anchor.hint.path.at(-1).tag,'img');assert.equal(result.match,'found');
});
await check('right-click capture uses the trusted recent image target',async()=>{
 await load(page);await page.evaluate(()=>document.addEventListener('contextmenu',dom.rememberContextTarget,true));await page.locator('#photo').click({button:'right'});
 const captured=await page.evaluate(()=>dom.captureSourceLocator('context_image',undefined,document.querySelector('#photo').src));
 assert.equal(captured.locator.anchors[0].hint.id,'photo');assert.equal(captured.locator.captureMode,'context_image');
 await page.keyboard.press('Escape');
});
await check('open shadow root images captured and range excludes outside words',async()=>{
 await load(page);
 const result=await page.evaluate(()=>{const host=document.createElement('div');document.body.prepend(host);const root=host.attachShadow({mode:'open'});root.innerHTML='<img src="/photo.png?id=shadow" width="200" height="100">';const image=root.querySelector('img');const snapshot=dom.captureSourceLocator('page_image',undefined,image.src);const p=document.querySelector('#caption');p.scrollIntoView({block:'center'});const r=p.getBoundingClientRect();const range=dom.textAnchors(p,{x:r.x,y:r.y,width:60,height:r.height});return {urls:snapshot.locator.anchors[0].urls,text:range.map(c=>c.anchor.text).join(' ')};});
 assert(result.urls.some(url=>url.includes('id=shadow')));assert(!result.text.includes('finish line'));
});
await check('CSS-hidden headings and transparent ancestors never become evidence',async()=>{
 await load(page);
 const serialized=await page.evaluate(()=>{document.querySelector('#finish h2').insertAdjacentHTML('beforeend','<span style="display:none">PRIVATE HIDDEN CONTEXT</span>');const transparent=document.createElement('article');transparent.style.opacity='0';transparent.innerHTML='<h2>PRIVATE TRANSPARENT TITLE</h2><img src="/photo.png?id=private">';document.body.prepend(transparent);document.querySelector('#finish').scrollIntoView();return JSON.stringify(dom.captureSourceLocator('instant_screenshot'));});
 assert(!serialized.includes('PRIVATE HIDDEN'));assert(!serialized.includes('PRIVATE TRANSPARENT'));
});
await check('screenshots reject a lone surviving image and scattered anchors',async()=>{
 await load(page);
 const result=await page.evaluate(()=>{document.querySelector('#finish').scrollIntoView();const r=document.querySelector('#finish').getBoundingClientRect();const saved=dom.captureSourceLocator('region_screenshot',{x:r.x,y:r.y,width:r.width,height:r.height}).locator;const photo=document.querySelector('#photo');const lone=relocate.matchDomAnchors(saved,[{element:photo,anchor:dom.describeElement(photo)}]).status;const first={kind:'text',urls:[],text:'Distinctive first text anchor',hint:{path:[]},rect:{x:0,y:0,width:100,height:20},relative:{x:0,y:0},weak:false};const second={...first,text:'Distinctive second text anchor',rect:{x:200,y:0,width:100,height:20},relative:{x:.5,y:0}};saved.anchors=[first,second];const wrapper=document.createElement('div');wrapper.style.height='3000px';wrapper.innerHTML='<div id="first">Distinctive first text anchor</div><div style="height:1500px"></div><div id="second">Distinctive second text anchor</div>';document.body.append(wrapper);const candidates=[...wrapper.querySelectorAll('[id]')].flatMap(el=>dom.textAnchors(el));return {lone,scattered:relocate.matchDomAnchors(saved,candidates).status};});
 assert.notEqual(result.lone,'found');assert.notEqual(result.scattered,'found');
});
await check('geometry token invalidates after top-level and nested scrolling',async()=>{
 await load(page);
 assert(await page.evaluate(()=>{const snap=dom.captureSourceLocator('instant_screenshot');scrollTo(0,300);return !dom.verifySourceCapture(snap.token);}));
 assert(await page.evaluate(()=>{const inner=document.querySelector('#scroller');inner.scrollIntoView();inner.scrollTop=500;const snap=dom.captureSourceLocator('instant_screenshot');inner.scrollTop=0;return !dom.verifySourceCapture(snap.token);}));
});
await check('dynamic insertion is found and timers/overlays clean up',async()=>{
 await load(page);
 await page.evaluate(()=>{const photo=document.querySelector('#photo');window.saved=dom.captureSourceLocator('page_image',undefined,photo.src).locator;window.reinsert=document.querySelector('#finish').outerHTML;document.querySelector('#finish').remove();window.statuses=[];window.dispose=relocate.runSourceRelocation({requestId:'dynamic',locator:saved,expires:Date.now()+8000},strings,status=>statuses.push(status));setTimeout(()=>document.querySelector('#spacer').insertAdjacentHTML('afterend',reinsert),500);});
 await page.waitForFunction(()=>statuses.length>0);assert.equal(await page.evaluate(()=>statuses[0]),'found');
 await page.locator('[data-pixstash-ui="highlight"]').waitFor();
 await page.screenshot({path:'/tmp/pixstash-relocation-found.png'});
 await page.evaluate(()=>dispose());assert.equal(await page.locator('[data-pixstash-ui]').count(),0);
});
await check('trusted wheel cancels without restoring scroll',async()=>{
 await load(page);
 await page.evaluate(()=>{const photo=document.querySelector('#photo');const saved=dom.captureSourceLocator('page_image',undefined,photo.src).locator;photo.remove();window.statuses=[];window.dispose=relocate.runSourceRelocation({requestId:'cancel',locator:saved,expires:Date.now()+8000},strings,status=>statuses.push(status));});
 await page.mouse.move(200,200);await page.mouse.wheel(0,400);await page.waitForFunction(()=>statuses.length>0);
 assert.equal(await page.evaluate(()=>statuses[0]),'cancelled');
 await page.waitForTimeout(150);const before=await page.evaluate(()=>scrollY);await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>scrollY),before);await page.evaluate(()=>dispose());
});
await check('node reuse invalidates stale identity and yields nearby at most',async()=>{
 await load(page);
 await page.evaluate(()=>{const photo=document.querySelector('#photo');const saved=dom.captureSourceLocator('page_image',undefined,photo.src).locator;photo.src='/photo.png?id=another';window.statuses=[];window.dispose=relocate.runSourceRelocation({requestId:'reused',locator:saved,expires:Date.now()+1800},strings,status=>statuses.push(status));});
 await page.waitForFunction(()=>statuses.length>0);assert.notEqual(await page.evaluate(()=>statuses[0]),'found');await page.evaluate(()=>dispose());
});
if (process.env.EXTENSION_CHROMIUM_PATH) {
  // Keep native extension-tab activation independent of the DOM-only browser window.
  await context.close();await browser.close();
  const profile=await mkdtemp(join(tmpdir(),'pixstash-relocation-'));
  let extension=resolve(process.env.EXTENSION_PATH ?? '.output/chrome-mv3');
  if (process.env.NO_AUTO_CONTENT_SCRIPT === '1') {
    const isolated=join(profile,'test-extension');await cp(extension,isolated,{recursive:true});
    const manifest=JSON.parse(await readFile(join(isolated,'manifest.json'),'utf8'));delete manifest.content_scripts;
    await writeFile(join(isolated,'manifest.json'),JSON.stringify(manifest));extension=isolated;
  }
  const ext=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.EXTENSION_CHROMIUM_PATH,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try {
    ext.setDefaultTimeout(12000);
    const worker=ext.serviceWorkers()[0] ?? await ext.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    const library=await ext.newPage();await library.goto(`chrome-extension://${id}/library.html`);await library.evaluate(()=>chrome.storage.local.set({'pixstash.language':'en-US'}));
    const target=await ext.newPage();await target.goto(base+'/fixture');await target.bringToFront();
    await target.locator('#photo').scrollIntoViewIfNeeded();
    // Ask the extension itself, from its trusted library document, to use the active source tab.
    const image=await library.evaluate(()=>chrome.runtime.sendMessage({type:'pixstash/capture-page-image'}));
    assert.equal(image.ok,true,JSON.stringify(image));assert(image.item.sourceLocator);assert.equal(image.item.sourceLocator.captureMode,'page_image');
    console.log('PASS extension page-image capture stores DOM evidence');passed++;
    await library.bringToFront();await library.reload({waitUntil:'domcontentloaded'});
    const sourceLink=library.locator('a.library__inline-action').first();await sourceLink.waitFor();
    const opened=ext.waitForEvent('page');await sourceLink.click();
    const revisited=await opened;await revisited.waitForURL(base+'/fixture');
    await revisited.waitForFunction(()=>document.querySelector('[data-pixstash-ui="relocation"]')?.shadowRoot?.querySelector('[role="status"]')?.textContent.includes('Found')).catch(async error=>{
      const actual=await revisited.evaluate(()=>({hidden:document.hidden,status:document.querySelector('[data-pixstash-ui="relocation"]')?.shadowRoot?.querySelector('[role="status"]')?.textContent,images:document.images.length}));
      throw new Error('Source revisit failed: '+JSON.stringify(actual),{cause:error});
    });
    console.log('PASS extension ready handshake opens source and highlights the saved image');passed++;
    await target.bringToFront();
    const viewport=await library.evaluate(()=>chrome.runtime.sendMessage({type:'pixstash/capture-instant'}));
    assert.equal(viewport.ok,true,JSON.stringify(viewport));assert.equal(viewport.item.sourceLocator.captureMode,'instant_screenshot');
    console.log('PASS extension viewport screenshot saves bound geometry');passed++;
    await target.bringToFront();
    assert.equal((await library.evaluate(()=>chrome.runtime.sendMessage({type:'pixstash/start-region-capture'}))).ok,true);
    await target.locator('#pixstash-region-overlay').waitFor();
    await target.keyboard.press('Enter');await target.keyboard.press('Enter');
    await target.waitForFunction(()=>!document.querySelector('#pixstash-region-overlay'));
    await library.waitForFunction(async()=>{const db=await new Promise(resolve=>{const request=indexedDB.open('pixstash');request.onsuccess=()=>resolve(request.result);});return await new Promise(resolve=>{const request=db.transaction('items').objectStore('items').getAll();request.onsuccess=()=>{const found=request.result.some(item=>item.captureMode==='region_screenshot'&&item.sourceLocator?.captureMode==='region_screenshot');db.close();resolve(found);};});});
    console.log('PASS extension region overlay saves a screenshot with selected evidence');passed++;
    await target.bringToFront();
    await target.evaluate(base=>{document.querySelector('[data-pixstash-ui="capture-toast"]')?.remove();const link=document.createElement('a');link.href=base+'/detail';link.textContent='Details';document.querySelector('#finish').append(link);},base);
    const linked=await library.evaluate(()=>chrome.runtime.sendMessage({type:'pixstash/capture-page-image'}));assert.equal(linked.ok,true);assert(linked.item.sourceLocator.page.links.includes(base+'/detail'));
    await library.bringToFront();await library.reload();const directLink=library.locator(`[data-item-id="${linked.item.id}"] a.library__inline-action`);await directLink.waitFor();const directOpened=ext.waitForEvent('page');await directLink.click();const detail=await directOpened;await detail.waitForURL(base+'/detail');await detail.locator('#detail-photo[data-pixstash-active]').waitFor();
    await library.waitForFunction(itemId=>new Promise(resolve=>{const request=indexedDB.open('pixstash');request.onsuccess=()=>{const db=request.result;const get=db.transaction('items').objectStore('items').get(itemId);get.onsuccess=()=>{resolve(!!get.result.sourceLocator.page.verified);db.close();};};}),linked.item.id);
    console.log('PASS nearby detail link is verified against saved image bytes across different image URLs');passed++;
    await library.reload();assert.equal(await library.locator(`[data-item-id="${linked.item.id}"] a.library__inline-action`).getAttribute('href'),base+'/detail');
    console.log('PASS verified material link becomes the primary href while original source is preserved');passed++;
    await library.evaluate(async({itemId,base})=>{const db=await new Promise(resolve=>{const request=indexedDB.open('pixstash');request.onsuccess=()=>resolve(request.result);});await new Promise(resolve=>{const tx=db.transaction('items','readwrite');const store=tx.objectStore('items');const get=store.get(itemId);get.onsuccess=()=>{const item=get.result;delete item.sourceLocator.page.verified;item.sourceLocator.page.links=[base+'/wrong-detail'];store.put(item);};tx.oncomplete=resolve;});db.close();},{itemId:linked.item.id,base});
    await library.bringToFront();await library.reload();const wrongLink=library.locator(`[data-item-id="${linked.item.id}"] a.library__inline-action`);await wrongLink.waitFor();const wrongOpened=ext.waitForEvent('page');await wrongLink.click();const wrong=await wrongOpened;await wrong.waitForURL(base+'/fixture',{timeout:22000});await wrong.locator('#photo[data-pixstash-active]').waitFor();
    console.log('PASS a nearby link showing different image bytes falls back to the original source');passed++;
    await library.screenshot({path:'/tmp/pixstash-relocation-library.png'});
  } finally {await ext.close();await rm(profile,{recursive:true,force:true});}
}
console.log(`${passed} browser checks passed`);
await context.close();
} finally {await browser.close();await server.close();}
