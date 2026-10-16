// Action tables preserve all twenty earlier layouts unchanged.
const PINBALL_ACTION_TABLES=(()=>{
    const device=(key,x,y,id,change={})=>{const o=entityPresetRecord(key,x,y,id);for(const k of ['radius','width','height','angle','color','sensor'])if(change[k]!==undefined)o[k]=change[k];if(change.components)for(const[k,v]of Object.entries(change.components))o.entity.components={...o.entity.components,[k]:{...o.entity.components?.[k],...v}};return o;};
    const target=(x,y,id,hp=20)=>device('breakable',x,y,id,{width:80,components:{health:{max:hp,score:150}}});
    const bumper=(x,y)=>({type:'bumper',x,y,radius:28,score:160,restitution:1.2});
    const enemy=(key,x,y,id,change={})=>device(key,x,y,id,{radius:27,...change});
    const make=(id,name,accent,description,tip,objects,opts={})=>({id,name,accent,description,tip,control:opts.control??'敵の印：両=弾とフリッパー／弾=弾のみ／振=振りのみ／時=時間消滅',group:'action',level:'アクション',target:opts.target??4000,launch:{x:0,y:-7},
        layout:{schemaVersion:2,seed:20261017,board:{width:800,height:1000},objects:[...EntityModel.clone(PINBALL_LAB_TABLES[0].layout.objects.slice(0,6)).map((o,i)=>o.type==='flipper'&&opts.charge?{...o,entity:{id:'paddle-'+i,components:{flipper:{charge:true,chargeTime:.8,boost:2.3}}}}:o),...objects,{type:'ball',x:400,y:110,radius:10,isBallPositionMarker:true,entity:{id:'round-ball',components:{attack:{damage:10},...(opts.kind?{projectile:{kind:opts.kind}}:{})}}}]}});
    return[
        make('action-giant','メガ・ブレイカー','#ffc968','巨大な球で敵とブロックをまとめて崩す台。','GROWに触れると10秒間、直径が2.4倍。POWERで強打弾になります。',[
            device('giantBall',400,260,'grow'),device('powerBall',400,570,'power'),...[[240,400],[400,410],[560,400],[300,650],[500,650]].map(([x,y],i)=>target(x,y,'brick-'+i,25)),bumper(240,230),bumper(560,230),enemy('enemyTrooper',300,520,'trooper',{components:{enemy:{speed:0}}})]),
        make('action-blast','ブラスト・チェーン','#ff687d','爆裂弾の範囲攻撃で群れを崩します。','赤い弾は接触点から155の範囲に爆風。密集した敵を狙います。',[
            device('blastBall',400,250,'blast'),...[[290,420],[400,430],[510,420],[340,550],[460,550]].map(([x,y],i)=>enemy('enemyTrooper',x,y,'crowd-'+i,{components:{enemy:{speed:0},health:{max:20}}})),target(240,610,'side-a'),target(560,610,'side-b'),bumper(210,230),bumper(590,230)],{kind:'blast'}),
        make('action-spark','サンダー・リンク','#6ae5ff','電撃が敵を渡り、最大4体へ連鎖する台。','水色の弾で敵の列の端を撃ちます。電撃も「弾で倒せる敵」にだけ有効です。',[
            device('sparkBall',400,245,'spark'),...[[220,370],[350,390],[480,410],[610,430],[490,540]].map(([x,y],i)=>enemy('enemyTrooper',x,y,'link-'+i,{components:{enemy:{speed:0},health:{max:20}}})),device('enemySpawner',180,190,'reinforce',{components:{spawner:{preset:'enemyTrooper',interval:6,maxAlive:3,total:8}}}),bumper(280,620),bumper(550,620)],{kind:'spark'}),
        make('action-pierce','ドリル・レーン','#c1a3ff','貫通弾が障害物を抜き、連続して当たる台。','紫の弾は壊せる敵とブロックを通過します。外周・通常レールは反射します。',[
            device('pierceBall',400,240,'pierce'),...[350,440,530,620].map((y,i)=>target(400,y,'stack-'+i,15)),enemy('enemyArmor',260,390,'armor-a',{components:{enemy:{speed:0}}}),enemy('enemyArmor',540,470,'armor-b',{components:{enemy:{speed:0}}}),bumper(240,600),bumper(560,600)],{kind:'pierce'}),
        make('action-enemies','エネミー・セレクター','#f48d89','攻撃手段によって倒せる敵が変わります。','両は両方、弾は弾のみ、振は振ったフリッパーのみ。時は8秒で消えます。',[
            enemy('enemyTrooper',300,350,'both'),enemy('enemyArmor',510,330,'ball-only'),enemy('enemyShield',315,660,'paddle-only'),enemy('enemyPhantom',550,520,'timed'),device('enemySpawner',230,300,'gate',{components:{spawner:{preset:'enemyShield',interval:6,total:4,offset:[80,350]}}}),bumper(400,460)],{charge:true,target:2500}),
        make('action-counter','カウンター・デュエル','#ff746e','敵が球を高速で打ち返す決闘台。','赤い外周リングの打者は強打準備中。チャージスウィングで打ち返します。',[
            enemy('enemyBatter',400,330,'batter',{radius:38,components:{enemy:{speed:0},health:{max:90,score:800}}}),device('powerBall',400,200,'power'),enemy('enemyBatter',240,500,'batter-left',{components:{enemy:{speed:0}}}),enemy('enemyBatter',560,500,'batter-right',{components:{enemy:{speed:0}}}),bumper(320,650),bumper(480,650)],{charge:true,kind:'power'}),
        make('action-construction','ビルド＆ブレイク','#b4e27c','工兵が障害物を増やし、破砕兵が盤面を壊します。','工兵を倒して増設を止め、破砕兵を利用して道を開けます。出現前の十字が予告です。',[
            enemy('enemyBuilder',280,330,'builder',{components:{enemy:{speed:0}}}),enemy('enemyBreaker',520,460,'breaker',{components:{enemy:{speed:0}}}),target(440,390,'wall-a',40),target(600,390,'wall-b',40),target(490,580,'wall-c',40),device('enemySpawner',400,180,'gate',{components:{spawner:{preset:'gravityCrate',interval:5,total:6,offset:[0,95]}}}),device('blastBall',230,600,'blast'),bumper(630,600)]),
        make('action-defense','ラスト・ディフェンス','#ff5578','突撃兵を止め、下端の侵入エリアを守る台。','DANGERへ突撃兵が入ると残球があっても終了。弾でもフリッパーでも倒せます。',[
            device('breachZone',400,940,'danger',{width:230}),enemy('enemyRaider',400,570,'raider'),device('enemySpawner',400,210,'gate',{components:{spawner:{preset:'enemyRaider',interval:7,maxAlive:3,total:8}}}),device('powerBall',220,480,'power'),bumper(250,330),bumper(550,330)],{charge:true,target:5000}),
        make('action-machines','スプリング・ファクトリー','#79f3b0','ばね・ピストン・重力で動く物体の試遊台。','SPRINGは圧縮して跳ね上げ、PISTONは伸び・保持・戻り・待機を繰り返します。',[
            device('piston',250,440,'piston',{components:{piston:{direction:-55,stroke:105}}}),device('spring',430,630,'spring',{angle:-10}),device('gravityCrate',330,240,'crate-a'),device('gravityCrate',550,260,'crate-b'),device('enemySpawner',620,190,'crate-gate',{components:{spawner:{preset:'gravityCrate',interval:7,total:5,offset:[-30,90]}}}),bumper(400,360),bumper(560,520)]),
        make('action-onslaught','オーバードライブ','#ffd76e','強化弾・巨大化・出現する敵をまとめて遊ぶ台。','左右を押して溜め、離して振ります。巨大な爆裂弾で群れを一掃し、侵入を防ぎます。',[
            device('giantBall',400,240,'grow'),device('blastBall',260,510,'blast'),device('sparkBall',550,510,'spark'),device('spring',400,680,'spring'),device('breachZone',400,950,'danger',{width:210}),device('enemySpawner',240,180,'left-gate',{components:{spawner:{preset:'enemyTrooper',interval:5,maxAlive:4,total:12,offset:[40,100]}}}),device('enemySpawner',560,190,'right-gate',{components:{spawner:{preset:'enemyRaider',interval:8,maxAlive:2,total:8,offset:[-30,90]}}}),bumper(400,410)],{charge:true,kind:'blast',target:8000})
    ];
})();
PINBALL_TABLES.push(...PINBALL_ACTION_TABLES);
