const test=require('node:test'),assert=require('node:assert/strict');
const {loadApp,scene,step,Composite}=require('./harness.cjs');
function game(a,objects=[],options={}){const g=scene(new a.GameScene(a.app)),table=options.table;g.init({tableId:table?.id,layoutData:table?.layout??{schemaVersion:2,board:{width:800,height:1000},objects:[...objects,{type:'ball',x:400,y:100,radius:options.radius??10,isBallPositionMarker:true,entity:{id:'ball',physics:{gravityScale:0},components:{attack:{damage:10},...(options.kind?{projectile:{kind:options.kind}}:{})}}}]}});g.create();g.time.now=0;if(g.waitingLaunch)g.launchBall();return g;}
function frames(g,n){for(let i=0;i<n;i++){g.time.now+=1000/60;step(g,1);g.update();}}
function device(a,key,x=400,y=350,id=key){return a.entityPresetRecord(key,x,y,id);}
function enemy(a,key,x=400,y=350,id=key){const r=device(a,key,x,y,id);r.entity.components.enemy.speed=0;return r;}
function find(g,id){return g.objects.find(o=>o.entity?.id===id);}
function plain(x){return JSON.parse(JSON.stringify(x));}

test('アクション定義は30台と37プリセットを保存往復し、危険な組合せを拒否する',()=>{const a=loadApp();assert.equal(Object.keys(a.ENTITY_PRESETS).length,37);for(const t of a.PINBALL_ACTION_TABLES){const x=a.LayoutCodec.normalize(t.layout);assert.deepEqual(plain(a.LayoutCodec.normalize(plain(x))),plain(x));}
 const x=enemy(a,'enemyTrooper');x.entity.motion={kind:'wave'};assert.throws(()=>a.LayoutCodec.object(x).entity&&a.LayoutCodec.normalize({schemaVersion:2,board:{width:800,height:1000},objects:[x]}));
 const conflict=enemy(a,'enemyTrooper');conflict.entity.components.piston={};assert.throws(()=>a.LayoutCodec.object(conflict));
 const rectangular=enemy(a,'enemyTrooper');rectangular.shape='rectangle';assert.throws(()=>a.LayoutCodec.normalize({schemaVersion:2,board:{width:800,height:1000},objects:[rectangular]}));
 const s=device(a,'enemySpawner');s.entity.components.spawner.preset='enemySpawner';assert.throws(()=>a.LayoutCodec.object(s));const z=device(a,'breachZone');z.sensor=false;assert.throws(()=>a.LayoutCodec.normalize({schemaVersion:2,board:{width:800,height:1000},objects:[z]}));});

test('巨大化は実ボディの半径・質量を更新し、速度と保存定義を保持して期限で戻る',()=>{const a=loadApp(),g=game(a),b=g.ball,definition=JSON.stringify(g.layoutData),v=[320,-90];g.runtime.setVelocity(b,v);const mass=b.gameObject.body.mass;b.gameObject.body.frictionAir=.023;
 assert(g.runtime.action.upgrade(b,{kind:'keep',scale:2.4,duration:.2}));assert.equal(b.radius,24);assert.equal(b.gameObject.body.frictionAir,.023);assert.equal(b.gameObject.body.circleRadius,24);assert(Math.abs(b.gameObject.body.mass/mass-5.76)<.01);assert(g.runtime.velocity(b).every((n,i)=>Math.abs(n-v[i])<1e-6));assert.equal(JSON.stringify(g.layoutData),definition);frames(g,14);assert.equal(b.radius,10);assert(Math.abs(b.gameObject.body.mass-mass)<.001);g.shutdown();});

test('捕獲中の巨大化を拒否し、次球では弾種と半径を初期値へ戻す',()=>{const a=loadApp(),g=game(a,[device(a,'capture')]),o=find(g,'capture');g.runtime.capture(o,g.ball);assert.equal(g.runtime.action.upgrade(g.ball,{kind:'blast',scale:3,duration:5}),false);assert.equal(g.ball.radius,10);g.runtime.releaseAll(o);g.runtime.action.upgrade(g.ball,{kind:'blast',scale:3,duration:5});assert.equal(g.ball.radius,30);g.runtime.resetRound();assert.equal(g.ball.radius,10);assert.equal(g.runtime.action.kind(g.ball),'normal');assert.equal(g.ball.color,'#ffffff');g.shutdown();});

test('巨大化できる空きがない場合は形状を変更せず、重なりを作らない',()=>{const a=loadApp(),g=game(a,[{type:'wall',x:400,y:350,width:700,height:500}]);g.ball.gameObject.setPosition(400,350);assert.equal(g.runtime.action.resizeBall(g.ball,50),false);assert.equal(g.ball.radius,10);g.shutdown();});

test('巨大化した親からの子球も同じ期限で元の半径へ戻る',()=>{const a=loadApp(),g=game(a);g.runtime.action.upgrade(g.ball,{kind:'blast',scale:2,duration:.25});g.runtime.spawnFan(g.ball,1,300,90,0,g.ball);const child=g.balls[1];assert(child);assert.equal(child.radius,20);frames(g,17);assert.equal(child.radius,10);assert.equal(g.runtime.action.kind(child),'normal');g.shutdown();});

for(const [key,ballHit,flipHit]of [['enemyTrooper',true,true],['enemyArmor',true,false],['enemyShield',false,true],['enemyPhantom',false,false]])test(key+': 弾とフリッパーの撃破条件を独立して守る',()=>{const a=loadApp(),g=game(a,[enemy(a,key),{type:'flipper',x:260,y:850,width:120,height:24,isLeft:true}]),o=find(g,key),f=g.objects.find(o=>o.type==='flipper'),hp=o.runtime.health;
 g.runtime.damage(o,1,g.ball,'ball');assert.equal(o.runtime.health,hp-(ballHit?1:0));g.runtime.damage(o,1,f,'flipper');assert.equal(o.runtime.health,hp-(ballHit?1:0)-(flipHit?1:0));g.shutdown();});

test('弾は実接触で敵を倒し、フリッパーも実接触で盾兵を倒す',()=>{const a=loadApp();const e=enemy(a,'enemyTrooper');e.entity.components.health.max=10;const g=game(a,[e]);g.ball.gameObject.setPosition(400,300);g.runtime.setVelocity(g.ball,[0,300]);frames(g,8);assert(!find(g,'enemyTrooper'));assert.equal(g.score,200);g.shutdown();
 const shield=enemy(a,'enemyShield',340,855);const h=game(a,[shield,{type:'flipper',x:260,y:850,width:120,height:24,isLeft:true,restAngle:22,flipAngle:-38}]);h.keys.left.isDown=true;frames(h,12);assert(!find(h,'enemyShield'));assert(h.score>=300);h.shutdown();});

test('止まったフリッパーでは敵を攻撃しない',()=>{const a=loadApp(),g=game(a,[enemy(a,'enemyShield',330,850),{type:'flipper',x:260,y:850,width:120,height:24,isLeft:true,restAngle:0}]);frames(g,2);assert.equal(find(g,'enemyShield').runtime.health,20);g.shutdown();});

test('爆風と連鎖電撃は弾無効の敵を傷つけず、隣の有効な敵へ伝わる',()=>{for(const kind of ['blast','spark']){const a=loadApp(),g=game(a,[enemy(a,'enemyTrooper',400,350,'hit'),enemy(a,'enemyShield',490,350,'immune'),enemy(a,'enemyTrooper',400,450,'near')],{kind});g.runtime.action.projectileHit(g.ball,find(g,'hit'),kind);assert.equal(find(g,'immune').runtime.health,20);assert(find(g,'near').runtime.health<20);assert(g.runtime.action.effects.some(e=>e.kind===(kind==='spark'?'lightning':'blast')));g.shutdown();}});

test('貫通弾は実接触で敵を通過し、通常の壁では反射する',()=>{const a=loadApp(),g=game(a,[enemy(a,'enemyArmor',400,350),{type:'wall',x:400,y:460,width:180,height:22}],{kind:'pierce'});g.ball.gameObject.setPosition(400,290);g.runtime.setVelocity(g.ball,[0,500]);frames(g,14);assert(g.ball.gameObject.y>380);assert(g.runtime.velocity(g.ball)[1]>0);frames(g,10);assert(g.runtime.velocity(g.ball)[1]<0);g.shutdown();});

test('打者は実接触で球を強打し、再使用時間を持つ',()=>{const a=loadApp(),g=game(a,[enemy(a,'enemyBatter')]);g.ball.gameObject.setPosition(400,305);g.runtime.setVelocity(g.ball,[0,200]);frames(g,6);assert(Math.hypot(...g.runtime.velocity(g.ball))>1050);assert(find(g,'enemyBatter').runtime.counterAt>g.runtime.time);g.shutdown();});

test('時間消滅する敵は攻撃で倒れず、期限で消える',()=>{const a=loadApp(),e=enemy(a,'enemyPhantom');e.entity.components.enemy.lifetime=1;const g=game(a,[e]);g.runtime.damage(find(g,'enemyPhantom'),1000,g.ball);assert(find(g,'enemyPhantom').runtime.active);frames(g,62);assert(!find(g,'enemyPhantom'));assert.equal(g.score,0);g.shutdown();});

test('敵の侵入は残球があっても終了し、同時更新で撃破した敵は敗北を発生させない',()=>{for(const killed of [false,true]){const a=loadApp(),g=game(a,[enemy(a,'enemyRaider',400,900),device(a,'breachZone',400,920)]),e=find(g,'enemyRaider');if(killed){g.runtime.enqueue(()=>g.runtime.damage(e,100,g.ball));}g.runtime.afterStep();assert.equal(g.isGameOver,!killed);if(!killed){assert.equal(g.ballsLeft,1);assert.match(g.gameOverReason,/侵入/);}g.shutdown();}});

test('普通の敵が侵入領域へ入ってもゲームオーバーにしない',()=>{const a=loadApp(),g=game(a,[enemy(a,'enemyTrooper',400,900),device(a,'breachZone',400,920)]);g.runtime.afterStep();assert(!g.isGameOver);g.shutdown();});

test('破砕兵は破壊可能な物体だけを壊し、外周とフリッパーを保護する',()=>{const a=loadApp(),g=game(a,[enemy(a,'enemyBreaker'),device(a,'breakable',500,350),{type:'flipper',x:280,y:390,width:120,height:24,isLeft:true}]);const e=find(g,'enemyBreaker'),f=g.objects.find(x=>x.type==='flipper');g.runtime.action.enemyAct(e);g.runtime.flush();assert(!find(g,'breakable'));assert(g.objects.includes(f));assert.equal(g.objects.filter(o=>o.isBoundary).length,3);g.shutdown();});

test('出現は予告後に空いた位置へ確定し、上限・発生源破壊・次球を扱う',()=>{const a=loadApp(),g=game(a,[device(a,'enemySpawner',400,250)]),source=find(g,'enemySpawner');frames(g,35);assert(g.runtime.action.pending.length);assert.equal(g.objects.filter(o=>o.runtime?.generated).length,0);frames(g,90);const spawned=g.objects.filter(o=>o.runtime?.generated);assert(spawned.length>0);for(const o of spawned)assert(g.runtime.isClear(o.gameObject.x,o.gameObject.y,o.radius,new Set([o])));
 for(let i=0;i<60;i++)g.runtime.action.requestSpawn('breakable',100,250,source,.5);assert(g.runtime.action.pending.length<=16);g.runtime.destroy(source);g.runtime.flush();assert.equal(g.runtime.action.pending.length,0);g.runtime.resetRound();assert.equal(g.objects.filter(o=>o.runtime?.generated).length,0);g.shutdown();});

test('工兵は予告して破壊可能な障害物を増やす',()=>{const a=loadApp(),g=game(a,[enemy(a,'enemyBuilder')]);g.runtime.action.enemyAct(find(g,'enemyBuilder'));assert.equal(g.runtime.action.pending.length,1);frames(g,51);assert(g.objects.some(o=>o.runtime?.generated&&o.entity?.components?.health&&!o.entity?.components?.enemy));g.shutdown();});

test('ピストンはストロークで往復し、重力クレートは実Matterで落下する',()=>{const a=loadApp(),g=game(a,[device(a,'piston',220,430),device(a,'gravityCrate',600,250)]),p=find(g,'piston'),c=find(g,'gravityCrate'),definition=JSON.stringify(g.layoutData);frames(g,20);assert(p.gameObject.y<350);assert(c.gameObject.y>280);assert(!c.gameObject.body.isStatic);frames(g,80);assert(Math.abs(p.gameObject.y-430)<5);assert.equal(JSON.stringify(g.layoutData),definition);g.shutdown();});

test('ばね台は実接触で圧縮し、球を加速して跳ね上げる',()=>{const a=loadApp(),g=game(a,[device(a,'spring')]),s=find(g,'spring');g.ball.gameObject.setPosition(400,320);g.runtime.setVelocity(g.ball,[0,400]);frames(g,5);assert(s.runtime.springX>0);assert(g.runtime.velocity(g.ball)[1]<-850);frames(g,60);assert(s.runtime.springX<1);g.shutdown();});

test('演出要求は上限内に収まり、終了と破棄で参照を残さない',()=>{const a=loadApp(),g=game(a);for(let i=0;i<500;i++)g.runtime.action.emit('blast',400,400);assert.equal(g.runtime.action.effects.length,80);g.runtime.afterStep();assert(g.runtime.action.trails.size);g.gameOver();assert.equal(g.runtime.action.effects.length,0);assert.equal(g.runtime.action.trails.size,0);const action=g.runtime.action;g.shutdown();assert.equal(action.graphics,null);assert.equal(action.pending.length,0);});

for(let i=0;i<10;i++)test(`アクション${i+21}: 自然進行して終了し、生成数と数値を保つ`,()=>{const a=loadApp(),g=game(a,[],{table:a.PINBALL_ACTION_TABLES[i]});for(let frame=0;frame<60*120&&!g.isGameOver;frame++){if(g.waitingLaunch)g.launchBall();frames(g,1);assert(g.runtime.liveBalls().length<=24);assert(g.objects.filter(o=>o.runtime?.generated).length<=32);for(const o of g.objects)assert(Number.isFinite(o.gameObject.x)&&Number.isFinite(o.gameObject.y));}assert(g.isGameOver,a.PINBALL_ACTION_TABLES[i].id);g.shutdown();assert.equal(g.objects.length,0);assert.equal(Composite.allConstraints(g.matter.world.localWorld).length,0);});

test('生成IDが配置済みIDと重なっても既存のリンク参照を壊さない',()=>{const a=loadApp(),g=game(a,[device(a,'breakable',180,400,'action-1')]),original=find(g,'action-1');const spawned=g.runtime.action.spawnObject({preset:'enemyTrooper',x:550,y:350,owner:''});assert(spawned);assert.notEqual(spawned.runtime.id,'action-1');assert.equal(g.runtime.byId.get('action-1'),original);g.shutdown();});

test('次球への復元は元から極小・大型の球の寸法を変えない',()=>{for(const radius of [.5,120]){const a=loadApp(),g=game(a,[],{radius});g.runtime.resetRound();assert.equal(g.ball.radius,radius);g.shutdown();}});
test('特殊弾の初期色を表示し、巨大化後に捕獲・解放しても質量倍率を保持する',()=>{const a=loadApp(),g=game(a,[device(a,'capture')],{kind:'blast'}),b=g.ball,o=find(g,'capture');assert.equal(b.color,'#ff6579');b.entity.physics.mass=2;g.runtime.applyPhysics(b);b.runtime.originalMass=2;g.runtime.action.upgrade(b,{kind:'keep',scale:2,duration:5});assert.equal(b.gameObject.body.mass,8);g.runtime.capture(o,b);g.runtime.releaseAll(o);assert.equal(b.gameObject.body.mass,8);g.runtime.resetRound();assert.equal(b.color,'#ff6579');g.shutdown();});
