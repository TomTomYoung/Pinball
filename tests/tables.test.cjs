const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, scene, step, Composite } = require('./harness.cjs');

function gameFor(a, table) {
    const g = scene(new a.GameScene(a.app));
    g.init({ layoutData: table.layout, tableId: table.id }); g.create(); g.time.now = 0;
    return g;
}

test('30台は異なる配置で、開始位置が物体に重ならず、旧10台はschema-1互換を保つ', () => {
    const a = loadApp();
    assert.equal(a.PINBALL_TABLES.length, 30);
    assert.equal(new Set(a.PINBALL_TABLES.map(t => t.id)).size, 30);
    assert.equal(new Set(a.PINBALL_TABLES.map(t => JSON.stringify(t.layout.objects))).size, 30);
    for (const table of a.PINBALL_TABLES) {
        const g = gameFor(a, table), ball = g.ball.gameObject.body;
        assert.equal(g.ballsLeft, 3); assert(g.waitingLaunch);
        assert.equal(g.objects.filter(o => o.type === 'ball').length, 1);
        for (const o of g.objects) {
            if (o === g.ball) continue;
            const bounds = o.gameObject.body.bounds;
            assert(!(ball.position.x + 10 > bounds.min.x && ball.position.x - 10 < bounds.max.x &&
                ball.position.y + 10 > bounds.min.y && ball.position.y - 10 < bounds.max.y), table.id + ': clear launch');
        }
        assert.match(new a.TableArcade(a.app).preview(table), /viewBox="0 0 800 1000"/);
        g.shutdown();
    }
});

for (let index = 0; index < 10; index++) test(`台${index + 1}: 3球の自然落下と、実接触による下段からの打ち返し`, () => {
    const a = loadApp(), table = a.PINBALL_TABLES[index], g = gameFor(a, table);
    const counts = { bodies: Composite.allBodies(g.matter.world.localWorld).length, hinges: Composite.allConstraints(g.matter.world.localWorld).length };
    for (let frame = 0; frame < 60 * 90 && !g.isGameOver; frame++) {
        g.time.now = frame * 1000 / 60;
        if (g.waitingLaunch) g.launchBall();
        step(g, 1); g.update();
        const ball = g.ball.gameObject;
        assert(Number.isFinite(ball.x) && Number.isFinite(ball.y), table.id + ': finite position');
        assert(ball.x > 0 && ball.x < 800, table.id + ': no side-wall tunnelling');
        assert.equal(Composite.allBodies(g.matter.world.localWorld).length, counts.bodies);
        assert.equal(Composite.allConstraints(g.matter.world.localWorld).length, counts.hinges);
    }
    assert(g.isGameOver, table.id + ': does not get stuck without input'); assert.equal(g.ballsLeft, 0);
    g.shutdown();
    const shot = gameFor(a, table); shot.launchBall();
    const f = shot.objects.find(o => o.type === 'flipper' && o.isLeft), angle = f.restAngle * Math.PI / 180;
    shot.ball.setPosition(f.x + f.width * .8 * Math.cos(angle), f.y + f.width * .8 * Math.sin(angle) - 22);
    shot.ball.setVelocity(0, 1); shot.keys.left.isDown = true;
    let peak = 1000;
    for (let i = 0; i < 90; i++) { step(shot, 1); peak = Math.min(peak, shot.ball.gameObject.y); }
    assert(peak < 700, table.id + ': a timed flipper hit reaches the playfield');
    assert(shot.score > 0, table.id + ': actual collision scores');
    shot.shutdown();
});

test('全バンパーの実接触は1ゲームにつき一度だけ1000点、次球に進行と得点を保持する', () => {
    const a = loadApp(), g = gameFor(a, a.PINBALL_TABLES[0]); g.launchBall();
    const bumpers = g.objects.filter(o => o.type === 'bumper');
    const hit = bumper => {
        g.ball.setPosition(bumper.x, bumper.y - bumper.radius - 20); g.ball.setVelocity(0, 2);
        for (let i = 0; i < 8; i++) step(g, 1);
    };
    for (const b of bumpers) hit(b);
    assert.equal(g.score, bumpers.reduce((sum, b) => sum + b.score, 0) + 1000);
    assert.equal(g.hitBumpers.size, bumpers.length); assert(g.sweepAwarded);
    const previous = g.score; hit(bumpers[0]); assert.equal(g.score, previous + bumpers[0].score);
    const beforeDrain = g.score;
    g.ball.setPosition(400, 1100); g.update();
    assert.equal(g.ballsLeft, 2); assert(g.waitingLaunch); assert.equal(g.score, beforeDrain);
    assert.equal(g.hitBumpers.size, bumpers.length);
    const y = g.ball.gameObject.y; step(g, 60); assert.equal(g.ball.gameObject.y, y);
    g.shutdown();
});

test('揺らしの間隔・落球後の無効化・速度上限を守り、起動待ちでは球を動かさない', () => {
    const a = loadApp(), g = gameFor(a, a.PINBALL_TABLES[0]);
    const initial = { ...g.ball.gameObject.body.velocity }; g.nudge();
    assert.deepEqual({ ...g.ball.gameObject.body.velocity }, initial);
    g.launchBall(); g.nudge(); const first = { ...g.ball.gameObject.body.velocity }; g.nudge();
    assert.deepEqual({ ...g.ball.gameObject.body.velocity }, first);
    g.time.now = 2001; g.nudge(); assert.notDeepEqual({ ...g.ball.gameObject.body.velocity }, first);
    g.ball.setVelocity(80, -80); g.beforePhysicsStep();
    assert(Math.hypot(g.ball.gameObject.body.velocity.x, g.ball.gameObject.body.velocity.y) <= 22.001);
    g.time.now = 5000; g.ball.setPosition(400, 950); g.ball.setVelocity(1, 2); g.nudge();
    assert.equal(g.ball.gameObject.body.velocity.y, 2);
    g.gameOver(); const score = g.score; g.addScore(1000); g.launchBall(); assert.equal(g.score, score);
    g.shutdown();
});

test('最高得点は台ごとに保存し、不正値・保存拒否でプレイ状態を失わない', () => {
    const a = loadApp(), [one, two] = a.PINBALL_TABLES;
    a.storage.set('pinballTableRecords', JSON.stringify({ classic: -1, cascade: 'bad', orbit: 123, unknown: 9000 }));
    const scores = new a.TableArcade(a.app);
    assert.equal(scores.best('classic'), 0); assert.equal(scores.best('cascade'), 0); assert.equal(scores.best('orbit'), 123);
    scores.record(one, 1500); scores.record(one, 300); scores.record(two, 2500);
    assert.equal(new a.TableArcade(a.app).best(one.id), 1500); assert.equal(new a.TableArcade(a.app).best(two.id), 2500);
    a.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
    assert.doesNotThrow(() => scores.record(one, 2000)); assert.equal(scores.best(one.id), 2000); assert(scores.storageWarning);
});

