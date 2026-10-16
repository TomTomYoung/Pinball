const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, scene, step, Composite } = require('./harness.cjs');
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const plain = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ schemaVersion: 1, board: { width: 800, height: 1000 }, objects: [] });
const size = object => {
    const v = object.gameObject.body.vertices;
    return Math.hypot(v[1].x - v[0].x, v[1].y - v[0].y);
};

test('固定壁は重力で落ちず、繰り返し編集・移動しても寸法が一致する', () => {
    const { Wall } = loadApp(), s = scene(), wall = new Wall(s, 200, 200, 100, 20);
    step(s, 120); near(wall.gameObject.y, 200); assert.equal(wall.gameObject.body.isStatic, true);
    wall.width = 200; wall.angle = 30;
    for (let i = 0; i < 25; i++) { wall.setPosition(200 + i, 200); near(size(wall), 200); near(wall.gameObject.width, 200); }
    wall.width = 70; wall.updateProperties(); near(size(wall), 70);
});

test('円の表示半径・物理半径と既定色・反発係数が生成時から一致する', () => {
    const { Bumper, Ball } = loadApp(), s = scene();
    const bumper = new Bumper(s, 200, 200, 40, { score: 0 });
    assert.equal(bumper.score, 0); assert.equal(bumper.gameObject.fillColor, 0x00aaff);
    assert.equal(bumper.gameObject.body.restitution, 1.5);
    for (const radius of [20, 35, 12]) { bumper.radius = radius; for (let i = 0; i < 20; i++) bumper.setPosition(200 + i, 200);
        near(bumper.gameObject.radius, radius); near(bumper.gameObject.body.circleRadius, radius); }
    const ball = new Ball(s, 400, 200, 10);
    near(ball.gameObject.body.circleRadius, 10); near(ball.gameObject.body.friction, 0.005);
    const marker = new Ball(s, 300, 200, 10, { isBallPositionMarker: true });
    assert.ok(!marker.gameObject.body); assert.equal(marker.gameObject.alpha, 0.5);
    step(s, 120); near(marker.gameObject.y, 200);
});

test('色・角度・0の編集が描画と保存に反映される', () => {
    const { Flipper, Wall } = loadApp(), s = scene();
    const wall = new Wall(s, 200, 200, 100, 20); wall.color = '#00ff00'; wall.updateProperties();
    assert.equal(wall.gameObject.fillColor, 0x00ff00);
    const flipper = new Flipper(s, 200, 500, 100, 20, { restAngle: 30, flipAngle: 0 });
    near(flipper.gameObject.angle, 30); assert.equal(flipper.serialize().flipAngle, 0);
    const visual = flipper.gameObject.getBounds(), body = flipper.gameObject.body.bounds;
    near(visual.x, body.min.x); near(visual.y, body.min.y); near(visual.width, body.max.x - body.min.x);
});

test('左右フリッパーは支点を固定して目標角へ動き、解除で戻る', () => {
    for (const isLeft of [true, false]) {
        const { Flipper } = loadApp(), s = scene({ isPlaying: true });
        const f = new Flipper(s, 400, 700, 100, 20, { isLeft, restAngle: isLeft ? 20 : -20 });
        s.matter.world.on('beforeupdate', () => f.drive());
        f.flip(); step(s, 180); near(f.gameObject.angle, isLeft ? -45 : 45, 0.5);
        const b = f.gameObject.body, offset = (isLeft ? -1 : 1) * f.width / 2;
        near(b.position.x + offset * Math.cos(b.angle), 400, 0.5);
        near(b.position.y + offset * Math.sin(b.angle), 700, 0.5);
        f.reset(); step(s, 180); near(f.gameObject.angle, isLeft ? 20 : -20, 0.5);
        f.destroy(); assert.equal(Composite.allConstraints(s.matter.world.localWorld).length, 0);
    }
});

test('フリッパーの振り上げが実際の衝突でボールを上方へ加速する', () => {
    const { Flipper, Ball } = loadApp(), s = scene({ isPlaying: true });
    const f = new Flipper(s, 300, 700, 120, 20);
    const ball = new Ball(s, 390, 680, 10);
    s.matter.world.on('beforeupdate', () => f.drive());
    f.flip(); let minVy = 0;
    for (let i = 0; i < 30; i++) { step(s, 1); minVy = Math.min(minVy, ball.gameObject.body.velocity.y); }
    assert.ok(minVy < -2, `上向きの速度が不足: ${minVy}`);
});

test('保存に外周が混入せず、復元後も外周は3枚だけ', () => {
    const a = loadApp(), e = scene(new a.EditorScene(a.app)); e.board = a.app.board;
    e.objects = a.createBoundaries(e, e.board); e.addObject(new a.Wall(e, 200, 200, 100, 20));
    const data = e.getLayoutData(); assert.equal(data.objects.length, 1);
    e.replaceLayout(data); assert.equal(e.objects.length, 4); assert.equal(e.objects.filter(o => o.isBoundary).length, 3);
    e.removeObject(e.objects[0]); assert.equal(e.objects.length, 4);
});

test('構造不正・未知型・非有限値・負の寸法・複数開始位置を拒否し、盤面と選択を保持する', () => {
    const a = loadApp(), e = scene(new a.EditorScene(a.app)); e.board = a.app.board;
    e.objects = a.createBoundaries(e, e.board); const wall = e.addObject(new a.Wall(e, 200, 200, 100, 20)); e.selectObject(wall);
    const before = JSON.stringify(e.getLayoutData());
    for (const value of ['{', '{}', '{"objects":[{"type":"unknown"}]}', JSON.stringify({ ...empty(), objects: [{ ...wall.serialize(), width: -10 }] })]) {
        a.storage.set('pinballLayout', value); e.loadLayout(); assert.equal(JSON.stringify(e.getLayoutData()), before); assert.equal(e.selectedObject, wall);
    }
    assert.throws(() => a.LayoutCodec.object({ ...wall.serialize(), x: NaN }));
    assert.throws(() => a.LayoutCodec.normalize({ ...empty(), board: undefined }));
    const marker = new a.Ball(e, 200, 200, 10, { isBallPositionMarker: true }).serialize();
    assert.throws(() => a.LayoutCodec.normalize({ ...empty(), objects: [marker, marker] }));
    assert.equal(e.applyEdit(wall, { width: 0 }), false); near(wall.width, 100);
});

test('物体復元中の例外もロールバックし、既存物体と物理ボディ数を保つ', () => {
    const a = loadApp(), e = scene(new a.EditorScene(a.app)); e.board = a.app.board;
    e.objects = a.createBoundaries(e, e.board); const wall = e.addObject(new a.Wall(e, 200, 200, 100, 20)); e.selectObject(wall);
    const before = JSON.stringify(e.getLayoutData());
    const original = a.GameObject.deserialize; let calls = 0;
    a.GameObject.deserialize = (...args) => { if (++calls === 2) throw new Error('test failure'); return original(...args); };
    assert.throws(() => e.replaceLayout({ ...empty(), objects: [wall.serialize(), wall.serialize()] }));
    assert.equal(JSON.stringify(e.getLayoutData()), before); assert.equal(e.selectedObject, wall);
    assert.equal(Composite.allBodies(e.matter.world.localWorld).length, 4);
});

test('保存容量エラーを通知し、保存失敗時に盤面を失わない', () => {
    const a = loadApp(), e = scene(new a.EditorScene(a.app)); e.board = a.app.board; e.objects = a.createBoundaries(e, e.board);
    a.localStorage.setItem = () => { throw new Error('quota exceeded'); };
    assert.doesNotThrow(() => e.saveLayout()); assert.ok(a.messages.at(-1).error); assert.equal(e.objects.length, 3);
});

test('旧形式を検証して取り込み、上書き保存前に元の文字列を保全する', () => {
    const a = loadApp(), e = scene(new a.EditorScene(a.app)); e.board = a.app.board;
    const legacy = { objects: a.createBoundaries(e, e.board).map(o => o.serialize()) };
    a.storage.set('pinballLayout', JSON.stringify(legacy)); e.loadLayout();
    assert.equal(e.objects.length, 3); assert.equal(e.getLayoutData().objects.length, 0);
    e.saveLayout(); assert.equal(a.storage.get('pinballLayoutLegacyBackup'), JSON.stringify(legacy));
    assert.equal(JSON.parse(a.storage.get('pinballLayout')).schemaVersion, 1);
});

test('長い壁と回転形状を形状内で選択し、空白を選ばない', () => {
    const a = loadApp(), e = scene(new a.EditorScene(a.app)); e.board = a.app.board;
    const wall = e.addObject(new a.Wall(e, 300, 300, 400, 20));
    e.handlePointerDown({ x: 490, y: 300 }); assert.equal(e.selectedObject, wall);
    e.handlePointerDown({ x: 300, y: 340 }); assert.equal(e.selectedObject, null);
    wall.angle = 90; wall.updateProperties(); e.handlePointerDown({ x: 300, y: 490 }); assert.equal(e.selectedObject, wall);
    e.handlePointerMove({ x: 350, y: 490, isDown: false }); assert.equal(e.isDragging, false);
});

test('終了後は物理・入力・加点が停止し、終了表示も一回だけ', () => {
    const a = loadApp(), g = scene(new a.GameScene(a.app)); g.init({ layoutData: empty() }); g.create();
    let count = 0; a.app.showGameOver = () => count++;
    g.addScore(70); g.gameOver(); const y = g.ball.gameObject.y;
    step(g, 60); g.addScore(50); g.gameOver();
    near(g.ball.gameObject.y, y); assert.equal(g.score, 70); assert.equal(count, 1); assert.equal(g.input.keyboard.enabled, false);
});

test('停止・再開を4回繰り返しても得点・物体数・イベント数・開始位置が残らない', () => {
    const a = loadApp(), g = new a.GameScene(a.app), s = scene();
    const flipper = new a.Flipper(s, 200, 700, 100, 20).serialize();
    const marker = new a.Ball(s, 111, 222, 14, { isBallPositionMarker: true }).serialize();
    for (let i = 0; i < 4; i++) {
        scene(g); g.init({ layoutData: { ...empty(), objects: i === 0 ? [flipper, marker] : [flipper] } }); g.create();
        assert.equal(g.score, 0); assert.equal(g.scoreText.text, 'Score: 0'); assert.equal(g.objects.length, 5);
        near(g.ball.x, i === 0 ? 111 : 400); near(g.ball.radius, i === 0 ? 14 : 10);
        assert.equal(g.matter.world.listenerCount('collisionstart'), 1);
        g.keys.left.isDown = true; step(g, 20); g.addScore(70);
        // 実PhaserではMatterPluginが先にworldを破棄してnullにする。
        for (const object of g.objects) object.gameObject.destroy();
        g.matter.world.destroy(); g.matter.world = null;
        assert.doesNotThrow(() => g.shutdown()); assert.equal(g.objects.length, 0);
    }
});

test('サイズ・色・反発・得点0・角度0を含む保存往復が同一になる', () => {
    const a = loadApp(), s = scene();
    const objects = [new a.Wall(s, 200, 200, 120, 20, { angle: 15 }),
        new a.Bumper(s, 300, 300, 40, { score: 0 }), new a.Flipper(s, 400, 800, 100, 20, { isLeft: false, flipAngle: 0 }),
        new a.Ball(s, 400, 150, 18, { isBallPositionMarker: true, color: '#aa00ff', restitution: 0.3 })];
    const first = a.LayoutCodec.normalize({ ...empty(), objects: objects.map(o => o.serialize()) });
    const second = a.LayoutCodec.normalize({ ...first, objects: first.objects.map(o => a.GameObject.deserialize(s, o).serialize()) });
    assert.deepEqual(plain(second), plain(first));
});
