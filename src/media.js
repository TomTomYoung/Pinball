// Original media integration. Physics remains on the existing Shape bodies.
class PinballMedia {
    constructor(app) {
        this.app = app;
        this.assets = JSON.parse(document.getElementById('embedded-assets').textContent);
        this.images = new Map();
        this.failures = [];
    }
    async load() {
        await Promise.all(Object.entries(this.assets).filter(([, a]) => a.group <= 8).map(([id, asset]) =>
            new Promise(resolve => {
                const image = new Image();
                image.onload = () => { this.images.set(id, image); resolve(); };
                image.onerror = () => { this.failures.push(id); resolve(); };
                image.src = asset.url;
            })));
    }
    key(id) { return 'pinball:' + id; }
    install(scene) {
        for (const [id, image] of this.images) {
            if (!scene.textures.exists(this.key(id))) scene.textures.addImage(this.key(id), image);
        }
    }
    decorateUI() {
        const icons = { 'test-button':'play', 'stop-button':'edit', 'save-button':'save', 'load-button':'load',
            'restart-button':'restart', 'edit-button':'edit', 'add-wall-button':'wall', 'add-bumper-button':'bumper',
            'add-flipper-button':'flipper', 'add-ball-button':'spawn', 'delete-object-button':'delete', 'mute-button':'volume' };
        for (const [id, icon] of Object.entries(icons)) {
            const button = document.getElementById(id), image = new Image();
            image.src = this.assets['icon-' + icon].url; image.alt = ''; image.width = image.height = 18;
            image.className = 'button-icon'; button.prepend(image); button.classList.add('asset-button');
        }
        for (const state of ['normal', 'pressed', 'disabled']) document.documentElement.style.setProperty('--button-' + state, `url("${this.assets['button-' + state].url}")`);
        document.getElementById('score-display').style.backgroundImage = `url("${this.assets['score-panel'].url}")`;
    }
}

class PinballAudio {
    constructor(media, report) {
        this.media = media; this.report = report;
        this.context = null; this.ready = null; this.buffers = new Map();
        this.nodes = new Set(); this.lastPlayed = new Map();
        this.generation = 0; this.mode = 'edit'; this.musicNode = null;
        this.muted = false; this.sfxVolume = 0.65; this.musicVolume = 0.25;
        this.suspendedByPage = false; this.history = []; this.warned = false;
    }
    warn() {
        if (!this.warned) { this.warned = true; this.report('この環境では一部の音声を再生できません。ゲームは続けられます。'); }
    }
    unlock() {
        if (document.hidden) return Promise.resolve(false);
        if (!this.context) {
            const Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio) { this.warn(); return Promise.resolve(false); }
            try {
                this.context = new Audio();
                this.master = this.context.createGain(); this.master.connect(this.context.destination);
                this.sfx = this.context.createGain(); this.sfx.connect(this.master);
                this.music = this.context.createGain(); this.music.connect(this.master);
                this.updateVolumes();
                this.ready = Promise.all(Object.entries(this.media.assets).filter(([, a]) => a.group >= 9).map(async ([id, asset]) => {
                    try {
                        const bytes = Uint8Array.from(atob(asset.url.split(',')[1]), c => c.charCodeAt(0));
                        this.buffers.set(id, await this.context.decodeAudioData(bytes.buffer));
                    } catch (_) { this.warn(); }
                })).then(() => true);
            } catch (_) { this.warn(); return Promise.resolve(false); }
        }
        // Capture the gesture immediately; decoding must not delay resume().
        let resumed;
        try { resumed = this.context.resume(); } catch (_) { return Promise.resolve(false); }
        this.suspendedByPage = false;
        return Promise.all([this.ready, resumed]).then(() => this.context.state === 'running').catch(() => { this.warn(); return false; });
    }
    updateVolumes() {
        if (!this.context || !this.master) return;
        const now = this.context.currentTime;
        for (const [gain, value] of [[this.master, this.muted ? 0 : 1], [this.sfx, this.sfxVolume], [this.music, this.musicVolume]]) {
            gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(value, now, 0.015);
        }
    }
    setMuted(value) { this.muted = !!value; this.updateVolumes(); }
    cue(id, delay = 0) {
        if (!this.context || this.context.state !== 'running' || document.hidden || this.suspendedByPage || this.muted || this.sfxVolume === 0) return false;
        const buffer = this.buffers.get(id); if (!buffer) return false;
        const now = this.context.currentTime;
        // Shared impact budget suppresses rapid chatter while allowing the visual hit.
        const throttleKey = id.startsWith('wall-') ? 'wall-impact' : id;
        const interval = id.startsWith('wall-') ? 0.045 : id === 'bumper' ? 0.055 : 0.025;
        if (now - (this.lastPlayed.get(throttleKey) ?? -Infinity) < interval) return false;
        if ([...this.nodes].filter(n => n !== this.musicNode).length >= 8) return false;
        this.lastPlayed.set(throttleKey, now);
        const node = this.context.createBufferSource(); node.buffer = buffer; node.connect(this.sfx);
        this.track(node); node.start(now + delay);
        this.history.push(id); if (this.history.length > 40) this.history.shift();
        return true;
    }
    track(node) {
        this.nodes.add(node);
        node.onended = () => { this.nodes.delete(node); if (this.musicNode === node) this.musicNode = null; node.disconnect(); };
    }
    startMusic() {
        if (this.musicNode || this.mode !== 'play' || document.hidden || this.suspendedByPage || this.context?.state !== 'running') return;
        const buffer = this.buffers.get('circuit-return'); if (!buffer) return;
        const node = this.context.createBufferSource(); node.buffer = buffer; node.loop = true;
        node.loopStart = 0; node.loopEnd = buffer.duration; node.connect(this.music);
        this.musicNode = node; this.track(node); node.start();
    }
    stopAll(mode = 'edit') {
        this.generation++; this.mode = mode;
        for (const node of this.nodes) {
            node.onended = null;
            try { node.stop(); } catch (_) { /* Already ended. */ }
            node.disconnect();
        }
        this.nodes.clear(); this.musicNode = null; this.lastPlayed.clear();
    }
    beginGame() {
        this.stopAll('play'); const generation = this.generation;
        this.unlock().then(ok => {
            if (ok && this.generation === generation && this.mode === 'play' && !this.suspendedByPage) {
                this.cue('game-start'); this.startMusic();
            }
        });
    }
    endGame() {
        this.stopAll('over'); this.cue('drain'); this.cue('game-over', 0.18);
    }
    hide() {
        const mode = this.mode; this.stopAll(mode); this.suspendedByPage = true;
        if (this.context?.state === 'running') this.context.suspend().catch(() => {});
    }
    gesture() {
        const generation = this.generation;
        this.unlock().then(ok => { if (ok && generation === this.generation) this.startMusic(); });
    }
}

class SceneSkin {
    constructor(scene, media) {
        this.scene = scene; this.media = media; this.views = new Map(); this.effects = [];
        this.backdrop = null; this.frame = null;
        media.install(scene);
        scene.events.on('postupdate', this.sync, this);
        this.setBoard(scene.board);
    }
    has(id) { return this.media.images.has(id); }
    image(id, x, y, scale = 1) { return this.scene.add.image(x, y, this.media.key(id)).setScale(scale); }
    tiled(id, x, y, width, height, scale) {
        return this.scene.add.tileSprite(x, y, width, height, this.media.key(id)).setTileScale(scale, scale);
    }
    setBoard(board) {
        this.backdrop?.destroy(); this.frame?.destroy(); this.backdrop = null; this.frame = null;
        if (this.has('playfield')) {
            const a = this.media.assets.playfield;
            this.backdrop = this.image('playfield', board.width / 2, board.height / 2,
                Math.max(board.width / a.width, board.height / a.height)).setDepth(-100);
        }
        if (!this.has('frame-edge') || !this.has('frame-corner')) return;
        this.frame = this.scene.add.container(0, 0).setDepth(90);
        const thickness = 8, scale = thickness / 32, w = board.width, h = board.height;
        // Bottom center is left open, visibly indicating the drain; decoration has no body.
        for (let side = 0; side < 4; side++) {
            const edge = this.scene.add.container(side === 1 || side === 2 ? w : 0, side >= 2 ? h : 0).setAngle(side * 90);
            edge.add(this.image('frame-corner', thickness / 2, thickness / 2, scale));
            const length = side % 2 ? h : w;
            const line = (start, total) => {
                for (let offset = 0; offset < total; offset += 1024) {
                    const width = Math.min(1024, total - offset);
                    edge.add(this.tiled('frame-edge', start + offset + width / 2, thickness / 2, width, thickness, scale));
                }
            };
            if (side !== 2) line(thickness, length - 2 * thickness);
            else { line(thickness, length * .35 - 2 * thickness); line(length * .65 + thickness, length * .35 - 2 * thickness); }
            this.frame.add(edge);
        }
    }
    attach(object) {
        const container = this.scene.add.container(0, 0);
        this.views.set(object, { container, signature: null, skinned: false, selection: null, cap: null, glow: null });
        this.refresh(object);
    }
    refresh(object) {
        const view = this.views.get(object); if (!view || !object.gameObject) return;
        const signature = [object.type, object.width, object.height, object.color.toLowerCase(), object.isLeft].join(':');
        if (signature !== view.signature) {
            view.container.removeAll(true); view.signature = signature; view.cap = view.glow = view.selection = null;
            view.skinned = this.build(object, view);
            object.gameObject.setVisible(!view.skinned);
            view.selection = this.scene.add.graphics(); view.container.add(view.selection);
            this.select(object, !!object.selected);
        }
        this.syncView(object, view);
    }
    build(o, v) {
        const color = o.color.toLowerCase(), add = child => { v.container.add(child); return child; };
        if (o.type === 'wall' && color === '#888888' && ['rail-body','rail-cap-left','rail-cap-right'].every(id => this.has(id))) {
            const vertical = o.height > o.width, span = Math.max(o.width, o.height), thick = Math.min(o.width, o.height), scale = thick / 40, cap = 24 * scale;
            // TileSprite backing dimensions are bounded. Very large authored objects use Shapes.
            if (span < 2 * cap || span > 2048 || thick > 512) return false;
            const group = this.scene.add.container(0, 0).setAngle(vertical ? 90 : 0);
            group.add(this.image('rail-cap-left', -span / 2 + cap / 2, 0, scale));
            if (span > 2 * cap) group.add(this.tiled('rail-body', 0, 0, span - 2 * cap, thick, scale));
            group.add(this.image('rail-cap-right', span / 2 - cap / 2, 0, scale)); add(group); return true;
        }
        if (o.type === 'ball' && color === '#ffffff' && this.has('ball-chrome') && this.has('ball-shadow')) {
            const scale = o.radius / 30;
            add(this.image('ball-shadow', o.radius * .2, o.radius * .3, scale)); add(this.image('ball-chrome', 0, 0, scale)); return true;
        }
        if (o.type === 'flipper' && color === '#ff0000' && Math.abs(o.width / o.height - 5) < 1e-9 && this.has('flipper-pivot') && this.has(o.isLeft ? 'flipper-left' : 'flipper-right')) {
            const scale = o.height / 40;
            add(this.image(o.isLeft ? 'flipper-left' : 'flipper-right', 0, 0, scale));
            add(this.image('flipper-pivot', (o.isLeft ? -1 : 1) * o.width / 2, 0, scale)); return true;
        }
        if (o.type === 'bumper' && color === '#00aaff' && ['bumper-base','bumper-normal','bumper-lit','bumper-glow'].every(id => this.has(id))) {
            const scale = o.radius / 40; add(this.image('bumper-base', 0, 0, scale));
            v.glow = add(this.image('bumper-glow', 0, 0, scale)).setVisible(false);
            v.cap = add(this.image('bumper-normal', 0, 0, scale)); return true;
        }
        return false;
    }
    select(object, selected) {
        const view = this.views.get(object); if (!view?.selection) return;
        const g = view.selection; g.clear();
        if (!selected || !view.skinned) return;
        g.lineStyle(2, 0xffff00, 1);
        if (object.type === 'ball' || object.type === 'bumper') g.strokeCircle(0, 0, object.radius);
        else g.strokeRect(-object.width / 2, -object.height / 2, object.width, object.height);
    }
    flash(object) {
        const view = this.views.get(object); if (!view) return;
        view.flashUntil = this.scene.time.now + 100; this.syncView(object, view);
    }
    syncView(object, view) {
        const go = object.gameObject; if (!go || !view.container.scene) return;
        view.container.setPosition(go.x, go.y).setRotation(object.type === 'ball' ? 0 : go.rotation).setAlpha(object.isBallPositionMarker ? .5 : 1);
        if (view.cap) {
            const lit = object.collected || (view.flashUntil ?? 0) > this.scene.time.now;
            view.cap.setTexture(this.media.key(lit ? 'bumper-lit' : 'bumper-normal')); view.glow.setVisible(lit);
        }
    }
    hit(x, y) {
        if (!this.has('hit-00') || this.effects.length >= 12) return;
        const image = this.image('hit-00', x, y, .5).setDepth(80);
        this.effects.push({ image, start: this.scene.time.now });
    }
    sync() {
        for (const [object, view] of this.views) this.syncView(object, view);
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i], frame = Math.floor((this.scene.time.now - e.start) / 30);
            if (frame >= 6) { e.image.destroy(); this.effects.splice(i, 1); }
            else if (this.has('hit-' + String(frame).padStart(2, '0'))) e.image.setTexture(this.media.key('hit-' + String(frame).padStart(2, '0')));
        }
    }
    clearEffects() { for (const e of this.effects) e.image.destroy(); this.effects = []; }
    detach(object) { const view = this.views.get(object); view?.container.destroy(); this.views.delete(object); }
    destroy() {
        this.scene.events.off('postupdate', this.sync, this);
        for (const object of [...this.views.keys()]) this.detach(object);
        this.clearEffects(); this.backdrop?.destroy(); this.frame?.destroy();
        this.backdrop = this.frame = null;
    }
}
