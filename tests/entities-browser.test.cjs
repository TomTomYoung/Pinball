const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
let browser, folder, url, phaser;
before(async () => {
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pinball-arcade-'));
    await fs.copyFile(path.resolve(__dirname, '../index.html'), path.join(folder, 'index.html'));
    url = pathToFileURL(path.join(folder, 'index.html')).href;
    phaser = await fs.readFile(require.resolve('phaser/dist/phaser.min.js'));
    browser = await chromium.launch({ headless: true, ...(process.env.PINBALL_BROWSER_EXECUTABLE ? { executablePath: process.env.PINBALL_BROWSER_EXECUTABLE } : {}) });
});
after(async () => { await browser?.close(); await fs.rm(folder, { recursive: true, force: true }); });
async function open(t, options = {}, init) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js', r => r.fulfill({ contentType: 'application/javascript', body: phaser }));
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => requests.push(r.url()));
    t.after(async () => {
        await context.close(); assert.deepEqual(errors, []);
        assert(requests.every(u => u === url || u.startsWith('data:') || u === 'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js'));
    });
    if (init) await page.addInitScript(init);
    await page.goto(url); await page.waitForFunction(() => typeof pinballGame !== 'undefined' && pinballGame.mode === 'edit');
    return page;
}
async function play(page, id) {
    await page.click(`[data-play="${id}"]`);
    await page.waitForFunction(id => pinballGame.mode === 'play' && pinballGame.play.table.id === id, id);
}
async function drain(page) {
    await page.evaluate(() => { const g = pinballGame.play; g.ball.setPosition(400, 1100); g.update(); });
}


test('定番10台と新機能10台を絞り込み、選択後も既存の編集内容を保つ',async t=>{
 const p=await open(t);await p.click('[data-filter="lab"]');assert.equal(await p.locator('[data-play]').count(),10);
 assert((await p.locator('[data-play]').evaluateAll(elements=>elements.map(e=>e.dataset.play))).every(id=>id.startsWith('lab-')));
 await p.click('[data-filter="classic"]');assert.equal(await p.locator('[data-play]').count(),10);
 await p.click('[data-filter="all"]');assert.equal(await p.locator('[data-play]').count(),30);
});

test('37仕掛けプリセットを編集・保存・再読込でき、不正な挙動設定で元の物体を失わない',async t=>{
 const p=await open(t);await p.click('#gallery-edit-button');
 const keys=await p.locator('#feature-preset option').evaluateAll(items=>items.map(i=>i.value));assert.equal(keys.length,37);
 for(const key of keys){await p.selectOption('#feature-preset',key);await p.click('#add-feature-button');assert(!await p.locator('#status-message').evaluate(e=>e.classList.contains('error')),key);}
 const before=await p.evaluate(()=>pinballGame.editor.getLayoutData());assert.equal(before.schemaVersion,2);assert.equal(before.objects.length,38);
 await p.locator('.entity-settings summary').click();const editor=p.getByLabel('挙動設定JSON');await editor.fill('{"version":1,"rules":[{"on":"tick","effects":[{"op":"eval"}]}]}');await p.getByRole('button',{name:'挙動設定を適用'}).click();
 assert.match(await p.locator('#status-message').textContent(),/未対応作用/);assert.deepEqual(await p.evaluate(()=>pinballGame.editor.getLayoutData()),before);
 await p.click('#save-button');await p.reload();await p.waitForFunction(()=>pinballGame.mode==='edit');await p.click('#gallery-edit-button');await p.click('#load-button');
 assert.deepEqual(await p.evaluate(()=>pinballGame.editor.getLayoutData()),before);assert.equal(await p.evaluate(()=>pinballGame.editor.objects.filter(o=>o.isBoundary).length),3);
});

test('分裂球の全滅後だけ次球へ進み、再挑戦を重ねても残骸やリスナーを残さない',async t=>{
 const p=await open(t);await play(p,'lab-prisms');
 for(let round=0;round<3;round++){
  await p.click('#launch-button');await p.evaluate(()=>{const g=pinballGame.play,o=g.objects.find(o=>o.entity?.prototype==='splitter');g.ball.gameObject.setPosition(o.x,o.y-38);g.ball.setVelocity(0,4);});
  await p.waitForFunction(()=>pinballGame.play.runtime.liveBalls().length===3);await p.evaluate(()=>pinballGame.play.matter.world.pause());
  await p.evaluate(()=>{const g=pinballGame.play;g.runtime.liveBalls()[0].gameObject.setPosition(400,1100);g.update();});assert.equal(await p.evaluate(()=>pinballGame.play.ballsLeft),3-round);
  await p.evaluate(()=>{const g=pinballGame.play;for(const b of g.runtime.liveBalls())b.gameObject.setPosition(400,1100);g.update();});
 }
 assert.equal(await p.evaluate(()=>pinballGame.mode),'over');
 for(let i=0;i<3;i++){
  await p.click('#restart-button');await p.waitForFunction(()=>pinballGame.mode==='play');
  const state=await p.evaluate(()=>{const g=pinballGame.play;return{balls:g.balls.length,live:g.runtime.liveBalls().length,records:g.runtime.records.size,objects:g.objects.length,bodies:g.matter.world.localWorld.bodies.length,listeners:g.matter.world.listenerCount('afterupdate')};});
  assert.equal(state.balls,1);assert.equal(state.live,1);assert.equal(state.records,state.objects);assert.equal(state.bodies,state.objects);assert.equal(state.listeners,1);await p.evaluate(()=>pinballGame.play.gameOver());
 }
});

test('390px幅でチャージ発射のタッチ解除と取消を区別し、連打でも充填できる',async t=>{
 const p=await open(t,{viewport:{width:390,height:844},hasTouch:true});await play(p,'lab-launcher');
 await p.waitForFunction(()=>pinballGame.game.canvas.getBoundingClientRect().width>380);
 const canvas=await p.locator('canvas').boundingBox();assert(Math.abs(canvas.width/canvas.height-.8)<.01);
 await p.click('#launch-button');
 const capture=async()=>{await p.evaluate(()=>{const g=pinballGame.play,o=g.objects.find(o=>o.entity?.prototype==='launcher');g.ball.runtime.captureUntil=0;g.ball.gameObject.setPosition(o.x,o.y-38);g.ball.setVelocity(0,3);});await p.waitForFunction(()=>!!pinballGame.play.ball.runtime.heldBy);};await capture();
 const cdp=await p.context().newCDPSession(p),box=await p.locator('#action-control').boundingBox();assert(box.x>=0&&box.x+box.width<=390);assert(box.y+box.height<=844);
 const points=[{x:box.x+box.width/2,y:box.y+box.height/2,id:1}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await p.waitForFunction(()=>pinballGame.play.ball.runtime.heldBy.runtime.charge>15);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert(await p.evaluate(()=>!!pinballGame.play.ball.runtime.heldBy));assert.equal(await p.evaluate(()=>pinballGame.play.ball.runtime.heldBy.runtime.charge),0);
 await p.keyboard.press('e');await p.keyboard.press('e');await p.waitForFunction(()=>pinballGame.play.ball.runtime.heldBy.runtime.charge>=20);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await p.waitForFunction(()=>pinballGame.play.ball.runtime.heldBy.runtime.charge>60);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>!pinballGame.play.ball.runtime.heldBy);
 assert.equal(await p.evaluate(()=>pinballGame.actionDown),false);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('チャージフリッパーのタッチ取消は発射せず、通常の解除では振る',async t=>{
 const p=await open(t,{viewport:{width:390,height:844},hasTouch:true});await play(p,'lab-charge-swing');await p.click('#launch-button');
 const cdp=await p.context().newCDPSession(p),box=await p.locator('#left-control').boundingBox(),points=[{x:box.x+box.width/2,y:box.y+box.height/2,id:2}];
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await p.waitForFunction(()=>pinballGame.play.objects.find(o=>o.type==='flipper'&&o.isLeft).runtime.chargeLevel>.35);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await p.waitForFunction(()=>{const f=pinballGame.play.objects.find(o=>o.type==='flipper'&&o.isLeft);return f.runtime.chargeLevel===0&&!f.isFlipping;});
 assert.equal(await p.evaluate(()=>pinballGame.play.objects.find(o=>o.type==='flipper'&&o.isLeft).runtime.flipperState),'ready');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await p.waitForFunction(()=>pinballGame.play.objects.find(o=>o.type==='flipper'&&o.isLeft).runtime.chargeLevel>.3);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>pinballGame.play.objects.find(o=>o.type==='flipper'&&o.isLeft).isFlipping);
});
