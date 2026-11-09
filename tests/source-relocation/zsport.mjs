/** Public-site pagination regression: never accept a first-page photo for a second-page capture. */
import assert from 'node:assert/strict';
import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve}from'node:path';
const{chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const profile=await mkdtemp(join(tmpdir(),'pixstash-zsport-'));const extension=resolve(process.env.EXTENSION_PATH??'.output/chrome-mv3');let context;
try{
context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.EXTENSION_CHROMIUM_PATH,viewport:{width:1360,height:900},args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});context.setDefaultTimeout(20000);
const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
const library=await context.newPage();await library.goto(`chrome-extension://${id}/library.html`);await library.evaluate(()=>chrome.storage.local.set({'pixstash.language':'en-US'}));
const source=await context.newPage();const url='https://www.zsport.com.tw/activity/534';await source.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await source.locator('img.t_img:visible').first().waitFor();
await source.waitForFunction(()=>document.querySelector('#next-page')?.page===2);
const firstPage=await source.locator('img.t_img:visible').evaluateAll(imgs=>imgs.map(img=>img.getAttribute('pid')));
await source.locator('#next-page').click();await source.waitForFunction(()=>document.querySelector('#current-items')?.textContent?.trim().startsWith('50'));
await source.waitForFunction(previous=>[...document.querySelectorAll('img.t_img')].some(img=>img.getClientRects().length&&!previous.includes(img.getAttribute('pid'))),firstPage);
const pid=await source.locator('img.t_img:visible').evaluateAll((imgs,previous)=>imgs.find(img=>!previous.includes(img.getAttribute('pid')))?.getAttribute('pid'),firstPage);assert(pid);assert(!firstPage.includes(pid));const target=source.locator(`img.t_img[pid="${pid}"]:visible`).first();console.log('pagination',{initial:firstPage.length,current:await source.locator('img.t_img:visible').count(),pid,wasInFirst:firstPage.includes(pid)});
await target.click();await source.waitForFunction(()=>{const image=document.querySelector('#preview_img');return image?.complete&&image.naturalWidth>0&&image.getClientRects().length&&image.currentSrc===image.src;});
assert.equal(source.url(),url);await source.bringToFront();const captured=await library.evaluate(()=>chrome.runtime.sendMessage({type:'pixstash/capture-page-image'}));assert(captured.ok,`Capture failed: ${captured.errorCode}`);
assert(captured.item.sourceLocator?.page.links.includes('https://www.zsport.com.tw/photo/'+pid));console.log('PASS generic capture observes the adjacent photo detail link');
await library.bringToFront();await library.reload();const link=library.locator('a.library__inline-action').first();await link.waitFor();const opened=context.waitForEvent('page');await link.click();const page=await opened;await page.waitForURL('https://www.zsport.com.tw/photo/'+pid,{waitUntil:'domcontentloaded',timeout:45000});
const active=page.locator('img[data-pixstash-active]');await active.waitFor({timeout:20000});
assert.equal(new URL(await active.getAttribute('src')).pathname.split('/').pop(),new URL(captured.item.originalImageUrl).pathname.split('/').pop());
await page.screenshot({path:'/tmp/pixstash-zsport-detail.png'});console.log('PASS second-page photo opens its verified standalone page through the actual library link');
}finally{await context?.close();await rm(profile,{recursive:true,force:true});}
