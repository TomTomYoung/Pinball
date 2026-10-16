// Action state is ephemeral. It never mutates authored layout definitions.
class ActionRuntime {
    static MAX_GENERATED=32;
    constructor(runtime){this.rt=runtime;this.scene=runtime.scene;this.pending=[];this.effects=[];this.trails=new Map();this.serial=0;this.drawClock=0;this.graphics=this.scene.add.graphics?.().setDepth(60)??null;}
    register(o){const r=o.runtime,c=o.entity?.components??{};r.originalRadius=o.radius;r.originalColor=o.color;r.originalMass=this.rt.body(o)?.mass;r.ballKind=c.projectile?.kind??'normal';r.grownUntil=0;r.kindUntil=0;r.nextEnemyAction=this.rt.time+(c.enemy?.interval??1);r.nextSpawn=this.rt.time+.5;r.spawnedCount=0;r.springX=0;r.springV=0;r.spawnOwner=null;
        if(o.type==='ball'&&r.ballKind!=='normal'){r.originalColor=o.color='#'+this.color(r.ballKind).toString(16).padStart(6,'0');o.gameObject.setFillStyle(this.color(r.ballKind));this.scene.skin?.refresh(o);}
        if(c.enemy){const b=this.rt.body(o);b.collisionFilter.category=8;b.collisionFilter.mask=1|2|4;}
    }
    kind(ball){return ball?.runtime?.ballKind??'normal';}
    color(kind){return {normal:0xd8f4ff,power:0xffbd68,blast:0xff6579,spark:0x73eaff,pierce:0xc3a1ff}[kind]??0xffffff;}
    emit(kind,x,y,color=0xffc175,size=50,points=[]){if(this.effects.length>=80)this.effects.shift();this.effects.push({kind,x,y,color,size,points,born:this.rt.time,duration:kind==='lightning'?.24:kind==='spawn'?.7:.5});}
    attackScale(ball){const c=ball.entity?.components?.projectile;return (this.kind(ball)==='power'?2.6:this.kind(ball)==='pierce'?1.5:1)*(c?.power??1);}
    canDamage(target,source,channel){const e=target?.entity?.components?.enemy;if(!e)return true;const method=channel??(source?.type==='ball'?'ball':source?.type==='flipper'?'flipper':'environment');return e.hurtBy==='both'?['ball','flipper'].includes(method):e.hurtBy===method;}
    resizeBall(ball,radius){const rt=this.rt,r=ball.runtime,b=rt.body(ball);if(!r?.active||!b||r.heldBy)return false;radius=Math.max(.5,Math.min(Math.max(60,r.originalRadius),radius));const p={...rt.position(ball)};
        let pos=null;if(radius<=ball.radius||rt.isClear(p.x,p.y,radius,new Set([ball])))pos=p;
        else for(const distance of [radius*.5,radius,2*radius]){for(let i=0;i<12;i++){const v=rt.vectorAt(i*30,distance);if(rt.isClear(p.x+v[0],p.y+v[1],radius,new Set([ball]))){pos={x:p.x+v[0],y:p.y+v[1]};break;}}if(pos)break;}
        if(!pos)return false;
        const velocity=rt.velocity(ball),angle=b.angle,omega=b.angularVelocity,filter={...b.collisionFilter},frictionAir=b.frictionAir;ball.radius=radius;ball.updateProperties();ball.gameObject.setPosition(pos.x,pos.y);rt.scene.matter.body.setAngle(rt.body(ball),angle);rt.scene.matter.body.setAngularVelocity(rt.body(ball),omega);Object.assign(rt.body(ball).collisionFilter,filter);rt.body(ball).frictionAir=frictionAir;rt.scene.matter.body.setMass(rt.body(ball),r.originalMass*(radius/r.originalRadius)**2);rt.setVelocity(ball,velocity);this.scene.skin?.refresh(ball);return true;
    }
    upgrade(ball,u){if(ball.type!=='ball'||!ball.runtime?.active||ball.runtime.heldBy)return false;const r=ball.runtime;if(u.scale>1&&this.resizeBall(ball,r.originalRadius*u.scale)){r.grownUntil=this.rt.time+u.duration;this.emit('burst',ball.gameObject.x,ball.gameObject.y,0xffcd70,80);}
        if(u.kind&&u.kind!=='keep'){r.ballKind=u.kind;r.kindUntil=this.rt.time+u.duration;ball.color='#'+this.color(u.kind).toString(16).padStart(6,'0');ball.gameObject.setFillStyle(this.color(u.kind));this.scene.skin?.refresh(ball);this.emit('ring',ball.gameObject.x,ball.gameObject.y,this.color(u.kind),65);}return true;
    }
    beforeStep(){const rt=this.rt,t=rt.time;
        for(const[o,r]of [...rt.records]){if(!r.active)continue;const c=o.entity?.components??{};
            if(o.type==='ball'){if(r.grownUntil&&t>=r.grownUntil&&this.resizeBall(o,r.originalRadius))r.grownUntil=0;if(r.kindUntil&&t>=r.kindUntil){r.kindUntil=0;r.ballKind=c.projectile?.kind??'normal';o.color=r.originalColor;o.gameObject.setFillStyle(parseInt(o.color.slice(1),16));this.scene.skin?.refresh(o);}continue;}
            if(c.enemy){if(t-r.born>=c.enemy.lifetime){rt.enqueue(()=>rt.destroy(o,null,true));continue;}const e=c.enemy,p=rt.position(o);rt.moveBody(o,r.base.x+e.sway*Math.sin((t-r.born)*2),p.y+e.speed*rt.dt,rt.body(o).angle);
                if(t>=r.nextEnemyAction&&['build','demolish'].includes(e.behavior)){r.nextEnemyAction=t+e.interval;rt.enqueue(()=>this.enemyAct(o));}
            }
            if(c.spawner&&t>=r.nextSpawn){r.nextSpawn=t+c.spawner.interval;const s=c.spawner,alive=[...rt.records.values()].filter(x=>x.active&&x.spawnOwner===r.id).length+this.pending.filter(x=>x.owner===r.id).length;if(r.spawnedCount<s.total&&alive<s.maxAlive){const p=rt.position(o);if(this.requestSpawn(s.preset,p.x+s.offset[0],p.y+s.offset[1],o,s.delay))r.spawnedCount++;}}
            if(c.piston){const m=c.piston,period=m.extend+m.hold+m.retract+m.rest,phase=(t-r.born)%period;let q=0;if(phase<m.extend)q=phase/m.extend;else if(phase<m.extend+m.hold)q=1;else if(phase<m.extend+m.hold+m.retract)q=1-(phase-m.extend-m.hold)/m.retract;const v=rt.vectorAt(m.direction+r.base.angle,m.stroke*q);rt.moveBody(o,r.base.x+v[0],r.base.y+v[1],r.base.angle*Math.PI/180);}
            if(c.spring){const s=c.spring;r.springV+=(-s.stiffness*r.springX-s.damping*r.springV)*rt.dt;r.springX=Math.max(0,Math.min(s.stroke,r.springX+r.springV*rt.dt));if(r.springX===0&&r.springV<0)r.springV=0;const v=rt.vectorAt(s.direction+r.base.angle,-r.springX);rt.moveBody(o,r.base.x+v[0],r.base.y+v[1],r.base.angle*Math.PI/180);}
            if((c.enemy||o.entity?.physics?.body==='dynamic')&&rt.position(o).y>this.scene.board.height+100)rt.enqueue(()=>rt.destroy(o,null,true));
        }
    }
    contact(a,b,pair,event){const rt=this.rt,c=a.entity?.components??{},ar=a.runtime,br=b.runtime;
        if(b.type==='ball'){
            if(c.upgrade&&rt.time>=(br.upgradeAt??0)){br.upgradeAt=rt.time+.4;rt.enqueue(()=>this.upgrade(b,c.upgrade));}
            if(c.spring&&rt.time>=(ar.springAt??0)){ar.springAt=rt.time+c.spring.cooldown;pair.isSensor=true;const s=c.spring;ar.springX=Math.min(s.stroke,8+event.relativeSpeed*.035);ar.springV=0;const speed=Math.min(1250,s.boost+ar.springX*5);rt.enqueue(()=>{if(br.active&&!br.heldBy){rt.setVelocity(b,rt.vectorAt(s.direction+rt.angle(a),speed));this.emit('burst',a.gameObject.x,a.gameObject.y,0x86ffc2,85);}});}
            if(c.enemy?.behavior==='counter'&&rt.time>=(ar.counterAt??0)){ar.counterAt=rt.time+c.enemy.interval;pair.isSensor=true;rt.enqueue(()=>{if(!br.active||br.heldBy)return;const angle=45+(rt.random()*90);rt.setVelocity(b,rt.vectorAt(angle,c.enemy.strength));this.emit('burst',rt.position(a).x,rt.position(a).y,0xff576d,115);});}
            if(c.health&&!a.isBoundary&&a.type!=='flipper'){
                const kind=this.kind(b),can=this.canDamage(a,b,'ball');
                if(!can)this.emit('shield',rt.position(a).x,rt.position(a).y,0xa4d7ff,50);
                if(kind==='pierce'&&can){pair.isSensor=true;const v=rt.velocity(b);rt.enqueue(()=>{if(br.active&&!br.heldBy)rt.setVelocity(b,v);});}
                if(kind!=='normal'&&rt.time>=(br.specialAt??0)){br.specialAt=rt.time+(b.entity?.components?.projectile?.cooldown??.22);rt.enqueue(()=>this.projectileHit(b,a,kind));}
            }
        }
    }
    projectileHit(ball,hit,kind){const rt=this.rt;if(!ball.runtime?.active)return;const p={...rt.position(hit)},c=this.color(kind);this.emit(kind==='blast'?'blast':'burst',p.x,p.y,c,kind==='blast'?155:65);
        if(kind==='power'){const body=rt.body(hit);if(body&&!body.isStatic){const v=rt.velocity(ball);rt.setVelocity(hit,[v[0]*.7,v[1]*.7]);}}
        const targets=[...rt.records.keys()].filter(o=>o!==hit&&o!==ball&&o.runtime.active&&!o.isBoundary&&o.type!=='flipper'&&o.entity?.components?.health&&this.canDamage(o,ball,'ball'));
        if(kind==='blast')for(const o of targets){const d=Math.hypot(rt.position(o).x-p.x,rt.position(o).y-p.y);if(d<=155){rt.damage(o,18,ball,'ball');const body=rt.body(o);if(body&&!body.isStatic){const v=[rt.position(o).x-p.x,rt.position(o).y-p.y],length=Math.hypot(...v)||1;rt.setVelocity(o,v.map(x=>x/length*500));}}}
        if(kind==='spark'){const points=[[p.x,p.y]],remaining=new Set(targets);let current=p;for(let i=0;i<4;i++){const candidate=[...remaining].sort((a,b)=>Math.hypot(rt.position(a).x-current.x,rt.position(a).y-current.y)-Math.hypot(rt.position(b).x-current.x,rt.position(b).y-current.y))[0];if(!candidate||Math.hypot(rt.position(candidate).x-current.x,rt.position(candidate).y-current.y)>180)break;current={...rt.position(candidate)};points.push([current.x,current.y]);remaining.delete(candidate);rt.damage(candidate,12,ball,'ball');}this.emit('lightning',p.x,p.y,c,80,points);}
    }
    flipperHit(flipper,ball){if(!flipper.isFlipping)return;const rt=this.rt,r=ball.runtime;this.emit('burst',rt.position(ball).x,rt.position(ball).y,this.color(this.kind(ball)),50+50*(flipper.runtime.releasedCharge??0));
        if(this.kind(ball)!=='normal')rt.enqueue(()=>{if(!r.active||r.heldBy)return;const speed=Math.min(1250,Math.max(900,Math.hypot(...rt.velocity(ball))*1.1));rt.setVelocity(ball,rt.vectorAt(flipper.isLeft?-65:-115,speed));});
    }
    enemyAct(o){const rt=this.rt,e=o.entity?.components?.enemy;if(!o.runtime.active||!e)return;const p=rt.position(o);
        if(e.behavior==='demolish'){const targets=[...rt.records.keys()].filter(x=>x!==o&&x.runtime.active&&!x.isBoundary&&!['ball','flipper'].includes(x.type)&&!x.entity?.components?.enemy&&x.entity?.components?.health&&Math.hypot(rt.position(x).x-p.x,rt.position(x).y-p.y)<=e.radius);for(const x of targets.slice(0,3))rt.damage(x,20,o,'environment');this.emit('blast',p.x,p.y,0xffa060,e.radius);}
        if(e.behavior==='build'){const alive=[...rt.records.values()].filter(x=>x.active&&x.spawnOwner===o.runtime.id).length+this.pending.filter(x=>x.owner===o.runtime.id).length;if(alive<4)this.requestSpawn('breakable',p.x+(o.runtime.spawnedCount++%2?95:-95),p.y+60,o,.8);}
    }
    requestSpawn(preset,x,y,source,delay=1){if(!ActionModel.spawnable.includes(preset)||this.pending.length>=16||[...this.rt.records.values()].filter(r=>r.generated).length+this.pending.length>=ActionRuntime.MAX_GENERATED)return false;
        this.pending.push({preset,x,y,owner:source?.runtime?.id??'',source,due:this.rt.time+delay,start:this.rt.time});return true;
    }
    spawnObject(item){const rt=this.rt;if(item.source&&!item.source.runtime?.active)return null;let id;do{id='action-'+(++this.serial);}while(rt.byId.has(id));let record=entityPresetRecord(item.preset,item.x,item.y,id);record.entity.components??={};record.entity.components.lifetime??={seconds:record.entity.components.enemy?.lifetime??18};record=LayoutCodec.object(record);
        const radius=record.shape==='circle'?record.radius:Math.hypot(record.width,record.height)/2;let pos=null;
        for(const d of [0,60,110,160]){for(let i=0;i<(d?8:1);i++){const v=rt.vectorAt(i*45,d);if(rt.isClear(item.x+v[0],item.y+v[1],radius)){pos={x:item.x+v[0],y:item.y+v[1]};break;}}if(pos)break;}
        if(!pos)return null;record.x=pos.x;record.y=pos.y;const object=GameObject.deserialize(this.scene,record);object.gameObject.body.collisionFilter.category=4;this.scene.objects.push(object);const r=rt.register(object);r.generated=true;r.spawnOwner=item.owner;rt.emit(object,'spawn',null,{});this.emit('spawn',pos.x,pos.y,parseInt(object.color.slice(1),16),radius+40);return object;
    }
    afterStep(){const rt=this.rt;const due=this.pending.filter(p=>p.due<=rt.time);this.pending=this.pending.filter(p=>p.due>rt.time);for(const item of due)this.spawnObject(item);
        // Damage and destruction queues have already completed. A defeated raider cannot breach.
        const zones=[...rt.records.keys()].filter(o=>o.runtime.active&&o.entity?.components?.breachZone);
        for(const[o,r]of rt.records){if(!r.active||!o.entity?.components?.enemy?.breach)continue;const p=rt.position(o),radius=o.radius??o.width/2;
            for(const z of zones){const q=rt.position(z),a=-rt.angle(z)*Math.PI/180,dx=p.x-q.x,dy=p.y-q.y,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);if(Math.hypot(Math.max(Math.abs(lx)-z.width/2,0),Math.max(Math.abs(ly)-z.height/2,0))<=radius){this.scene.gameOver('敵がゲームオーバーエリアへ侵入しました');return;}}
        }
        for(const ball of rt.liveBalls()){if(ball.runtime.heldBy)continue;const p=rt.position(ball),trail=this.trails.get(ball)??[];trail.push([p.x,p.y,rt.time]);while(trail.length>16||trail.length&&rt.time-trail[0][2]>.25)trail.shift();this.trails.set(ball,trail);}
        for(const ball of this.trails.keys())if(!ball.runtime.active||!ball.gameObject)this.trails.delete(ball);
    }
    destroyed(o,quiet){if(!quiet){const p=this.rt.position(o);this.emit(o.entity?.components?.enemy?'blast':'burst',p.x,p.y,parseInt(o.color.slice(1),16),o.entity?.components?.enemy?95:55);}this.trails.delete(o);this.pending=this.pending.filter(x=>x.source!==o);}
    resetRound(){this.pending=[];this.effects=[];this.trails.clear();const rt=this.rt;for(const[o,r]of [...rt.records])if(r.generated)rt.destroy(o,null,true);rt.flush();const ball=this.scene.ball;if(ball?.runtime){this.resizeBall(ball,ball.runtime.originalRadius);ball.runtime.ballKind=ball.entity?.components?.projectile?.kind??'normal';ball.runtime.kindUntil=ball.runtime.grownUntil=0;ball.color=ball.runtime.originalColor;ball.gameObject.setFillStyle(parseInt(ball.color.slice(1),16));this.scene.skin?.refresh(ball);}for(const r of rt.records.values()){r.nextSpawn=rt.time+.5;r.springX=0;r.springV=0;}}
    draw(){const g=this.graphics;if(!g)return;const rt=this.rt,t=rt.time;g.clear();this.effects=this.effects.filter(e=>t-e.born<e.duration);if(this.scene.isGameOver)return;const reduced=!!this.scene.app.reduceEffects;
        if(!reduced)for(const[b,trail]of this.trails){if(!b.runtime.active||b.runtime.heldBy)continue;const color=this.color(this.kind(b));for(let i=1;i<trail.length;i++){g.lineStyle(Math.max(1,b.radius*.65*i/trail.length),color,.5*i/trail.length);g.lineBetween(trail[i-1][0],trail[i-1][1],trail[i][0],trail[i][1]);}}
        for(const item of this.pending){const q=Math.max(0,Math.min(1,(t-item.start)/(item.due-item.start)));g.lineStyle(2,0xffe39f,.4+.5*q);g.strokeCircle(item.x,item.y,40-15*q);g.lineBetween(item.x-15,item.y,item.x+15,item.y);g.lineBetween(item.x,item.y-15,item.x,item.y+15);}
        for(const[o,r]of rt.records){if(!r.active)continue;const p=rt.position(o),c=o.entity?.components??{};
            if(c.breachZone){g.lineStyle(3,0xff3c67,.6+.3*Math.sin(t*5));const angle=rt.angle(o)*Math.PI/180,points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:p.x+x*o.width/2*Math.cos(angle)-y*o.height/2*Math.sin(angle),y:p.y+x*o.width/2*Math.sin(angle)+y*o.height/2*Math.cos(angle)}));for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4];g.lineBetween(a.x,a.y,b.x,b.y);}}
            if(c.spring||c.piston){const s=c.spring??c.piston,d=rt.vectorAt(s.direction+r.base.angle,1),base={x:r.base.x-d[0]*60,y:r.base.y-d[1]*60};g.lineStyle(3,parseInt(o.color.slice(1),16),.8);let prev=base;for(let i=1;i<=10;i++){const f=i/10,wiggle=i===10?0:(i%2?8:-8),next={x:base.x+(p.x-base.x)*f-d[1]*wiggle,y:base.y+(p.y-base.y)*f+d[0]*wiggle};g.lineBetween(prev.x,prev.y,next.x,next.y);prev=next;}}
            if(c.enemy){const armed=c.enemy.behavior==='counter'&&t>=(r.counterAt??0),rad=(o.radius??30)+6;g.lineStyle(armed?3:1,armed?0xff4e67:0xffffff,.7);g.strokeCircle(p.x,p.y,rad);}
        }
        for(const e of this.effects.slice(reduced?-12:-80)){const q=(t-e.born)/e.duration,alpha=1-q,r=e.size*(.2+.8*q);g.lineStyle(reduced?2:3,e.color,alpha);g.strokeCircle(e.x,e.y,r);if(reduced)continue;
            if(e.kind==='lightning'){g.lineStyle(4,e.color,alpha);for(let i=1;i<e.points.length;i++){const a=e.points[i-1],b=e.points[i],mx=(a[0]+b[0])/2+12*Math.sin(i*9),my=(a[1]+b[1])/2+10*Math.cos(i*5);g.lineBetween(a[0],a[1],mx,my);g.lineBetween(mx,my,b[0],b[1]);}}
            else {if(e.kind==='blast'){g.lineStyle(8,e.color,.25*alpha);g.strokeCircle(e.x,e.y,r*.65);}for(let i=0;i<12;i++){const a=i*Math.PI/6+e.born,v={x:Math.cos(a),y:Math.sin(a)};g.lineStyle(2+(i%3),e.color,alpha);g.lineBetween(e.x+v.x*r*.55,e.y+v.y*r*.55,e.x+v.x*r,e.y+v.y*r);}}
        }
    }
    shutdown(){this.pending=[];this.effects=[];this.trails.clear();this.graphics?.destroy();this.graphics=null;}
}
