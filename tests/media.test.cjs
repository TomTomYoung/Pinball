const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
let browser,folder,url,phaser;
before(async()=>{
    folder=await fs.mkdtemp(path.join(os.tmpdir(),'pinball-single-html-'));
    await fs.copyFile(path.resolve(__dirname,'../index.html'),path.join(folder,'index.html'));
    url=pathToFileURL(path.join(folder,'index.html')).href;
    phaser=await fs.readFile(require.resolve('phaser/dist/phaser.min.js'));
    browser=await chromium.launch({headless:true,...(process.env.PINBALL_BROWSER_EXECUTABLE?{executablePath:process.env.PINBALL_BROWSER_EXECUTABLE}:{})});
});
after(async()=>{await browser?.close();await fs.rm(folder,{recursive:true,force:true});});
async function open(t,init=null,viewport={width:1280,height:900}){
    const context=await browser.newContext({viewport});
    await context.route('https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js',r=>r.fulfill({contentType:'application/javascript',body:phaser}));
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
    t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert(requests.every(u=>u===url||u.startsWith('data:')||u==='https://cdnjs.cloudflare.com/ajax/libs/phaser/3.60.0/phaser.min.js'),'No sidecar assets or network dependency other than Phaser');});
    if(init)await page.addInitScript(init);
    await page.goto(url);await page.waitForFunction(()=>typeof pinballGame!=='undefined'&&pinballGame.mode==='edit');
    return page;
}
async function fixture(page){
    await page.evaluate(()=>{
        const e=pinballGame.editor;
        for(const o of [new Wall(e,180,500,180,20),new Bumper(e,400,300,60),
            new Flipper(e,300,850,100,20),new Flipper(e,500,850,100,20,{isLeft:false}),
            new Ball(e,400,150,10,{isBallPositionMarker:true})])e.addObject(o);
        e.updateObjectList();
    });
}

test('HTML単体に39画像と10音声が内包され、起動時に音を鳴らさない',async t=>{
    const p=await open(t);await fixture(p);
    const result=await p.evaluate(()=>({assets:Object.keys(pinballGame.media.assets).length,images:pinballGame.media.images.size,
        failures:pinballGame.media.failures,context:pinballGame.audio.context,skins:pinballGame.editor.skin.views.size,
        bodies:pinballGame.editor.matter.world.localWorld.bodies.length,
        skinned:[...pinballGame.editor.skin.views.values()].every(v=>v.skinned)}));
    assert.deepEqual(result,{assets:49,images:39,failures:[],context:null,skins:8,bodies:7,skinned:true});
});

test('寸法・色の編集で同比率スキンとShapeを切り替え、物理・保存を保持する',async t=>{
    const p=await open(t);await fixture(p);
    const result=await p.evaluate(()=>{
        const e=pinballGame.editor,w=e.objects.find(o=>!o.isBoundary&&o.type==='wall'),f=e.objects.find(o=>o.type==='flipper'),ball=e.objects.find(o=>o.type==='ball');
        e.applyEdit(w,{width:20,height:180});const vertical=e.skin.views.get(w).container.list[0].angle;
        e.applyEdit(w,{color:'#00ff00'});const colored={skin:e.skin.views.get(w).skinned,visible:w.gameObject.visible,color:w.gameObject.fillColor};
        e.applyEdit(w,{color:'#888888',width:5000,height:20});const large=e.skin.views.get(w).skinned;
        e.applyEdit(f,{width:120});const arbitrary=e.skin.views.get(f).skinned;
        e.applyEdit(f,{height:24});const native=e.skin.views.get(f);e.selectObject(f);
        e.applyEdit(ball,{radius:40});const sprite=e.skin.views.get(ball).container.list[1];
        const ballScale=[sprite.scaleX,sprite.scaleY],flipperScale=[native.container.list[0].scaleX,native.container.list[0].scaleY];
        const before=JSON.stringify(e.getLayoutData());e.replaceLayout(e.getLayoutData());
        const saved=JSON.stringify(e.getLayoutData())===before;
        const gl=pinballGame.game.renderer.gl,limit=Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
        let gpuRollback=true;
        if(limit<10000){
            try{e.replaceLayout({...e.getLayoutData(),board:{width:limit+1,height:300}});gpuRollback=false;}
            catch(error){gpuRollback=error.message.includes('現在の盤面を保持')&&JSON.stringify(e.getLayoutData())===before;}
        }
        e.skin.setBoard({width:10000,height:300});
        const boundedFrame=e.skin.frame.list.every(edge=>edge.list.every(piece=>piece.type!=='TileSprite'||piece.width<=1024));
        e.skin.setBoard(e.board);
        return {vertical,colored,large,arbitrary,native:native.skinned,flipperScale,
            ballScale,saved,boundedFrame,gpuRollback,
            restored:e.skin.views.size===e.objects.length};
    });
    assert.equal(result.vertical,90);assert.deepEqual(result.colored,{skin:false,visible:true,color:0x00ff00});
    assert.equal(result.large,false);assert.equal(result.arbitrary,false);assert.equal(result.native,true);
    assert.deepEqual(result.flipperScale,[.6,.6]);
    assert.deepEqual(result.ballScale,[40/30,40/30]);assert(result.saved&&result.restored&&result.boundedFrame&&result.gpuRollback);
});

test('動く球・左右フリッパーの描画が実ボディの位置と回転に追従する',async t=>{
    const p=await open(t);await fixture(p);await p.click('#test-button');await p.waitForFunction(()=>pinballGame.mode==='play');
    await p.keyboard.down('z');await p.keyboard.down('/');
    await p.waitForFunction(()=>pinballGame.play.objects.filter(o=>o.type==='flipper').every(o=>Math.abs(o.gameObject.angle)>25));
    const poses=await p.evaluate(()=>new Promise(resolve=>pinballGame.play.events.once('postupdate',()=>{
        const g=pinballGame.play;resolve(g.objects.filter(o=>o.type==='flipper'||o.type==='ball').map(o=>{
            const v=g.skin.views.get(o).container,b=o.gameObject;
            return {dx:v.x-b.x,dy:v.y-b.y,dr:o.type==='ball'?v.rotation:v.rotation-b.rotation};
        }));g.matter.world.pause();
    })));
    assert(poses.every(p=>Math.abs(p.dx)<.001&&Math.abs(p.dy)<.001&&Math.abs(p.dr)<.001));
    await p.keyboard.up('z');await p.keyboard.up('/');
});

test('BGM・独立音量・ミュートと再プレイ4回で、音源・描画・リスナーが増殖しない',async t=>{
    const p=await open(t);await fixture(p);await p.click('#test-button');
    await p.waitForFunction(()=>pinballGame.mode==='play'&&pinballGame.audio.musicNode);
    await p.evaluate(()=>pinballGame.play.matter.world.pause());
    const initial=await p.evaluate(()=>({textures:pinballGame.game.textures.getTextureKeys().length,listeners:pinballGame.play.events.listenerCount('postupdate')}));
    await p.click('#mute-button');assert.equal(await p.locator('#mute-button').getAttribute('aria-pressed'),'true');
    await p.waitForFunction(()=>pinballGame.audio.master.gain.value<.01);
    await p.locator('#audio-settings summary').click();
    await p.locator('#sfx-volume').evaluate(e=>{e.value='.3';e.dispatchEvent(new Event('input',{bubbles:true}));});
    await p.locator('#music-volume').evaluate(e=>{e.value='.1';e.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.deepEqual(await p.evaluate(()=>[pinballGame.audio.sfxVolume,pinballGame.audio.musicVolume]),[.3,.1]);
    await p.waitForFunction(()=>Math.abs(pinballGame.audio.music.gain.value-.1)<.01);
    await p.locator('#audio-settings summary').click();await p.click('#mute-button');
    // An idle disconnected gain is not rendered until an actual SFX source is connected.
    await p.evaluate(()=>pinballGame.audio.cue('game-start'));
    await p.waitForFunction(()=>Math.abs(pinballGame.audio.sfx.gain.value-.3)<.01);
    for(let i=0;i<4;i++){
        await p.evaluate(()=>{pinballGame.play.matter.world.pause();pinballGame.play.addScore(50);pinballGame.play.gameOver();});
        assert.equal(await p.locator('#current-score').textContent(),'Score: 50');
        assert.equal(await p.evaluate(()=>pinballGame.audio.musicNode),null);
        assert(await p.evaluate(()=>pinballGame.audio.nodes.size<=2));
        await p.click('#restart-button');await p.waitForFunction(()=>pinballGame.mode==='play'&&pinballGame.audio.musicNode);
        const state=await p.evaluate(()=>{const g=pinballGame.play;g.matter.world.pause();return {score:g.score,views:g.skin.views.size,objects:g.objects.length,
            textures:pinballGame.game.textures.getTextureKeys().length,listeners:g.events.listenerCount('postupdate'),music:[...pinballGame.audio.nodes].filter(n=>n.loop).length};});
        assert.equal(state.score,0);assert.equal(state.views,state.objects);assert.equal(state.music,1);
        assert.equal(state.textures,initial.textures);assert.equal(state.listeners,initial.listeners);
    }
    await p.click('#stop-button');await p.waitForFunction(()=>pinballGame.mode==='edit');
    assert.equal(await p.evaluate(()=>pinballGame.audio.nodes.size),0);
    assert.equal(await p.evaluate(()=>pinballGame.play.skin),null);
});

test('キー保持中に駆動音を連打せず、非表示と遅延ロード後も古い音を再生しない',async t=>{
    const p=await open(t);await fixture(p);await p.click('#test-button');
    await p.waitForFunction(()=>pinballGame.audio.musicNode);await p.evaluate(()=>{pinballGame.play.matter.world.pause();pinballGame.audio.history=[];});
    const events=await p.evaluate(()=>{
        const g=pinballGame.play,a=pinballGame.audio;g.keys.z.isDown=true;
        for(let i=0;i<30;i++)g.beforePhysicsStep();g.keys.z.isDown=false;g.beforePhysicsStep();
        return a.history.filter(x=>x.startsWith('flipper'));
    });
    assert.deepEqual(events,['flipper-up','flipper-down']);
    await p.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await p.waitForFunction(()=>pinballGame.audio.context.state==='suspended');
    assert.equal(await p.evaluate(()=>pinballGame.audio.nodes.size),0);
    await p.keyboard.press('z');await p.waitForFunction(()=>pinballGame.audio.musicNode);
    const delayed=await p.evaluate(async()=>{
        const a=pinballGame.audio,original=a.unlock.bind(a);let release;
        const gate=new Promise(resolve=>release=resolve);
        a.unlock=()=>original().then(()=>gate);a.beginGame();a.stopAll();release(true);
        await new Promise(resolve=>setTimeout(resolve,100));a.unlock=original;
        return {mode:a.mode,nodes:a.nodes.size,music:!!a.musicNode};
    });
    assert.deepEqual(delayed,{mode:'edit',nodes:0,music:false});
});

test('画像・音声が利用できなくても編集でき、390px幅で音量設定が画面内に収まる',async t=>{
    const p=await open(t,()=>{
        Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true});
        Object.defineProperty(window,'webkitAudioContext',{value:undefined,configurable:true});
        const Native=window.Image;
        window.Image=class extends Native{set src(value){super.src=value.startsWith('data:image/png')&&value.length>100000?'data:image/png;base64,broken':value;}get src(){return super.src;}};
    },{width:390,height:844});
    assert.deepEqual(await p.evaluate(()=>pinballGame.media.failures),['playfield']);
    await p.click('#add-bumper-button');assert.equal(await p.locator('#object-select option').count(),1);
    await p.locator('#audio-settings summary').click();
    const bounds=await p.locator('.audio-options').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=390);
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await p.evaluate(()=>pinballGame.audio.context),null);
});
