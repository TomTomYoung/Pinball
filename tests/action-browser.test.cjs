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


async function screenshot(page,name){if(process.env.PINBALL_QA_DIR){await fs.mkdir(process.env.PINBALL_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PINBALL_QA_DIR,name+'.png'),fullPage:true});}}

test('アクション10台を絞り込み、縮小画面でも説明と演出設定を操作できる',async t=>{
 const p=await open(t,{viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
 await p.click('[data-filter="action"]');assert.equal(await p.locator('[data-play]').count(),10);
 assert((await p.locator('[data-play]').evaluateAll(xs=>xs.map(x=>x.dataset.play))).every(id=>id.startsWith('action-')));
 await play(p,'action-onslaught');assert.equal(await p.evaluate(()=>pinballGame.reduceEffects),true);
 await p.locator('#audio-settings summary').click();await p.uncheck('#reduce-effects');assert.equal(await p.evaluate(()=>pinballGame.reduceEffects),false);
 await p.locator('#audio-settings summary').click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const id of ['left-control','right-control','action-control']){const b=await p.locator('#'+id).boundingBox();assert(b.x>=0&&b.x+b.width<=390&&b.y+b.height<=844);}
 await screenshot(p,'action-mobile');
});

test('巨大化装置との接触で図形・物理・スキンが一致し、編集定義を変えない',async t=>{
 const p=await open(t);await play(p,'action-giant');
 const before=await p.evaluate(()=>JSON.stringify(pinballGame.play.layoutData));await p.click('#launch-button');
 await p.evaluate(()=>{const g=pinballGame.play;g.ball.gameObject.setPosition(400,215);g.ball.setVelocity(0,3);});
 await p.waitForFunction(()=>pinballGame.play.ball.radius===24);
 await p.evaluate(()=>pinballGame.play.matter.world.pause());
 const state=await p.evaluate(()=>{const g=pinballGame.play,b=g.ball,v=g.skin.views.get(b);return{radius:b.radius,body:b.gameObject.body.circleRadius,visible:v.container.visible,definition:JSON.stringify(g.layoutData),graphics:!!g.runtime.action.graphics,fx:g.runtime.action.effects.length};});
 assert.equal(state.radius,state.body);assert(state.visible&&state.graphics&&state.fx>0);assert.equal(state.definition,before);
 await screenshot(p,'action-giant');
});

test('予告から敵が出現し、電撃を描画し、編集復帰で生成物と演出を破棄する',async t=>{
 const p=await open(t);await play(p,'action-spark');await p.click('#launch-button');
 await p.waitForFunction(()=>pinballGame.play.runtime.action.pending.length>0);
 await p.waitForFunction(()=>pinballGame.play.objects.some(o=>o.runtime?.generated));
 const s=await p.evaluate(()=>{const g=pinballGame.play;g.matter.world.pause();const o=g.objects.find(o=>o.entity?.id==='link-0');g.runtime.action.projectileHit(g.ball,o,'spark');g.runtime.action.draw();window.oldAction=g.runtime.action;return{generated:g.objects.filter(o=>o.runtime?.generated).length,effect:g.runtime.action.effects.some(e=>e.kind==='lightning'),bodies:g.matter.world.localWorld.bodies.length,objects:g.objects.length};});
 assert(s.generated>0&&s.generated<=3&&s.effect);assert.equal(s.bodies,s.objects);await screenshot(p,'action-spark');
 await p.click('#stop-button');await p.waitForFunction(()=>pinballGame.mode==='edit');
 assert.deepEqual(await p.evaluate(()=>[window.oldAction.graphics,window.oldAction.pending.length,window.oldAction.effects.length,window.oldAction.trails.size]),[null,0,0,0]);
});

test('突撃兵の侵入は残球3で終了理由を表示し、再挑戦で初期状態に戻る',async t=>{
 const p=await open(t);await play(p,'action-defense');await p.click('#launch-button');
 await p.evaluate(()=>{const g=pinballGame.play;g.matter.world.pause();const enemy=g.objects.find(o=>o.entity?.id==='raider');enemy.gameObject.setPosition(400,930);g.runtime.afterStep();});
 await p.waitForFunction(()=>pinballGame.mode==='over');assert.equal(await p.evaluate(()=>pinballGame.play.ballsLeft),3);assert.match(await p.locator('#round-result').textContent(),/敵がゲームオーバーエリアへ侵入/);
 assert.equal(await p.evaluate(()=>pinballGame.play.input.keyboard.enabled),false);await screenshot(p,'action-breach');
 await p.click('#restart-button');await p.waitForFunction(()=>pinballGame.mode==='play');
 assert.deepEqual(await p.evaluate(()=>{const g=pinballGame.play;return[g.ballsLeft,g.score,g.waitingLaunch,g.objects.find(o=>o.entity?.id==='raider').runtime.health,g.runtime.action.pending.length];}),[3,0,true,20,0]);
});
