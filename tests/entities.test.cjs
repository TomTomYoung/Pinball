const test=require('node:test');const assert=require('node:assert/strict');
const {loadApp,scene,step,Composite}=require('./harness.cjs');
function game(a,objects=[],options={}){
 const table=options.table;const g=scene(new a.GameScene(a.app));
 g.init({layoutData:table?.layout??{schemaVersion:2,board:{width:800,height:1000},objects:[...objects,{type:'ball',x:400,y:100,radius:10,isBallPositionMarker:true,...options.marker}]},tableId:table?.id});g.create();g.time.now=0;if(g.waitingLaunch)g.launchBall();return g;
}
function frames(g,n){for(let i=0;i<n;i++){g.time.now=(g.time.now??0)+1000/60;step(g,1);g.update();}}
function ballNear(g,o,dx=0,dy=-50,v=[0,180]){const p=g.runtime.position(o);g.ball.gameObject.setPosition(p.x+dx,p.y+dy);g.runtime.setVelocity(g.ball,v);}
function device(a,key,id='test',changes={}){const o=a.entityPresetRecord(key,400,350,id);Object.assign(o,changes);return o;}
function plain(value){return JSON.parse(JSON.stringify(value));}

test('Entity式は有限値・型・参照を検証し、実行可能なコードを受け付けない',()=>{
 const {EntityModel:M}=loadApp();const e=M.expression({op:'clamp',args:[{op:'mul',args:[{ref:'self.charge'},2]},0,100]});
 assert.equal(M.evaluate(e,{self:{charge:40}}),80);assert.equal(M.evaluate(M.expression({op:'div',args:[1,0]}),{}),null);
 assert.throws(()=>M.expression({ref:'self.constructor.constructor'}));assert.throws(()=>M.expression({op:'eval',args:['alert(1)']}));
 assert.throws(()=>M.expression({op:'add',args:[Infinity,1]}));assert.equal(M.evaluate({ref:'other.missing'},{other:{}}),null);
});

test('拡張盤面は保存往復し、参照欠落・重複ID・過剰生成・初期状態の不正を拒否する',()=>{
 const a=loadApp();for(const table of a.PINBALL_LAB_TABLES){const one=a.LayoutCodec.normalize(table.layout),two=a.LayoutCodec.normalize(plain(one));assert.deepEqual(plain(two),plain(one));assert.equal(one.schemaVersion,2);}
 const one=device(a,'warp');assert.throws(()=>a.LayoutCodec.normalize({schemaVersion:2,board:{width:800,height:1000},objects:[one]}));
 const x=device(a,'splitter');x.entity.components.split.count=200;assert.throws(()=>a.LayoutCodec.object(x));
 const dup=device(a,'magnet');assert.throws(()=>a.LayoutCodec.normalize({schemaVersion:2,board:{width:800,height:1000},objects:[dup,dup]}));
 assert.throws(()=>a.EntityModel.normalize({state:{a:{bad:1}}},'wall'));
 assert.throws(()=>a.LayoutCodec.normalize({...plain(a.PINBALL_LAB_TABLES[0].layout),seed:.5}));
});

test('力場は実Matterへ加速度を加え、減速・方向転換・吸引・反発・渦を区別する',()=>{
 const a=loadApp();for(const key of ['accelerate','brake','redirect','magnet','repeller','vortex']){
  const record=device(a,key);record.entity.physics={gravityScale:0};const g=game(a,[record],{marker:{entity:{physics:{gravityScale:0}}}}),o=g.objects.find(o=>o.type==='device');
  g.ball.gameObject.setPosition(450,350);g.runtime.setVelocity(g.ball,[300,0]);const before=g.runtime.velocity(g.ball);frames(g,1);const v=g.runtime.velocity(g.ball);
  if(key==='accelerate')assert(v[1]<-1,key);if(key==='brake')assert(Math.hypot(...v)<Math.hypot(...before)-5,key);
  if(key==='redirect')assert(v[1]<-1,key);if(key==='magnet')assert(v[0]<before[0]-1,key);if(key==='repeller')assert(v[0]>before[0]+1,key);if(key==='vortex')assert(v[1]<-1,key);
  g.shutdown();
 }
});

test('往復・波形・周回・折れ線・式・回転は定義位置から動き、保存定義を変えない',()=>{
 const a=loadApp();for(const motion of [{kind:'linear',range:[80,0],period:2},{kind:'wave',range:[80,0],period:2},{kind:'orbit',range:[60,40],period:2},{kind:'path',points:[[0,0],[80,40]],period:2},{kind:'formula',x:{op:'mul',args:[{ref:'world.time'},20]},y:0},{kind:'none',angularSpeed:90}]){
  const record=device(a,'moving');record.entity.motion=motion;const g=game(a,[record]),o=g.objects.find(o=>o.type==='device'),initial=JSON.stringify(o.serialize());frames(g,30);
  assert(Math.hypot(o.gameObject.x-o.x,o.gameObject.y-o.y)>1||Math.abs(o.gameObject.rotation)>.1,motion.kind);assert.equal(JSON.stringify(o.serialize()),initial);g.shutdown();
 }
});

test('指定反射は実接触で方向を変更し、条件が偽の反射ルールは通常の衝突を残す',()=>{
 const a=loadApp(),record=device(a,'reflector');const g=game(a,[record]),o=g.objects.find(o=>o.type==='device');ballNear(g,o,0,-26,[0,300]);frames(g,5);assert(g.runtime.velocity(g.ball)[1]<-400);g.shutdown();
 const conditional=device(a,'reflector');conditional.entity.rules[0].if=false;const h=game(a,[conditional]);const d=h.objects.find(o=>o.type==='device');ballNear(h,d,0,-26,[0,300]);frames(h,5);assert(h.runtime.velocity(h.ball)[1]<0);h.shutdown();
});

test('実接触で捕獲した球は生存し、期限で安全な位置へ解放される',()=>{
 const a=loadApp(),g=game(a,[device(a,'capture')]),o=g.objects.find(o=>o.type==='device');ballNear(g,o,0,-38,[0,120]);frames(g,5);
 assert.equal(g.ball.runtime.heldBy,o);assert.equal(g.runtime.liveBalls().length,1);assert(g.ball.gameObject.body.isStatic);
 frames(g,85);assert.equal(g.ball.runtime.heldBy,null);assert(!g.ball.gameObject.body.isStatic);assert(g.runtime.velocity(g.ball)[1]<0);assert.equal(g.ballsLeft,1);g.shutdown();
});

test('ワープは対の出口へ転送し、直後の往復を抑止し、速度を維持する',()=>{
 const a=loadApp(),one=device(a,'warp','one'),two=device(a,'warp','two',{x:600,y:500});one.entity.components.warp.target='two';two.entity.components.warp.target='one';
 const g=game(a,[one,two],{marker:{entity:{physics:{gravityScale:0}}}}),o=g.objects.find(o=>o.entity?.id==='one');ballNear(g,o,0,-38,[0,300]);frames(g,4);
 assert(g.ball.gameObject.x>550);assert(g.ball.gameObject.y<500);assert(g.ball.runtime.warpUntil>g.runtime.time);assert(Math.hypot(...g.runtime.velocity(g.ball))>250);g.shutdown();
});

test('実接触で壁の耐久が減り、破壊得点と物理ボディ除去が一度だけ成立する',()=>{
 const a=loadApp(),g=game(a,[device(a,'breakable')]),o=g.objects.find(o=>o.type==='device');const count=Composite.allBodies(g.matter.world.localWorld).length;
 for(let hit=0;hit<2;hit++){ballNear(g,o,0,-70,[0,400]);frames(g,10);g.ball.gameObject.setPosition(200,100);g.runtime.setVelocity(g.ball,[0,0]);frames(g,2);}
 assert.equal(o.runtime.health,0);assert(!o.runtime.active);assert.equal(g.score,150);assert.equal(Composite.allBodies(g.matter.world.localWorld).length,count-1);g.runtime.damage(o,100,g.ball);assert.equal(g.score,150);g.shutdown();
});

test('弾破壊領域はラウンドの最後の球を一度だけ失わせる',()=>{
 const a=loadApp(),g=game(a,[device(a,'destroyer')]),o=g.objects.find(o=>o.type==='device');ballNear(g,o,0,-38,[0,200]);frames(g,6);assert(g.isGameOver);assert.equal(g.ballsLeft,0);assert.equal(g.score,75);g.update();assert.equal(g.ballsLeft,0);g.shutdown();
});

test('分裂は複数球を生成し、親の消費と世代上限、全滅時だけの残球減少を守る',()=>{
 const a=loadApp(),g=game(a,[device(a,'splitter')]),o=g.objects.find(o=>o.type==='device');ballNear(g,o,0,-38,[0,200]);frames(g,5);
 assert.equal(g.runtime.liveBalls().length,3);assert(!g.ball.runtime.active);assert.equal(g.ballsLeft,1);
 const [first,...rest]=g.runtime.liveBalls();first.gameObject.setPosition(400,1100);g.update();assert.equal(g.ballsLeft,1);assert.equal(g.runtime.liveBalls().length,2);
 for(const b of rest)b.gameObject.setPosition(400,1100);g.update();assert(g.isGameOver);assert.equal(g.ballsLeft,0);g.shutdown();
});

test('弾同士は実Matterで反射し、衝突除外の設定も適用できる',()=>{
 const a=loadApp(),g=game(a,[],{marker:{entity:{physics:{gravityScale:0}}}});g.runtime.spawnFan(g.ball,1,600,0,0,g.ball);const b=g.balls.find(b=>b!==g.ball);assert(b);
 g.ball.gameObject.setPosition(370,300);b.gameObject.setPosition(430,300);g.runtime.setVelocity(g.ball,[300,0]);g.runtime.setVelocity(b,[-300,0]);frames(g,8);
 assert(g.runtime.velocity(g.ball)[0]<0);assert(g.runtime.velocity(b)[0]>0);g.shutdown();
 const h=game(a,[],{marker:{entity:{physics:{gravityScale:0,ballCollision:false}}}});h.runtime.spawnFan(h.ball,1,600,0,0,h.ball);const other=h.balls.find(b=>b!==h.ball);
 h.ball.gameObject.setPosition(370,300);other.gameObject.setPosition(430,300);h.runtime.setVelocity(h.ball,[300,0]);h.runtime.setVelocity(other,[-300,0]);frames(h,10);
 assert(h.runtime.velocity(h.ball)[0]>0);assert(h.runtime.velocity(other)[0]<0);assert.equal(h.ball.gameObject.body.collisionFilter.mask,14);h.shutdown();
});

test('吸収後の発射待ちは残球を減らさず、3球を再生成する',()=>{
 const a=loadApp(),g=game(a,[device(a,'absorber')]),o=g.objects.find(o=>o.type==='device');ballNear(g,o,0,-38,[0,200]);frames(g,5);
 assert.equal(g.runtime.liveBalls().length,0);assert(g.runtime.hasPendingBalls());assert.equal(g.ballsLeft,1);frames(g,40);assert.equal(g.runtime.liveBalls().length,3);assert.equal(g.ballsLeft,1);assert.equal(o.runtime.charge,0);g.shutdown();
});

test('発射台は保持入力でチャージし、解除で発射、取消では発射しない',()=>{
 const a=loadApp(),g=game(a,[device(a,'launcher')]),o=g.objects.find(o=>o.type==='device');ballNear(g,o,0,-38,[0,200]);frames(g,4);assert(g.ball.runtime.heldBy);
 g.keys.action.isDown=true;frames(g,50);assert(o.runtime.charge>30);
 g.keys.action.isDown=false;g.runtime.cancelInput();frames(g,1);assert(g.ball.runtime.heldBy);assert.equal(o.runtime.charge,0);
 g.keys.action.isDown=true;frames(g,50);g.keys.action.isDown=false;frames(g,1);assert.equal(g.ball.runtime.heldBy,null);assert(g.runtime.velocity(g.ball)[1]<-600);g.shutdown();
});

test('チャージフリッパーは押下中に溜め、解除時に実際のヒンジでスウィングする',()=>{
 const a=loadApp(),table=a.PINBALL_TABLES.find(t=>t.id==='lab-charge-swing'),g=game(a,[],{table});g.ball.gameObject.setPosition(400,100);g.runtime.setVelocity(g.ball,[0,-200]);
 const f=g.objects.find(o=>o.type==='flipper'&&o.isLeft),initial=f.gameObject.rotation;g.keys.left.isDown=true;frames(g,35);assert(f.runtime.chargeLevel>.5);assert(!f.isFlipping);assert(Math.abs(f.gameObject.rotation-initial)<.1);
 g.keys.left.isDown=false;frames(g,8);assert(f.isFlipping);assert(f.gameObject.rotation<initial-.3);assert.equal(Composite.allConstraints(g.matter.world.localWorld).length,2);g.shutdown();
});

test('伸長は支点を維持し、散弾は実接触で増え、入力コマンドを認識する',()=>{
 const a=loadApp(),g=game(a,[],{table:a.PINBALL_TABLES.find(t=>t.id==='lab-extend-burst')}),f=g.objects.find(o=>o.type==='flipper'&&o.isLeft);
 g.keys.left.isDown=true;frames(g,18);assert(f.width>155);assert.equal(Composite.allConstraints(g.matter.world.localWorld).length,2);
 const hinge=f.hinge,body=f.gameObject.body;assert(Math.hypot(body.position.x+hinge.pointB.x-hinge.pointA.x,body.position.y+hinge.pointB.y-hinge.pointA.y)<3);
 g.keys.left.isDown=false;frames(g,1);g.keys.right.isDown=true;frames(g,1);g.keys.right.isDown=false;g.keys.action.isDown=true;frames(g,1);assert(f.runtime.commandUntil>g.runtime.time);
 g.keys.action.isDown=false;g.keys.left.isDown=false;frames(g,25);
 const angle=f.restAngle*Math.PI/180;g.ball.gameObject.setPosition(f.x+f.width*.8*Math.cos(angle),f.y+f.width*.8*Math.sin(angle)-22);g.runtime.setVelocity(g.ball,[0,60]);g.keys.left.isDown=true;frames(g,10);
 assert(g.runtime.liveBalls().length>1);g.shutdown();
});

test('ルールの条件・資源消費・状態・信号・一時補正と作用上限が機能する',()=>{
 const a=loadApp(),x=device(a,'magnet','source');delete x.entity.components.field;
 x.entity.components.charge={maximum:100,initial:40};x.entity.links={receiver:'receiver'};
 x.entity.rules=[{id:'fire',on:'input.down',input:'action',cooldown:1,effects:[{op:'fire',target:'self',count:2,speed:500,cost:20},{op:'signal',target:'link:receiver',name:'open',value:1}]}];
 const y=device(a,'magnet','receiver',{x:600});y.entity.rules=[{on:'signal',signal:'open',effects:[{op:'state',target:'self',key:'enabled',value:false}]}];
 const g=game(a,[x,y]),o=g.objects.find(o=>o.entity?.id==='source'),r=g.objects.find(o=>o.entity?.id==='receiver');g.keys.action.isDown=true;frames(g,2);
 assert.equal(o.runtime.charge,20);assert.equal(g.runtime.liveBalls().length,3);assert.equal(r.runtime.vars.enabled,false);
 g.runtime.effect({op:'modify',target:'other',key:'attack',value:2,operation:'multiply',duration:.1},o,g.ball,{});assert.equal(g.runtime.modifier(g.ball,'attack',10),20);frames(g,10);assert.equal(g.runtime.modifier(g.ball,'attack',10),10);
 for(let i=0;i<20;i++)g.runtime.spawnFan(o,8,600,-90,100);assert(g.runtime.liveBalls().length<=a.EntityRuntime.MAX_BALLS);g.shutdown();
});

for(let index=0;index<10;index++)test(`試遊${index+11}: 無操作でも3球が進み、終了時に球・ヒンジ・実行状態を解放する`,()=>{
 const a=loadApp(),table=a.PINBALL_LAB_TABLES[index],g=game(a,[],{table});
 for(let frame=0;frame<60*100&&!g.isGameOver;frame++){
  if(g.waitingLaunch)g.launchBall();frames(g,1);
  for(const b of g.runtime.liveBalls()){assert(Number.isFinite(b.gameObject.x)&&Number.isFinite(b.gameObject.y),table.id);assert(b.gameObject.x>0&&b.gameObject.x<800,table.id+' exterior');}
  assert(g.runtime.liveBalls().length<=24);assert.equal(Composite.allConstraints(g.matter.world.localWorld).length,2);
 }
 assert(g.isGameOver,table.id+' stalled');assert.equal(g.ballsLeft,0);g.shutdown();assert.equal(g.objects.length,0);assert.equal(g.balls.length,0);
});


test('破壊イベントから子球を生成した後、破壊済み物体を一度だけ除去する',()=>{
 const a=loadApp(),record=device(a,'breakable');record.entity.rules=[{on:'destroy',effects:[{op:'fire',target:'self',count:2,speed:500,angle:-90}]}];
 const g=game(a,[record]),o=g.objects.find(o=>o.type==='device');g.runtime.damage(o,50,g.ball);g.runtime.flush();
 assert.equal(g.runtime.liveBalls().length,3);assert(!g.objects.includes(o));assert(!g.runtime.records.has(o));assert.equal(g.score,150);g.runtime.destroy(o);g.runtime.flush();assert.equal(g.runtime.liveBalls().length,3);g.shutdown();
});

test('捕獲中の主球をリセットすると静的化・衝突除外・保持参照を解除する',()=>{
 const a=loadApp(),g=game(a,[device(a,'capture')]),o=g.objects.find(o=>o.type==='device');g.runtime.capture(o,g.ball);assert(g.ball.gameObject.body.isStatic);
 g.runtime.resetRound();assert(!g.ball.gameObject.body.isStatic);assert.equal(g.ball.runtime.heldBy,null);assert.equal(o.runtime.held.length,0);assert.equal(g.ball.gameObject.body.collisionFilter.mask,0xffffffff);assert.equal(g.runtime.liveBalls().length,1);g.shutdown();
});

test('検知領域は進入・退出を一度ずつ通知し、装着は親の移動と破壊へ追従する',()=>{
 const a=loadApp(),parent=device(a,'moving','parent'),child=device(a,'magnet','child');delete child.entity.components.field;
 child.entity.attachment={target:'parent',offset:[0,80],onParentDestroyed:'destroy'};child.sensor=true;
 child.entity.regions=[{id:'sense',shape:'circle',radius:50}];child.entity.state={inside:false};child.entity.rules=[{on:'enter',effects:[{op:'state',target:'self',key:'inside',value:true},{op:'score',target:'self',value:1}]},{on:'exit',effects:[{op:'state',target:'self',key:'inside',value:false}]}];
 const g=game(a,[parent,child],{marker:{entity:{physics:{gravityScale:0}}}}),p=g.objects.find(o=>o.entity?.id==='parent'),c=g.objects.find(o=>o.entity?.id==='child');frames(g,15);
 assert(Math.abs(c.gameObject.x-p.gameObject.x)<1);assert(Math.abs(c.gameObject.y-p.gameObject.y-80)<1);
 ballNear(g,c,0,0,[0,0]);frames(g,2);assert.equal(c.runtime.vars.inside,true);assert.equal(g.score,1);g.ball.gameObject.setPosition(700,100);frames(g,1);assert.equal(c.runtime.vars.inside,false);
 g.runtime.destroy(p);g.runtime.flush();frames(g,1);assert(!c.runtime.active);assert(!g.objects.includes(c));g.shutdown();
});
