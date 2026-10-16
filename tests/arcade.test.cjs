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

test('HTML単体から全10台を選択・発射し、終了から次の台へ進んでもボディとリスナーが増えない', async t => {
    const p = await open(t);
    assert.equal(await p.locator('[data-play]').count(), 10);
    assert.equal(await p.locator('.table-preview svg').count(), 10);
    assert.equal(await p.evaluate(() => pinballGame.audio.context), null);
    const ids = await p.evaluate(() => PINBALL_TABLES.map(t => t.id));
    await play(p, ids[0]);
    let textureCount;
    for (let i = 0; i < ids.length; i++) {
        await p.waitForFunction(id => pinballGame.mode === 'play' && pinballGame.play.table.id === id, ids[i]);
        const state = await p.evaluate(() => {
            const g = pinballGame.play;
            return { balls: g.ballsLeft, waiting: g.waitingLaunch, score: g.score, listeners: g.matter.world.listenerCount('collisionstart'),
                textures: pinballGame.game.textures.getTextureKeys().length, bodies: g.matter.world.localWorld.bodies.length, objects: g.objects.length,
                views: g.skin.views.size, editor: pinballGame.editor.sys.isVisible(), constraints: g.matter.world.localWorld.constraints.length,
                flippers: g.objects.filter(o => o.type === 'flipper').length };
        });
        textureCount ??= state.textures;
        assert.equal(state.balls, 3); assert(state.waiting); assert.equal(state.score, 0); assert.equal(state.listeners, 1);
        assert.equal(state.textures, textureCount); assert.equal(state.bodies, state.objects); assert.equal(state.views, state.objects);
        assert.equal(state.constraints, state.flippers); assert(!state.editor);
        await p.click('#launch-button');
        await p.waitForFunction(() => !pinballGame.play.waitingLaunch && pinballGame.play.ball.gameObject.y < 100);
        await p.evaluate(() => { pinballGame.play.matter.world.pause(); pinballGame.play.gameOver(); });
        assert(await p.locator('#round-result').isVisible());
        await p.click('#next-table-button');
    }
    await p.waitForFunction(() => pinballGame.play.table.id === 'classic' && pinballGame.mode === 'play');
    await p.click('#tables-button'); await p.waitForFunction(() => pinballGame.mode === 'edit');
    assert(await p.locator('#table-gallery').isVisible());
    assert.equal(await p.evaluate(() => pinballGame.play.objects.length), 0);
});

test('3球の発射待ち・累積得点・終了停止・再挑戦を画面とキーから操作できる', async t => {
    const p = await open(t); await play(p, 'classic');
    for (let ball = 3; ball >= 1; ball--) {
        assert.equal(await p.evaluate(() => pinballGame.play.ballsLeft), ball);
        assert(await p.locator('#launch-prompt').isVisible());
        await p.keyboard.press('Space');
        await p.waitForFunction(() => !pinballGame.play.waitingLaunch);
        await p.evaluate(() => { pinballGame.play.matter.world.pause(); pinballGame.play.addScore(100); });
        await drain(p);
        assert.equal(await p.evaluate(() => pinballGame.play.score), (4 - ball) * 100);
    }
    assert.equal(await p.evaluate(() => pinballGame.mode), 'over');
    assert.equal(await p.locator('#final-score').textContent(), '300');
    assert.equal(await p.evaluate(() => pinballGame.play.input.keyboard.enabled), false);
    await p.keyboard.press('Enter'); assert.equal(await p.evaluate(() => pinballGame.mode), 'over');
    await p.click('#restart-button'); await p.waitForFunction(() => pinballGame.mode === 'play');
    assert.deepEqual(await p.evaluate(() => [pinballGame.play.ballsLeft, pinballGame.play.score, pinballGame.play.hitBumpers.size]), [3, 0, 0]);
    await p.keyboard.press('Enter'); await p.waitForFunction(() => !pinballGame.play.waitingLaunch);
    await p.keyboard.down('z'); await p.keyboard.down('/');
    await p.waitForFunction(() => pinballGame.play.objects.filter(o => o.type === 'flipper').every(o => o.isFlipping));
    await p.evaluate(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await p.evaluate(() => pinballGame.play.keys.z.isDown), false);
    await p.keyboard.up('z'); await p.keyboard.up('/');
});

test('台選択・再挑戦・次の台・編集復帰で未保存の編集盤面と保存済みデータを保持する', async t => {
    const p = await open(t); await p.click('#gallery-edit-button');
    const original = await p.evaluate(() => {
        const e = pinballGame.editor;
        e.replaceLayout({ schemaVersion: 1, board: { width: 640, height: 900 }, objects: [{ type: 'bumper', x: 234, y: 345, radius: 38, score: 7, name: '未保存のバンパー' }] });
        localStorage.setItem('pinballLayout', 'existing saved text');
        e.selectObject(e.objects.find(o => o.type === 'bumper'));
        return e.getLayoutData();
    });
    await p.click('#tables-button'); await play(p, 'crossfire');
    await p.evaluate(() => pinballGame.play.gameOver()); await p.click('#restart-button');
    await p.waitForFunction(() => pinballGame.mode === 'play');
    await p.evaluate(() => pinballGame.play.gameOver()); await p.click('#next-table-button');
    await p.waitForFunction(() => pinballGame.mode === 'play' && pinballGame.play.table.id === 'slalom');
    await p.click('#stop-button'); await p.waitForFunction(() => pinballGame.mode === 'edit');
    assert.deepEqual(await p.evaluate(() => pinballGame.editor.getLayoutData()), original);
    assert.deepEqual(await p.evaluate(() => pinballGame.board), original.board);
    assert.equal(await p.evaluate(() => pinballGame.editor.selectedObject.name), '未保存のバンパー');
    assert.equal(await p.evaluate(() => localStorage.getItem('pinballLayout')), 'existing saved text');
    assert.equal(await p.evaluate(() => pinballGame.audio.nodes.size), 0);
});

test('台別BESTは再読込で残り、保存禁止環境でも遊べる', async t => {
    const p = await open(t); await play(p, 'diamond');
    await p.evaluate(() => { pinballGame.play.addScore(5000); pinballGame.play.gameOver(); });
    assert.match(await p.locator('#round-result').textContent(), /目標達成.*BEST更新/);
    await p.reload(); await p.waitForFunction(() => pinballGame.mode === 'edit');
    assert.equal(await p.evaluate(() => pinballGame.arcade.best('diamond')), 5000);
    assert.match(await p.locator('.table-card').filter({ has: p.locator('[data-play="diamond"]') }).textContent(), /5,000/);
    const q = await open(t, {}, () => { Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); }; });
    await play(q, 'classic'); await q.evaluate(() => { pinballGame.play.addScore(200); pinballGame.play.gameOver(); });
    assert.match(await q.locator('#round-result').textContent(), /この画面内/);
    await q.click('#restart-button'); await q.waitForFunction(() => pinballGame.mode === 'play');
});

test('390px幅で10台と操作ボタンが収まり、左右同時タッチとキャンセルを扱える', async t => {
    const p = await open(t, { viewport: { width: 390, height: 844 }, hasTouch: true });
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await play(p, 'crossfire'); await p.click('#launch-button');
    for (const id of ['left-control', 'right-control', 'launch-button', 'nudge-button']) {
        const box = await p.locator('#' + id).boundingBox();
        assert(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
    }
    const cdp = await p.context().newCDPSession(p);
    const left = await p.locator('#left-control').boundingBox(), right = await p.locator('#right-control').boundingBox();
    const points = [{ x: left.x + left.width / 2, y: left.y + left.height / 2, id: 1 }, { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
    await p.waitForFunction(() => pinballGame.play.objects.filter(o => o.type === 'flipper').every(o => o.isFlipping));
    assert.deepEqual(await p.evaluate(() => [pinballGame.touch.left.size, pinballGame.touch.right.size]), [1, 1]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await p.waitForFunction(() => !pinballGame.touch.left.size && !pinballGame.touch.right.size);
    const box = await p.locator('canvas').boundingBox(); assert(Math.abs(box.width / box.height - .8) < .001);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
