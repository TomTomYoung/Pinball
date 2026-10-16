const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
let browser, server, url;
const html = fs.readFileSync(path.join(__dirname, '../index.html'));
const phaser = fs.readFileSync(require.resolve('phaser/dist/phaser.min.js'));

before(async () => {
    server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
    browser = await chromium.launch({ headless: true, ...(process.env.PINBALL_BROWSER_EXECUTABLE ? { executablePath: process.env.PINBALL_BROWSER_EXECUTABLE } : {}) });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve) ?? resolve()); });

async function pageFor(t, viewport = { width: 1280, height: 900 }) {
    const context = await browser.newContext({ viewport });
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js', route => route.fulfill({ contentType: 'application/javascript', body: phaser }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'ブラウザ例外がないこと'); });
    await page.goto(url);
    await page.waitForFunction(() => typeof pinballGame !== 'undefined' && pinballGame.mode === 'edit');
    await page.click('#gallery-edit-button');
    return page;
}
async function edit(page, name, value) {
    const input = page.locator(`#properties-form input[name="${name}"]`);
    await input.fill(String(value)); await input.press('Tab');
}
async function layout(page) { return page.evaluate(() => pinballGame.editor.getLayoutData()); }
async function setupLayout(page) {
    await page.click('#add-wall-button'); await edit(page, 'x', 120); await edit(page, 'y', 500); await edit(page, 'width', 180); await edit(page, 'angle', 25);
    await page.click('#add-bumper-button'); await edit(page, 'x', 400); await edit(page, 'y', 300); await edit(page, 'radius', 35); await edit(page, 'score', 0);
    await page.click('#add-flipper-button'); await edit(page, 'x', 270); await edit(page, 'y', 800);
    await page.click('#add-flipper-button'); await page.selectOption('select[name="isLeft"]', 'false'); await edit(page, 'x', 530); await edit(page, 'y', 800);
    await page.click('#add-ball-button'); await edit(page, 'x', 400); await edit(page, 'y', 150); await edit(page, 'radius', 12);
}

test('初回起動・追加・入力検証・色変更・繰り返し寸法変更', async t => {
    const page = await pageFor(t);
    assert.equal(await page.locator('#object-select option').count(), 0);
    assert.equal(await page.evaluate(() => pinballGame.editor.objects.filter(o => o.isBoundary && o.gameObject.body.isStatic).length), 3);
    await page.click('#add-wall-button'); await edit(page, 'width', 200);
    for (let i = 0; i < 5; i++) await edit(page, 'x', 200 + i * 10);
    const size = await page.evaluate(() => { const w = pinballGame.editor.selectedObject; return { model: w.width, visual: w.gameObject.width, body: w.gameObject.body.bounds.max.x - w.gameObject.body.bounds.min.x }; });
    assert.deepEqual(size, { model: 200, visual: 200, body: 200 });
    await edit(page, 'width', 0); assert.equal(await page.locator('input[name="width"]').inputValue(), '200');
    await edit(page, 'x', ''); assert.equal(await page.locator('input[name="x"]').inputValue(), '240');
    await page.locator('input[name="color"]').evaluate(input => { input.value = '#00ff00'; input.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(await page.evaluate(() => pinballGame.editor.selectedObject.gameObject.fillColor), 0x00ff00);
});

test('全種の保存・再読込で形状・値と盤面サイズが保持される', async t => {
    const page = await pageFor(t); await setupLayout(page);
    const before = await layout(page);
    await page.click('#save-button');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pinballLayout')).objects.length), 5);
    await page.reload(); await page.waitForFunction(() => pinballGame.mode === 'edit'); await page.click('#gallery-edit-button'); await page.click('#load-button');
    assert.deepEqual(await layout(page), before);
    assert.equal(await page.evaluate(() => pinballGame.editor.objects.length), 8);
    assert.equal(await page.evaluate(() => pinballGame.editor.objects.find(o => o.type === 'ball').gameObject.body), null);
});

test('実シーンの再プレイ4回と編集復帰、キーボード左右操作', async t => {
    const page = await pageFor(t); await setupLayout(page); const before = await layout(page);
    await page.click('#test-button');
    for (let i = 0; i < 4; i++) {
        await page.waitForFunction(() => pinballGame.mode === 'play');
        const state = await page.evaluate(() => {
            const g = pinballGame.play; g.matter.world.pause();
            return { score: g.score, label: g.scoreText.text, count: g.objects.length,
                events: g.matter.world.listenerCount('collisionstart'), editorVisible: pinballGame.editor.sys.isVisible(), radius: g.ball.radius };
        });
        assert.deepEqual(state, { score: 0, label: 'Score: 0', count: 8, events: 1, editorVisible: false, radius: 12 });
        if (i === 0) {
            await page.evaluate(() => pinballGame.play.matter.world.resume());
            await page.keyboard.down('z');
            await page.waitForFunction(() => pinballGame.play.objects.find(o => o.type === 'flipper' && o.isLeft).gameObject.angle < -30);
            await page.keyboard.up('z');
            await page.keyboard.down('/');
            await page.waitForFunction(() => pinballGame.play.objects.find(o => o.type === 'flipper' && !o.isLeft).gameObject.angle > 30);
            await page.keyboard.up('/');
        }
        await page.evaluate(() => { const g = pinballGame.play; g.addScore(70); g.ball.gameObject.setPosition(400, 1200); g.update(); g.addScore(50); });
        assert.equal(await page.locator('#final-score').textContent(), '70');
        assert.equal(await page.evaluate(() => pinballGame.play.matter.world.enabled), false);
        if (i < 3) await page.click('#restart-button');
    }
    await page.click('#stop-button'); await page.waitForFunction(() => pinballGame.mode === 'edit');
    assert.equal(await page.locator('#game-over').isVisible(), false); assert.deepEqual(await layout(page), before);
    // 開始位置を消してから再プレイしても前回の座標やサイズが残らない。
    await page.selectOption('#object-select', '7'); await page.click('#delete-object-button');
    await page.click('#test-button'); await page.waitForFunction(() => pinballGame.mode === 'play');
    assert.deepEqual(await page.evaluate(() => ({ x: pinballGame.play.ball.x, y: pinballGame.play.ball.y, radius: pinballGame.play.ball.radius })), { x: 400, y: 1000 / 3, radius: 10 });
});

test('実衝突で得点0を維持し、通常得点は一回だけ加算する', async t => {
    const page = await pageFor(t);
    await page.click('#add-bumper-button'); await edit(page, 'x', 400); await edit(page, 'y', 300); await edit(page, 'score', 0);
    await page.click('#test-button'); await page.waitForFunction(() => pinballGame.mode === 'play');
    await page.evaluate(() => {
        const g = pinballGame.play; window.testHits = 0;
        g.matter.world.on('collisionstart', event => {
            if (event.pairs.some(p => [p.bodyA, p.bodyB].some(b => b.gameObject?.userData?.type === 'bumper'))) window.testHits++;
        });
        g.ball.gameObject.setPosition(400, 260); g.ball.setVelocity(0, 2);
    });
    await page.waitForFunction(() => window.testHits > 0);
    assert.equal(await page.evaluate(() => pinballGame.play.score), 0);
    await page.evaluate(() => {
        const g = pinballGame.play; g.objects.find(o => o.type === 'bumper').score = 75;
        g.ball.gameObject.setPosition(400, 200); g.ball.setVelocity(0, 0);
    });
    await page.waitForFunction(() => window.testHits >= 2);
    await page.evaluate(() => pinballGame.play.matter.world.pause());
    assert.equal(await page.evaluate(() => pinballGame.play.score), 75);
});

test('リサイズ後も縦横比・盤面座標を維持し、壁の端を選択してドラッグできる', async t => {
    const page = await pageFor(t); await page.click('#add-wall-button'); await edit(page, 'x', 300); await edit(page, 'width', 400);
    const before = await layout(page);
    await page.setViewportSize({ width: 640, height: 900 });
    await page.waitForFunction(() => document.querySelector('canvas').getBoundingClientRect().height <= 480);
    const box = await page.locator('canvas').boundingBox();
    assert.ok(Math.abs(box.width / box.height - 0.8) < 0.001); assert.deepEqual(await layout(page), before);
    const point = (x, y) => ({ x: box.x + x * box.width / 800, y: box.y + y * box.height / 1000 });
    let p = point(700, 700); await page.mouse.click(p.x, p.y);
    assert.equal(await page.evaluate(() => pinballGame.editor.selectedObject), null);
    p = point(490, 200); await page.mouse.move(p.x, p.y); await page.mouse.down();
    p = point(510, 220); await page.mouse.move(p.x, p.y, { steps: 5 }); await page.mouse.up();
    const pos = await page.evaluate(() => ({ x: pinballGame.editor.selectedObject.x, y: pinballGame.editor.selectedObject.y, width: pinballGame.editor.selectedObject.width }));
    assert.ok(Math.abs(pos.x - 320) < 2); assert.ok(Math.abs(pos.y - 220) < 2); assert.equal(pos.width, 400);
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.deepEqual((await layout(page)).board, before.board);
});

test('不正な保存データと容量不足で盤面を失わない', async t => {
    const page = await pageFor(t); await page.click('#add-wall-button'); const before = await layout(page);
    for (const invalid of ['{}', '{', '{"objects":[{"type":"unknown"}]}']) {
        await page.evaluate(text => localStorage.setItem('pinballLayout', text), invalid);
        await page.click('#load-button'); assert.deepEqual(await layout(page), before);
        assert.equal(await page.locator('#status-message').getAttribute('class'), 'error');
        assert.equal(await page.evaluate(() => !!pinballGame.editor.selectedObject.gameObject.scene), true);
    }
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('容量不足', 'QuotaExceededError'); }; });
    await page.click('#save-button'); assert.deepEqual(await layout(page), before);
    assert.match(await page.locator('#status-message').textContent(), /保存できません/);
});

test('旧外周の置換を選択でき、名前だけが同じユーザー壁は保持する', async t => {
    const page = await pageFor(t);
    const legacy = await page.evaluate(() => ({ objects: pinballGame.editor.objects.map(o => o.serialize()) }));
    legacy.objects.push({ ...legacy.objects[0], x: 150, y: 200, width: 100, height: 20 });
    await page.evaluate(data => localStorage.setItem('pinballLayout', JSON.stringify(data)), legacy);
    page.once('dialog', dialog => dialog.dismiss()); await page.click('#load-button');
    assert.equal((await layout(page)).objects.length, 4);
    page.once('dialog', dialog => dialog.accept()); await page.click('#load-button');
    assert.equal((await layout(page)).objects.length, 1); assert.equal((await layout(page)).objects[0].name, '左壁');
    await page.click('#save-button');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pinballLayoutLegacyBackup'))), legacy);
});

test('HTMLを直接開いても追加・保存・読込ができる', async t => {
    const page = await pageFor(t);
    await page.goto(require('node:url').pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction(() => typeof pinballGame !== 'undefined' && pinballGame.mode === 'edit');
    await page.click('#gallery-edit-button');
    await page.click('#add-bumper-button'); await edit(page, 'radius', 28);
    const before = await layout(page); await page.click('#save-button');
    await page.click('#delete-object-button'); await page.click('#load-button');
    assert.deepEqual(await layout(page), before);
});
