/* Asset format, browser loading and PCM checks; no game runtime changes. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),assets=path.join(root,'assets');

(async()=>{
 const catalog=JSON.parse(await fs.readFile(path.join(assets,'manifest.json'),'utf8'));
 assert.equal(catalog.assets.length,49);assert.equal(new Set(catalog.assets.map(a=>a.id)).size,49);
 for(const a of catalog.assets){
  const data=await fs.readFile(path.join(assets,a.path));
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),a.sha256,a.path);
  if(a.format==='svg'){
   const xml=data.toString();assert(!/<script|<foreignObject|\b(?:href|xlink:href)=/i.test(xml),a.path);
   assert(xml.includes(`viewBox="0 0 ${a.width} ${a.height}"`),a.path);
  }
 }
 const browser=await chromium.launch({headless:true,...(process.env.PINBALL_BROWSER_EXECUTABLE?{executablePath:process.env.PINBALL_BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));
 try{
  await page.goto(pathToFileURL(path.join(assets,'index.html')).href);
  await page.waitForFunction(()=>window.assetPreviewReady===true);
  await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode()));});
  assert(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.naturalWidth>0)));
  assert(await page.locator('#music').evaluate(e=>e.paused),'No autoplay');
  await page.locator('#mute').check();await page.locator('#hit').click();
  assert.equal(await page.locator('#score').textContent(),'000050');
  await page.locator('#guides').check();await page.locator('#sample-reset').click();
  assert.equal(await page.locator('#score').textContent(),'000000');
  await page.locator('#stop-audio').click();
  assert(await page.locator('#music').evaluate(e=>e.muted&&e.paused));
  await page.locator('#guides').uncheck();
  if(process.env.PINBALL_ASSET_SCREENSHOT)await page.screenshot({path:process.env.PINBALL_ASSET_SCREENSHOT,fullPage:true});
  const audio=[];
  for(const a of catalog.assets.filter(a=>a.group>=9)){
   const data=await fs.readFile(path.join(assets,a.path));
   const stats=await page.evaluate(async b64=>{
    const context=new AudioContext({sampleRate:44100});
    try{
     const buffer=await context.decodeAudioData(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer);
     let peak=0,energy=0,first=0,last=0,maxStep=0;const seamSteps=[];
     for(let channel=0;channel<buffer.numberOfChannels;channel++){
      const pcm=buffer.getChannelData(channel);first=Math.max(first,Math.abs(pcm[0]));last=Math.max(last,Math.abs(pcm.at(-1)));
      seamSteps.push(Math.abs(pcm[0]-pcm.at(-1)));
      for(let i=0;i<pcm.length;i++){peak=Math.max(peak,Math.abs(pcm[i]));energy+=pcm[i]*pcm[i];if(i)maxStep=Math.max(maxStep,Math.abs(pcm[i]-pcm[i-1]));}
     }
     const pcm=buffer.getChannelData(0),seamStep=Math.abs(pcm[0]-pcm.at(-1));
     return {duration:buffer.duration,frames:buffer.length,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,peak,rms:Math.sqrt(energy/(buffer.length*buffer.numberOfChannels)),first,last,maxStep,seamStep,seamSteps};
    }finally{await context.close();}
   },data.toString('base64'));
   assert(stats.peak>0.01&&stats.peak<.95,a.path+' non-silent and unclipped');
   assert.equal(stats.sampleRate,44100);
   if(a.group===9){assert(stats.first<.001&&stats.last<.001,a.path+' envelope ends at zero');assert.equal(stats.channels,1);}
   else{assert.equal(stats.channels,2);assert.equal(stats.frames,a.loopEndFrame);assert(Math.max(...stats.seamSteps)<.02,'Loop boundary step');assert(Math.max(...stats.seamSteps)<stats.maxStep,'Loop seam stays below musical transients');}
   audio.push({path:a.path,...stats});
  }
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
  assert(await page.locator('#board').evaluate(c=>Math.abs(c.clientWidth/c.clientHeight-864/1064)<.005),'Uniform canvas fit');
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  const report={date:'2026-10-16',browser:browser.version(),checks:['49 unique IDs and matching SHA-256 files','39 images decoded in file:// preview','SVG files self-contained','no automatic audio playback','hit animation, score reset, mute and stop controls','10 audio files decoded in Chromium','PCM peaks below clipping','WAV envelope endpoints near zero','music loop length and boundary continuity','mobile 390px layout without overflow','pageerror=0; requestfailed=0'],audio};
  await fs.writeFile(path.join(assets,'validation.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({mediaFiles:catalog.assets.length,images:39,audio:audio.length,browser:report.browser,pageErrors:errors.length,loop:audio.at(-1)},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
