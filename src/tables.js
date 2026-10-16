// The same schema-1 layouts drive the gallery previews and physics.
const PINBALL_TABLES = (() => {
    const rail = (x1, y1, x2, y2, name = 'ガイドレール') => ({
        type: 'wall', x: (x1 + x2) / 2, y: (y1 + y2) / 2,
        width: Math.hypot(x2 - x1, y2 - y1), height: 24,
        angle: Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI,
        name, isStatic: true, restitution: .65
    });
    const bumper = (x, y, radius = 34, score = 100) => ({
        type: 'bumper', x, y, radius, score, restitution: 1.25, name: `${score}点バンパー`
    });
    const flipper = (x, y, isLeft, width = 120) => ({
        type: 'flipper', x, y, width, height: width / 5, isLeft,
        restAngle: isLeft ? 22 : -22, flipAngle: isLeft ? -38 : 38,
        name: `${isLeft ? '左' : '右'}フリッパー`
    });
    const base = (gap = 280, width = 120) => [
        rail(0, 100, 100, 0, '左上コーナー'), rail(700, 0, 800, 100, '右上コーナー'),
        rail(0, 640, 400 - gap / 2, 850, '左リターン'),
        rail(400 + gap / 2, 850, 800, 640, '右リターン'),
        flipper(400 - gap / 2, 850, true, width), flipper(400 + gap / 2, 850, false, width)
    ];
    const make = (id, name, level, accent, description, tip, target, objects, options = {}) => ({
        id, name, level, accent, description, tip, target,
        launch: { x: options.vx ?? 1.5, y: -7 },
        layout: { schemaVersion: 1, board: { width: 800, height: 1000 }, objects: [
            ...base(options.gap, options.width), ...objects,
            { type: 'ball', x: options.x ?? 400, y: 110, radius: 10,
                friction: .005, restitution: .8, isBallPositionMarker: true, name: '発射位置' }
        ] }
    });
    return [
        make('classic', 'クラシック・トライアングル', '入門', '#61d9ff',
            '三角形のバンパーと広い打ち返しエリア。まずはここから。',
            '片側ずつ打って、上の3基へ戻しましょう。', 2000,
            [bumper(300, 300), bumper(500, 300), bumper(400, 440, 40, 150),
                rail(100, 430, 175, 540), rail(625, 540, 700, 430)]),
        make('cascade', 'カスケード', '初級', '#64e3c1',
            '段違いの斜面を落ち、左右へ流れを変える滝の台。',
            'レールの端から落ちる球を、下で待ち受けます。', 2500,
            [rail(140, 225, 330, 300), rail(470, 370, 660, 295), rail(140, 465, 320, 540),
                bumper(500, 220, 30, 150), bumper(290, 380, 28, 150),
                bumper(510, 510, 36, 200), bumper(390, 650, 28, 100)], { x: 260, vx: 3 }),
        make('orbit', 'オービット', '初級', '#b99aff',
            '環状に並ぶ6基のバンパー。外周から回り込んで連続ヒット。',
            '中央と外側で跳ね方が変わります。全6基を狙いましょう。', 3500,
            Array.from({ length: 6 }, (_, i) => {
                const a = (i * 60 - 90) * Math.PI / 180;
                return bumper(400 + 175 * Math.cos(a), 365 + 175 * Math.sin(a), 30, 120);
            }), { x: 570, vx: -2 }),
        make('towers', 'ツインタワー', '中級', '#ffd166',
            '左右の塔に3基ずつ。中央の通路から狙いを振り分けます。',
            '両塔を往復して、取りこぼしたバンパーを回収します。', 3500,
            [220, 370, 520].flatMap(y => [bumper(245, y, 34, 150), bumper(555, y, 34, 150)])
                .concat([rail(100, 560, 180, 660), rail(620, 660, 700, 560)]), { x: 360, vx: 4 }),
        make('diamond', 'ダイヤモンド', '中級', '#ff99bf',
            '中央の大きな宝石を4基が囲む、密集した反射エリア。',
            '中央は300点。外側の4基もすべて当てるとボーナスです。', 4500,
            [bumper(400, 210, 28, 120), bumper(245, 380, 32, 120),
                bumper(555, 380, 32, 120), bumper(400, 550, 28, 120), bumper(400, 380, 52, 300)],
            { x: 300, vx: 2 }),
        make('crossfire', 'クロスファイア', '中級', '#ff9366',
            '上下2組、計4本のフリッパーで上段へ何度も打ち返す台。',
            '左右キーは上下の同じ側を同時に動かします。', 4500,
            [bumper(310, 230, 32, 150), bumper(490, 230, 32, 150), bumper(400, 355, 35, 200),
                flipper(170, 500, true, 100), flipper(630, 500, false, 100),
                bumper(400, 650, 30, 150)], { x: 400, vx: 4 }),
        make('slalom', 'スラローム', '中級', '#9de877',
            '左右へ交互に並ぶ大きなバンパー。蛇行する球を見切ります。',
            '最後のバンパーからの斜め落下に合わせて打ち返します。', 3000,
            [bumper(290, 230, 48, 150), bumper(510, 370, 48, 150),
                bumper(290, 510, 48, 150), bumper(510, 650, 40, 200),
                rail(90, 300, 160, 390), rail(640, 440, 710, 350)], { x: 440, vx: -3 }),
        make('bankshot', 'バンクショット', '上級', '#ffe89c',
            '斜めの長いレールを利用し、左右奥の高得点を狙う台。',
            '奥のバンパーは各400点。レールの外側にも道があります。', 4000,
            [rail(180, 290, 320, 510), rail(480, 510, 620, 290),
                bumper(105, 230, 28, 400), bumper(695, 230, 28, 400),
                bumper(400, 230, 32, 100), bumper(400, 590, 38, 150)], { x: 520, vx: -4 }),
        make('pinforest', 'ピン・フォレスト', '上級', '#77b9ff',
            '小さなバンパー15基の森。細かい連打で得点を積みます。',
            '小さな的をすべて点灯させる、長期戦の台です。', 6000,
            [0, 1, 2].flatMap(row => [0, 1, 2, 3, 4].map(col =>
                bumper(160 + col * 112 + (row % 2) * 28, 250 + row * 150, 22, 80))),
            { x: 410, vx: 3.5 }),
        make('gauntlet', 'ラスト・ゲート', '上級', '#ff6e88',
            '短いフリッパーと広い中央の落とし穴。一打の精度を試す台。',
            '早打ちは禁物。球を引きつけてから打ち返しましょう。', 3000,
            [bumper(260, 260, 30, 200), bumper(520, 320, 40, 200),
                bumper(330, 490, 30, 250), bumper(570, 590, 26, 300),
                rail(95, 390, 175, 490), rail(630, 200, 710, 300)],
            { gap: 310, width: 110, x: 370, vx: -3 })
    ];
})();

class TableArcade {
    constructor(app) {
        this.app = app;
        this.records = {};
        this.storageWarning = false;
        try {
            const raw = JSON.parse(localStorage.getItem('pinballTableRecords') || '{}');
            for (const table of PINBALL_TABLES) {
                const score = raw?.[table.id];
                if (Number.isSafeInteger(score) && score >= 0) this.records[table.id] = score;
            }
        } catch (_) { /* A blocked or corrupt score store does not prevent play. */ }
    }
    best(id) { return this.records[id] || 0; }
    record(table, score) {
        this.records[table.id] = Math.max(this.best(table.id), score);
        try { localStorage.setItem('pinballTableRecords', JSON.stringify(this.records)); }
        catch (_) { this.storageWarning = true; }
    }
    render() {
        const grid = $('table-grid'); grid.replaceChildren();
        PINBALL_TABLES.forEach((table, i) => {
            if(this.filter&&this.filter!=='all'&&(table.group??'classic')!==this.filter)return;
            const card = document.createElement('article'); card.className = 'table-card';
            card.style.setProperty('--table-accent', table.accent);
            card.innerHTML = `<div class="table-preview">${this.preview(table)}</div>
                <div class="table-copy"><span class="table-number">${String(i + 1).padStart(2, '0')} / ${table.level}</span>
                <h2>${table.name}</h2><p>${table.description}</p>
                <div class="table-record">目標 ${table.target.toLocaleString()}　/　BEST ${this.best(table.id).toLocaleString()}</div>
                <button type="button" data-play="${table.id}">この台で遊ぶ <span aria-hidden="true">→</span></button></div>`;
            card.querySelector('button').addEventListener('click', () => this.app.startTable(table.id));
            grid.appendChild(card);
        });
        $('gallery-note').textContent = this.storageWarning ? 'この環境では記録を保存できません。この画面を開いている間は保持します。' :
            '1ゲーム3球。全バンパーに当てると +1,000点。目標スコアを超えても最後の球まで遊べます。';
    }
    preview(table) {
        const objects = LayoutCodec.normalize(table.layout).objects;
        const shapes = objects.map(o => {
            if(o.type==='device'){const color=o.color;if(o.shape==='circle')return `<circle cx="${o.x}" cy="${o.y}" r="${o.radius}" fill="${color}" fill-opacity="${o.sensor?.3:.7}" stroke="${color}" stroke-width="5"/><text x="${o.x}" y="${o.y+9}" text-anchor="middle" fill="#fff" font-size="25">${o.entity?.prototype==='warp'?'W':o.entity?.prototype==='splitter'?'S':'+'}</text>`;return `<rect x="${o.x-o.width/2}" y="${o.y-o.height/2}" width="${o.width}" height="${o.height}" fill="${color}" transform="rotate(${o.angle} ${o.x} ${o.y})"/>`;}
            if (o.type === 'bumper') return `<circle cx="${o.x}" cy="${o.y}" r="${o.radius}" fill="${table.accent}" fill-opacity=".22" stroke="${table.accent}" stroke-width="8"/>`;
            if (o.type === 'ball') return `<circle cx="${o.x}" cy="${o.y}" r="12" fill="#fff"/>`;
            const x = o.type === 'flipper' ? (o.isLeft ? 0 : -o.width) : -o.width / 2;
            return `<g transform="translate(${o.x} ${o.y}) rotate(${o.type === 'flipper' ? o.restAngle : o.angle})"><rect x="${x}" y="${-o.height / 2}" width="${o.width}" height="${o.height}" rx="8" fill="${o.type === 'flipper' ? '#ff8e9d' : '#9bb2c5'}"/></g>`;
        }).join('');
        return `<svg viewBox="0 0 800 1000" aria-hidden="true" focusable="false"><path d="M12 990V12H788V990" fill="none" stroke="#40536b" stroke-width="18"/>${shapes}</svg>`;
    }
}

