const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Phaser 3.60.0の同梱モジュールをDOM起動前に取得する。
// 図形・MatterGameObject・World・Factory・Engineはすべて実物。DOMとSceneのサービスだけを代用する。
const phaserFile = process.env.PHASER_SOURCE || require.resolve('phaser/dist/phaser.js');
const source = fs.readFileSync(phaserFile, 'utf8');
const entry = 'var __webpack_exports__ = __webpack_require__(92491);';
if (!source.includes(entry)) throw new Error('テスト用Phaserは3.60.0を使用してください。');
const sandbox = { module: { exports: {} }, exports: {}, console, setTimeout, clearTimeout };
vm.runInNewContext(source.replace(entry, 'var __webpack_exports__ = __webpack_require__;'), sandbox);
const req = sandbox.module.exports;
const Body = req(84125), Engine = req(45775), Composite = req(11299), Rectangle = req(517), Arc = req(28593);
const World = req(31468), Factory = req(72653), EE = req(6659);

function element() {
    return { style: {}, classList: { toggle() {} }, children: [], textContent: '', value: '',
        appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; this.textContent = ''; },
        addEventListener() {}, removeEventListener() {} };
}
function loadApp() {
    const elements = new Map(), messages = [], storage = new Map();
    const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
    const localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
    const Phaser = { Scene: class {}, Display: { Color: { ValueToColor(value) { return { color: parseInt(value.slice(1), 16) }; } } } };
    const context = vm.createContext({ Phaser, document, localStorage, console, confirm: () => true });
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const script = html.split('<script>')[1].split('</script>')[0];
    vm.runInContext(script.slice(0, script.indexOf('const pinballGame = new PinballGame();')) +
        '\nglobalThis.classes = { LayoutCodec, GameObject, Wall, Bumper, Flipper, Ball, EditorScene, GameScene, PinballGame, createBoundaries };', context);
    const app = { mode: 'edit', board: { width: 800, height: 1000 },
        notify: (text, error) => messages.push({ text, error }),
        setBoard(board) { this.board = { ...board }; }, setMode(mode) { this.mode = mode; },
        showGameOver(score) { this.finalScore = score; this.mode = 'over'; } };
    return { ...context.classes, app, document, localStorage, messages, storage };
}
function scene(target = {}) {
    target.sys = { renderer: null, queueDepthSort() {}, events: new EE() };
    target.events = target.sys.events;
    target.game = { config: { width: 800, height: 1000 } };
    target.add = {
        rectangle: (x, y, width, height, color) => new Rectangle(target, x, y, width, height, color),
        circle: (x, y, radius, color) => new Arc(target, x, y, radius, 0, 360, false, color),
        text: (x, y, text) => ({ text, setDepth() { return this; }, setText(value) { this.text = value; return this; } })
    };
    const world = new World(target, { gravity: { y: 1 }, debug: false });
    target.matter = { body: Body, world, add: new Factory(world) };
    target.input = { on() {}, off() {}, keyboard: { enabled: true, resetKeys() {},
        addKeys: () => Object.fromEntries(['left', 'right', 'z', 'slash'].map(key => [key, { isDown: false }])) } };
    target.time = { delayedCall: () => ({ remove() {} }) };
    return target;
}
function step(target, count = 60) {
    for (let i = 0; i < count; i++) target.matter.world.update(i * 1000 / 60, 1000 / 60);
}
module.exports = { loadApp, scene, step, Body, Engine, Composite };
