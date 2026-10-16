// Runtime-only state and effects. Layout definitions remain immutable during play.
class EntityRuntime {
    static MAX_BALLS = 24;
    constructor(scene) {
        this.scene=scene; this.time=0; this.dt=1/60; this.serial=0; this.contactSerial=0; this.frame=0;
        this.records=new Map();this.byId=new Map();this.queue=[];this.removals=[];this.signals=[];this.pendingBursts=[];
        this.input={left:false,right:false,action:false};this.lastTap={};this.sequence=[];this.cancelled=false;
        this.seed=(scene.layoutData.seed??12345)>>>0;this.trace=[];this.eventBudget=0;this.round=0;
        for(const o of scene.objects)this.register(o);
        for(const o of [...this.records.keys()])this.emit(o,'spawn',null,{});
        this.flush();
    }
    random() { this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296; }
    register(o, generation=0) {
        const spec=o.entity??{},c=spec.components??{};
        const r={uid:++this.serial,id:spec.id||'runtime-'+this.serial,spec,active:true,generation,born:this.time,health:c.health?.max??null,charge:c.charge?.initial??0,
            vars:EntityModel.clone(spec.state??{}),timers:new Map(),counts:new Map(),zones:new Map(),held:[],heldBy:null,warpUntil:0,captureUntil:0,claimed:false,
            base:{x:o.x,y:o.y,angle:o.angle,width:o.width,height:o.height,mass:o.gameObject?.body?.mass},modifiers:[],swing:0,chargeLevel:0,flipperState:'ready',releasedCharge:0};
        o.runtime=r;this.records.set(o,r);this.byId.set(r.id,o);this.applyPhysics(o);
        if(this.scene.add.graphics && (o.type==='device'||c.health||c.flipper)) {
            r.graphics=this.scene.add.graphics().setDepth(30);
            if(o.type==='device')r.label=this.scene.add.text(o.x,o.y,o.deviceLabel(),{fontSize:'12px',fontFamily:'Arial',color:'#f0fbff',fontStyle:'bold'}).setOrigin(.5).setDepth(31);
        }
        return r;
    }
    applyPhysics(o) {
        const body=o.gameObject?.body,p=o.entity?.physics;
        if(!body||!p)return;
        if(p.mass!==undefined&&!body.isStatic)this.scene.matter.body.setMass(body,p.mass);
        if(p.frictionAir!==undefined)body.frictionAir=p.frictionAir;
        if(o.type==='ball')body.collisionFilter.mask=p.ballCollision===false?6:0xffffffff;
    }
    liveBalls() { return this.scene.balls.filter(b=>b.runtime?.active&&b.gameObject); }
    hasPendingBalls() { return this.pendingBursts.length>0; }
    body(o) { return o?.gameObject?.body; }
    position(o) { const b=this.body(o);return b?b.position:{x:o?.x??0,y:o?.y??0}; }
    velocity(o) { const v=this.body(o)?.velocity;return v?[v.x*60,v.y*60]:[0,0]; }
    surfaceVelocity(o,point) {const v=this.velocity(o),p=this.position(o),w=(this.body(o)?.angularVelocity??0)*60;return[v[0]-w*(point[1]-p.y),v[1]+w*(point[0]-p.x)];}
    angle(o) { return (this.body(o)?.angle??0)*180/Math.PI; }
    vectorAt(angle,speed) { const a=angle*Math.PI/180;return [Math.cos(a)*speed,Math.sin(a)*speed]; }
    setVelocity(o,v) { if(this.body(o)&&Array.isArray(v)&&v.length===2&&v.every(Number.isFinite))o.gameObject.setVelocity(Math.max(-1320,Math.min(1320,v[0]))/60,Math.max(-1320,Math.min(1320,v[1]))/60); }
    addAcceleration(o,v) {
        const b=this.body(o);if(!b||b.isStatic||!v?.every(Number.isFinite))return;
        b.force.x+=b.mass*v[0]/1e6;b.force.y+=b.mass*v[1]/1e6;
    }
    view(o) {
        if(!o)return null;const r=o.runtime,b=this.body(o),p=this.position(o),v=this.velocity(o);
        return {id:r?.id,type:o.type,roles:r?.spec.roles??[o.type==='ball'?'projectile':o.type==='flipper'?'flipper':'object'],tags:r?.spec.tags??[],owner:r?.spec.owner??'',
            position:[p.x,p.y],x:p.x,y:p.y,velocity:v,speed:Math.hypot(...v),angle:this.angle(o),mass:b?.mass??0,
            health:r?.health??0,charge:r?.charge??0,heldCount:r?.held.length??0,active:r?.active??false,generation:r?.generation??0,state:{...r?.vars},age:this.time-(r?.born??0)};
    }
    context(self,other,event) {return {self:this.view(self),other:this.view(other),event,input:{...this.input},world:{time:this.time,dt:this.dt,balls:this.liveBalls().length,score:this.scene.score,round:this.round,random:this.random()}};}
    target(e,self,other) {
        if(e.target==='self')return [self];if(e.target==='other')return other?[other]:[];
        if(e.target==='owner')return [this.byId.get(self.entity?.owner)].filter(Boolean);
        if(e.target==='nearby'){const p=this.position(self);return this.liveBalls().filter(b=>Math.hypot(this.position(b).x-p.x,this.position(b).y-p.y)<(self.entity?.components?.field?.radius??150));}
        if(e.target.startsWith('link:'))return [this.byId.get(self.entity?.links?.[e.target.slice(5)])].filter(Boolean);
        return [];
    }
    emit(self,on,other,event={}) {
        const r=self?.runtime;if(!r||!r.active||!r.spec.rules?.some(rule=>rule.on===on)||this.eventBudget++>512)return;
        const ctx=this.context(self,other,event),groups=new Set();let overridesCollision=false;
        const rules=[...(r.spec.rules??[])].filter(rule=>rule.on===on).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id));
        for(const rule of rules){
            if(rule.input&&rule.input!==event.action||rule.signal&&rule.signal!==event.name)continue;
            if(rule.exclusiveGroup&&groups.has(rule.exclusiveGroup))continue;
            let suffix='';if(rule.scope==='pair')suffix=other?.runtime?.uid??'';if(rule.scope==='contact')suffix=event.contactId??this.frame;if(rule.scope==='swing')suffix=r.swing;if(rule.scope==='round')suffix=this.round;
            const key=rule.id+':'+suffix;
            if((r.timers.get(key)??-1)>this.time||rule.limit&&(r.counts.get(key)??0)>=rule.limit||!EntityModel.evaluate(rule.if,ctx))continue;
            r.timers.set(key,this.time+rule.cooldown);r.counts.set(key,(r.counts.get(key)??0)+1);
            if(rule.exclusiveGroup)groups.add(rule.exclusiveGroup);
            if(on==='contact'&&rule.effects.some(e=>['reflect','teleport','capture','destroy'].includes(e.op)))overridesCollision=true;
            const evaluated=rule.effects.map(e=>{const effect={...e};for(const k of ['value','vector','angle','count','spread','speed','cost'])if(e[k]!==undefined)effect[k]=EntityModel.evaluate(e[k],ctx);return effect;});
            for(const effect of evaluated)for(const target of this.target(effect,self,other))this.enqueue(()=>this.effect(effect,self,target,event));
            if(this.trace.length<120)this.trace.push({time:this.time,id:r.id,rule:rule.id});
        }
        return overridesCollision;
    }
    enqueue(action) { if(this.queue.length<256)this.queue.push(action); }
    flush() { let n=0;while(this.queue.length&&n++<512)this.queue.shift()();if(this.queue.length){this.queue=[];this.scene.app.notify?.('連鎖作用が上限に達しました。');}for(const remove of this.removals.splice(0))remove(); }
    cancelInput() {
        this.cancelled=true;this.sequence=[];this.lastTap={};
        for(const [o,r]of this.records){r.chargeLevel=0;r.releasedCharge=0;r.flipperState='ready';r.down=false;if(o.type==='flipper')o.reset();if(r.spec.components?.capture?.manual)r.charge=0;}
        for(const action of ['left','right','action'])if(this.input[action])for(const o of this.records.keys())this.emit(o,'input.cancel',null,{action});
        this.input={left:false,right:false,action:false};
    }
    readInput() {
        const keys=this.scene.keys??{},touch=this.scene.app.touch??{};
        const next={left:!!(keys.left?.isDown||keys.z?.isDown||touch.left?.size),right:!!(keys.right?.isDown||keys.slash?.isDown||touch.right?.size),action:!!(keys.action?.isDown||this.scene.app.actionDown)};
        const cancelled=this.cancelled;this.cancelled=false;
        for(const action of ['left','right','action']){
            if(next[action]&&!this.input[action]) {
                if(action==='action')this.actionHeldSince=this.time;
                for(const o of this.records.keys())this.emit(o,'input.down',null,{action});
                if(this.time-(this.lastTap[action]??-99)<.35){for(const o of this.records.keys())this.emit(o,'input.double',null,{action});if(action==='action')this.boostCharge(25);}
                this.lastTap[action]=this.time;this.sequence.push({action,time:this.time});this.sequence=this.sequence.filter(i=>this.time-i.time<=1.4).slice(-3);
                if(this.sequence.map(i=>i.action).join(',')==='left,right,action'){
                    for(const[o,r]of this.records){this.emit(o,'input.command',null,{action,name:'left-right-action'});if(r.spec.components?.flipper?.command)r.commandUntil=this.time+6;}
                    this.boostCharge(50);this.sequence=[];this.scene.app.notify?.('コマンド成立：6秒間、散弾を強化！');
                }
            }
            if(!next[action]&&this.input[action]&&!cancelled){
                for(const o of this.records.keys())this.emit(o,'input.up',null,{action});
                if(action==='action'){if(this.time-(this.actionHeldSince??this.time)<.18)this.boostCharge(10);else for(const[o,r]of this.records)if(r.spec.components?.capture?.manual&&r.held.length)this.enqueue(()=>this.releaseAll(o));}
            }
            if(next[action])for(const o of this.records.keys())this.emit(o,'input.hold',null,{action});
        }
        this.input=next;
    }
    boostCharge(amount) {for(const[o,r]of this.records)if(r.spec.components?.charge&&r.held.length)this.charge(o,amount);}
    beforeStep(delta=1000/60) {
        if(this.scene.waitingLaunch||this.scene.isGameOver)return;
        this.dt=Math.min(.05,Math.max(.001,delta/1000));this.time+=this.dt;this.frame++;this.eventBudget=0;
        for(const r of this.records.values()){r.claimed=false;for(const[k,t]of r.timers)if(t<this.time)r.timers.delete(k);while(r.counts.size>256)r.counts.delete(r.counts.keys().next().value);r.modifiers=r.modifiers.filter(m=>m.until>this.time);}
        this.readInput();
        const signals=this.signals.splice(0,64);for(const s of signals)if(s.target.runtime?.active)this.emit(s.target,'signal',s.source,{name:s.name,value:s.value});
        for(const[o,r]of [...this.records]){
            if(!r.active)continue;const c=r.spec.components??{},body=this.body(o);
            if(c.lifetime&&this.time-r.born>c.lifetime.seconds)this.enqueue(()=>this.destroy(o));
            if(o.type==='ball'&&r.heldBy){this.positionHeld(o);continue;}
            if(body&&!body.isStatic&&(r.spec.physics?.gravityScale!==undefined||r.modifiers.some(m=>m.key==='gravity'))){const g=this.scene.matter.world.engine.gravity,scale=g.scale??.001;body.force.x+=body.mass*g.x*scale*(this.modifier(o,'gravity',r.spec.physics?.gravityScale??1)-1);body.force.y+=body.mass*g.y*scale*(this.modifier(o,'gravity',r.spec.physics?.gravityScale??1)-1);}
            this.move(o,r);
            if(c.field&&r.vars.enabled!==false)this.field(o,c.field);
            if(c.charge&&r.held.length&&this.input.action)this.charge(o,c.charge.rate*this.dt);
            if(c.capture)for(const held of [...r.held])if(this.time-(held.runtime?.heldAt??0)>=c.capture.hold)this.enqueue(()=>this.release(o,held));
            if(r.spec.regions)this.regions(o,r.spec.regions);
            this.emit(o,'tick',null,{dt:this.dt});
        }
        this.flush();
    }
    move(o,r) {
        const body=this.body(o);if(!body)return;
        const attachment=r.spec.attachment;
        if(attachment){const parent=this.byId.get(attachment.target);if(!parent?.runtime?.active){if(attachment.onParentDestroyed==='destroy')this.enqueue(()=>this.destroy(o));return;}const pos=this.position(parent),a=this.angle(parent)*Math.PI/180,[x,y]=attachment.offset;this.moveBody(o,pos.x+x*Math.cos(a)-y*Math.sin(a),pos.y+x*Math.sin(a)+y*Math.cos(a),(this.angle(parent)+attachment.angle)*Math.PI/180);return;}
        const m=r.spec.motion;if(!m)return;
        const t=this.time,phase=t/m.period+m.phase/360,a=phase*Math.PI*2;let x=0,y=0,angle=(r.base.angle+m.angularSpeed*t)*Math.PI/180;
        if(m.kind==='linear'){const f=1-4*Math.abs(((phase+.25)%1+1)%1-.5);x=m.range[0]*f;y=m.range[1]*f;}
        if(m.kind==='wave'){x=m.range[0]*Math.sin(a);y=m.range[1]*Math.sin(a);}
        if(m.kind==='orbit'){x=m.range[0]*Math.sin(a);y=m.range[1]*(1-Math.cos(a));}
        if(m.kind==='path'){let f=m.loop?((phase%1)+1)%1:Math.min(1,Math.max(0,phase));const segments=m.points.length-1,v=f*segments,i=Math.min(segments-1,Math.floor(v)),u=v-i;x=m.points[i][0]*(1-u)+m.points[i+1][0]*u;y=m.points[i][1]*(1-u)+m.points[i+1][1]*u;}
        if(m.kind==='formula'){const ctx=this.context(o,null,{dt:this.dt});x=EntityModel.evaluate(m.x,ctx);y=EntityModel.evaluate(m.y,ctx);if(m.angle!==undefined)angle=EntityModel.evaluate(m.angle,ctx)*Math.PI/180;}
        if(![x,y,angle].every(Number.isFinite)||Math.abs(x)>10000||Math.abs(y)>10000)return;
        if(m.mode==='force'){const p=this.position(o),v=this.velocity(o);this.addAcceleration(o,[(r.base.x+x-p.x)*m.stiffness-v[0]*m.damping,(r.base.y+y-p.y)*m.stiffness-v[1]*m.damping]);}
        else this.moveBody(o,r.base.x+x,r.base.y+y,angle);
    }
    moveBody(o,x,y,angle) {
        const b=this.body(o);if(!b)return;
        this.scene.matter.body.setPosition(b,{x,y},true);this.scene.matter.body.setAngle(b,angle,true);
        o.gameObject.x=x;o.gameObject.y=y;o.gameObject.rotation=angle;
    }
    field(o,f) {
        const center=this.position(o);
        for(const ball of this.liveBalls()){
            if(ball.runtime.heldBy)continue;const p=this.position(ball),dx=center.x-p.x,dy=center.y-p.y,d=Math.hypot(dx,dy);if(d>f.radius)continue;
            const v=this.velocity(ball),speed=Math.hypot(...v);let a=[0,0];
            if(f.kind==='accelerate'){if(speed<f.maxSpeed)a=this.vectorAt(f.direction+this.angle(o),f.strength);}
            else if(f.kind==='brake'){const reduced=Math.max(60,speed-f.strength*this.dt);if(speed>60)this.setVelocity(ball,v.map(x=>x*reduced/speed));}
            else if(f.kind==='redirect'){
                if(speed>0){const target=(f.direction+this.angle(o))*Math.PI/180,current=Math.atan2(v[1],v[0]),error=Math.atan2(Math.sin(target-current),Math.cos(target-current)),step=f.turnRate*Math.PI/180*this.dt;
                    this.setVelocity(ball,this.vectorAt((current+Math.max(-step,Math.min(step,error)))*180/Math.PI,Math.min(speed,f.maxSpeed)));}
            }else if(d>1){const falloff=.25+.75*(1-d/f.radius),strength=f.strength*falloff;
                if(f.kind==='attract')a=[dx/d*strength,dy/d*strength];
                if(f.kind==='repel')a=[-dx/d*strength,-dy/d*strength];
                if(f.kind==='vortex')a=[-dy/d*strength,dx/d*strength];}
            this.addAcceleration(ball,a);
        }
    }
    regions(o,regions) {
        const p=this.position(o),r=o.runtime,angle=this.angle(o)*Math.PI/180;
        for(const region of regions){const offset=region.offset,center={x:p.x+offset[0]*Math.cos(angle)-offset[1]*Math.sin(angle),y:p.y+offset[0]*Math.sin(angle)+offset[1]*Math.cos(angle)};
            for(const ball of this.liveBalls()){
                if(ball===o||ball.runtime.heldBy)continue;const b=this.position(ball),a=-(this.angle(o)+region.angle)*Math.PI/180,dx=b.x-center.x,dy=b.y-center.y,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
                const inside=region.shape==='circle'?Math.hypot(dx,dy)<=region.radius+ball.radius:Math.abs(lx)<=region.width/2+ball.radius&&Math.abs(ly)<=region.height/2+ball.radius;
                const key=region.id+':'+ball.runtime.uid,was=r.zones.get(key)??false;
                if(inside){if(!was)this.emit(o,'enter',ball,{region:region.id});this.emit(o,'stay',ball,{region:region.id,dt:this.dt});}
                else if(was)this.emit(o,'exit',ball,{region:region.id});if(inside)r.zones.set(key,true);else r.zones.delete(key);
            }
        }
    }
    controlFlipper(o,down) {
        const r=o.runtime,f=r?.spec.components?.flipper;if(!f)return false;
        if(down&&!r.down)r.swing++;
        if(f.charge){
            if(down){r.chargeLevel=Math.min(1,r.chargeLevel+this.dt/f.chargeTime);r.flipperState='charging';o.reset();}
            else if(r.down){r.releasedCharge=r.chargeLevel;r.chargeLevel=0;r.flipperState='swing';r.swingUntil=this.time+.22+r.releasedCharge*.15;r.swing++;}
            if(r.flipperState==='swing'){if(this.time<r.swingUntil)o.flip();else{r.flipperState='returning';o.reset();}}
            else if(!down)o.reset();
            o.driveMultiplier=o.isFlipping?1+(f.boost-1)*r.releasedCharge:1;
        }else{if(down)o.flip();else o.reset();}
        if(f.extend){
            const target=r.base.width+(down?f.extend:0),step=f.extend/f.extendTime*this.dt,newWidth=o.width+Math.max(-step,Math.min(step,target-o.width));
            if(Math.abs(newWidth-o.width)>.01)this.resizeFlipper(o,newWidth);
        }
        r.down=down;return true;
    }
    resizeFlipper(o,width) {
        const b=this.body(o),angle=b.angle,velocity=b.angularVelocity;o.width=width;o.updateProperties();
        const next=this.body(o),offset=(o.isLeft?1:-1)*width/2;
        this.scene.matter.body.setAngle(next,angle);this.scene.matter.body.setPosition(next,{x:o.x+offset*Math.cos(angle),y:o.y+offset*Math.sin(angle)});
        this.scene.matter.body.setAngularVelocity(next,velocity);o.gameObject.rotation=angle;o.gameObject.x=next.position.x;o.gameObject.y=next.position.y;
    }
    flipperHit(o,ball) {
        const r=o.runtime,f=r?.spec.components?.flipper;if(!f||!o.isFlipping)return;
        if(f.charge)ball.runtime.attackBoost=1+3*r.releasedCharge;
        if(f.scatter&&this.time>=(r.scatterAt??0)&&ball.runtime.generation<1){
            r.scatterAt=this.time+f.cooldown;const count=Math.min(6,f.scatter+(r.commandUntil>this.time?2:0));
            this.enqueue(()=>this.spawnFan(o,count,650,-90,f.spread,ball));
        }
    }
    contact(a,b,pair) {
        if(!a?.runtime?.active||!b?.runtime?.active)return;
        const v=this.velocity(b),n=pair.collision?.normal??{x:0,y:-1};
        const event={contactId:++this.contactSerial,normal:[n.x,n.y],velocity:v,point:[pair.collision?.supports?.[0]?.x??this.position(b).x,pair.collision?.supports?.[0]?.y??this.position(b).y],relativeSpeed:Math.hypot(v[0]-this.velocity(a)[0],v[1]-this.velocity(a)[1])};
        const c=a.entity?.components??{},br=b.runtime;
        if(b.type==='ball'&&!br.heldBy&&!br.claimed){
            const suppress=()=>{pair.isSensor=true;br.claimed=true;};
            if(c.warp&&this.time>=br.warpUntil){suppress();this.enqueue(()=>this.warp(a,b));}
            else if(c.capture&&this.time>=br.captureUntil&&a.runtime.held.length<c.capture.capacity){suppress();this.enqueue(()=>this.capture(a,b));}
            else if(c.absorber&&br.generation<1){suppress();this.enqueue(()=>this.absorb(a,b));}
            else if(c.split&&br.generation<c.split.generations&&this.time>=(a.runtime.splitAt??0)){
                suppress();a.runtime.splitAt=this.time+c.split.cooldown;this.enqueue(()=>this.split(b,c.split,a));
            }
        }
        if(this.emit(a,'contact',b,event))pair.isSensor=true;
        const attack=b.entity?.components?.attack?.damage??(b.type==='ball'?10:0);
        if(c.health&&attack>0)this.enqueue(()=>this.damage(a,this.modifier(b,'attack',attack)*(br.attackBoost??1),b));
        if(a.type==='flipper'&&b.type==='ball')this.flipperHit(a,b);
    }
    safePoint(source,ball,angle,offset=0) {
        const p=this.position(source),r=ball.radius,base=(source.radius??Math.hypot(source.width,source.height)/2)+r+6+offset;
        for(let distance=base;distance<base+200;distance+=12)for(const da of [0,-20,20,-45,45]){
            const v=this.vectorAt(angle+da,distance),x=p.x+v[0],y=p.y+v[1];if(this.isClear(x,y,r,new Set([source,ball])))return{x,y};
        }
        return null;
    }
    isClear(x,y,r,ignore=new Set()) {
        if(x<10+r||x>this.scene.board.width-10-r||y<10+r||y>this.scene.board.height-r)return false;
        for(const o of this.scene.objects){const body=this.body(o);if(ignore.has(o)||!body||body.isSensor||o.runtime&&!o.runtime.active||o.runtime?.heldBy)continue;
            const p=this.position(o),dx=x-p.x,dy=y-p.y;
            if(o.radius!==undefined){if(Math.hypot(dx,dy)<o.radius+r+1)return false;}
            else{const a=-body.angle,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a),qx=Math.max(Math.abs(lx)-o.width/2,0),qy=Math.max(Math.abs(ly)-o.height/2,0);if(Math.hypot(qx,qy)<r+1)return false;}}
        return true;
    }
    warp(source,ball) {
        if(!ball.runtime?.active)return;const w=source.entity.components.warp,exit=this.byId.get(w.target);if(!exit?.runtime?.active)return;
        const direction=w.direction+this.angle(exit),p=this.safePoint(exit,ball,direction,w.offset);
        ball.runtime.warpUntil=this.time+w.cooldown;if(!p)return;
        const speed=w.preserveSpeed?Math.max(240,Math.hypot(...this.velocity(ball))):650;
        ball.gameObject.setPosition(p.x,p.y);this.setVelocity(ball,this.vectorAt(direction,Math.min(1200,speed)));this.scene.skin?.hit(p.x,p.y);
    }
    capture(source,ball) {
        const r=source.runtime,c=source.entity?.components?.capture??{capacity:1};
        if(!r?.active||!ball.runtime?.active||ball.runtime.heldBy||r.held.length>=c.capacity)return false;
        r.held.push(ball);ball.runtime.heldBy=source;ball.runtime.heldAt=this.time;
        ball.runtime.savedMask=this.body(ball).collisionFilter.mask;this.body(ball).collisionFilter.mask=0;
        this.scene.matter.body.setStatic(this.body(ball),true);this.positionHeld(ball);this.emit(source,'capture',ball,{});return true;
    }
    positionHeld(ball) {
        const holder=ball.runtime.heldBy;if(!holder?.runtime?.active){this.release(holder,ball);return;}
        const p=this.position(holder),i=holder.runtime.held.indexOf(ball),n=holder.runtime.held.length;
        ball.gameObject.setPosition(p.x+(i-(n-1)/2)*(ball.radius*2+3),p.y);this.setVelocity(ball,[0,0]);
    }
    releaseAll(source) {for(const ball of [...source.runtime.held])this.release(source,ball);source.runtime.charge=0;}
    release(source,ball) {
        if(!ball?.runtime?.heldBy)return false;
        source??=ball.runtime.heldBy;const c=source.entity?.components?.capture??{direction:-90,speed:650,chargeBoost:0},r=source.runtime;
        const angle=c.direction+this.angle(source),p=this.safePoint(source,ball,angle);
        if(!p){if(this.time-ball.runtime.heldAt>17){this.destroy(ball);return true;}return false;}
        r.held=r.held.filter(b=>b!==ball);ball.runtime.heldBy=null;ball.runtime.captureUntil=this.time+.8;
        this.scene.matter.body.setStatic(this.body(ball),false);this.body(ball).collisionFilter.mask=ball.runtime.savedMask??0xffffffff;this.applyPhysics(ball);
        ball.gameObject.setPosition(p.x,p.y);const q=r.charge/(source.entity?.components?.charge?.maximum??100),v=this.vectorAt(angle,Math.min(1200,c.speed+c.chargeBoost*q)),carrier=this.velocity(source);
        this.setVelocity(ball,[v[0]+carrier[0],v[1]+carrier[1]]);this.emit(source,'release',ball,{});if(!r.held.length)r.charge=0;return true;
    }
    charge(o,amount) {
        const r=o.runtime,c=o.entity?.components?.charge;if(!r||!c||!Number.isFinite(amount))return;
        const old=r.charge;r.charge=Math.max(0,Math.min(c.maximum,r.charge+amount));if(old<c.maximum&&r.charge>=c.maximum)this.emit(o,'chargeFull',null,{});
    }
    absorb(source,ball) {
        if(!source.runtime.active||!ball.runtime.active)return;const c=source.entity.components.absorber;
        this.charge(source,c.gain);this.scene.addScore(50);this.destroy(ball);
        if(source.runtime.charge>=c.cost&&this.liveBalls().length<EntityRuntime.MAX_BALLS){
            source.runtime.charge-=c.cost;this.pendingBursts.push({due:this.time+c.delay,source,config:c});
        }
    }
    split(ball,c,source=ball) {
        if(!ball.runtime?.active)return 0;
        const v=this.velocity(ball),speed=c.speed||Math.max(360,Math.hypot(...v)),angle=Math.atan2(v[1],v[0])*180/Math.PI;
        const count=this.spawnFan(source,c.count,speed,angle,c.spread,ball);
        if(count&&c.consumeParent)this.destroy(ball);return count;
    }
    spawnFan(source,count,speed,angle,spread,parent=null) {
        if(!source?.gameObject||!Number.isFinite(count)||!Number.isFinite(speed)||!Number.isFinite(angle)||!Number.isFinite(spread))return 0;
        count=Math.max(0,Math.min(8,Math.floor(count),EntityRuntime.MAX_BALLS-this.liveBalls().length));let created=0;
        for(let i=0;i<count;i++){
            const direction=angle+(count===1?0:(i/(count-1)-.5)*spread),radius=parent?.radius??9,probe={radius},pos=this.safePoint(source,probe,direction);
            if(!pos)continue;
            const inherited=parent?.entity?.components??{},entity={version:1,id:'spawn-'+(++this.serial),roles:['projectile'],owner:source.runtime?.id,
                physics:{...EntityModel.clone(parent?.entity?.physics??{}),ballCollision:parent?.entity?.physics?.ballCollision??true},tags:EntityModel.clone(parent?.entity?.tags??[]),components:{lifetime:{seconds:12},attack:{damage:inherited.attack?.damage??10},...(inherited.health?{health:EntityModel.clone(inherited.health)}:{})}};
            const ball=new Ball(this.scene,pos.x,pos.y,radius,{color:parent?.color??'#ffffff',restitution:parent?.restitution??.8,friction:parent?.friction??.005,isBallPositionMarker:false,entity});
            this.scene.objects.push(ball);this.scene.balls.push(ball);const r=this.register(ball,(parent?.runtime.generation??0)+1);r.warpUntil=this.time+.25;r.captureUntil=this.time+.2;
            this.setVelocity(ball,this.vectorAt(direction,Math.min(1200,Math.max(60,speed))));this.emit(ball,'spawn',null,{});created++;
        }
        return created;
    }
    damage(o,amount,source) {
        const r=o.runtime,c=o.entity?.components?.health;if(!r?.active||!c||!Number.isFinite(amount))return;
        r.health=Math.max(0,r.health-Math.max(0,amount-c.armor));if(r.health===0){this.scene.addScore(c.score);this.destroy(o,source);}
    }
    destroy(o,source=null,quiet=false) {
        const r=o?.runtime;if(!r?.active)return;
        if(!quiet)this.emit(o,'destroy',source,{});
        for(const held of [...r.held]){if(!this.release(o,held)){held.runtime.heldBy=null;this.destroy(held);}}
        if(r.heldBy)r.heldBy.runtime.held=r.heldBy.runtime.held.filter(b=>b!==o);
        r.heldBy=null;r.active=false;r.graphics?.destroy();r.label?.destroy();r.graphics=r.label=null;
        this.scene.skin?.hit(this.position(o).x,this.position(o).y);
        if(o===this.scene.ball){this.body(o).collisionFilter.mask=0;o.gameObject.setVisible(false);this.scene.skin?.views.get(o)?.container.setVisible(false);return;}
        this.body(o).collisionFilter.mask=0;
        this.removals.push(()=>{for(const state of this.records.values())for(const key of state.zones.keys())if(key.endsWith(':'+r.uid))state.zones.delete(key);this.records.delete(o);this.byId.delete(r.id);this.scene.objects=this.scene.objects.filter(item=>item!==o);this.scene.balls=this.scene.balls.filter(item=>item!==o);o.destroy();});
    }
    modifier(o,key,fallback) {
        let value=fallback;const mods=(o.runtime?.modifiers??[]).filter(m=>m.key===key);
        for(const operation of ['add','multiply','set','min','max'])for(const m of mods.filter(x=>x.operation===operation)){
            if(operation==='add')value+=m.value;if(operation==='multiply')value*=m.value;if(operation==='set')value=m.value;if(operation==='min')value=Math.max(value,m.value);if(operation==='max')value=Math.min(value,m.value);
        }
        return Number.isFinite(value)?value:fallback;
    }
    effect(e,self,target,event) {
        if(!target?.runtime||!target.runtime.active&& !['score','signal','fire'].includes(e.op))return;
        const r=target.runtime,b=this.body(target),number=(v,otherwise=0)=>typeof v==='number'&&Number.isFinite(v)?v:otherwise;
        const vector=()=>{let v=Array.isArray(e.vector)?e.vector:[0,0];if(!v.every(Number.isFinite))return[0,0];const angle=e.space==='self'?this.angle(self):e.space==='projectile'?Math.atan2(...this.velocity(target).slice().reverse())*180/Math.PI:0,a=angle*Math.PI/180;return[v[0]*Math.cos(a)-v[1]*Math.sin(a),v[0]*Math.sin(a)+v[1]*Math.cos(a)];};
        switch(e.op){
            case 'accelerate': this.addAcceleration(target,vector());break;
            case 'impulse': {const v=this.velocity(target),imp=vector(),mass=b?.mass??1;this.setVelocity(target,[v[0]+imp[0]/mass,v[1]+imp[1]/mass]);break;}
            case 'velocity':this.setVelocity(target,vector());break;
            case 'redirect':this.setVelocity(target,this.vectorAt(number(e.angle)+ (e.space==='self'?this.angle(self):0),number(e.speed,Math.hypot(...this.velocity(target)))));break;
            case 'reflect':{
                if(e.angle!==undefined){this.setVelocity(target,this.vectorAt(number(e.angle)+(e.space==='self'?this.angle(self):0),number(e.speed,Math.hypot(...(event.velocity??this.velocity(target))))));break;}
                const n=event.normal??[0,-1],surface=this.surfaceVelocity(self,event.point??[self.x,self.y]),v=event.velocity??this.velocity(target),u=[v[0]-surface[0],v[1]-surface[1]],dot=u[0]*n[0]+u[1]*n[1],rest=number(e.value,1);
                this.setVelocity(target,[surface[0]+u[0]-(1+rest)*dot*n[0],surface[1]+u[1]-(1+rest)*dot*n[1]]);break;}
            case 'damage':this.damage(target,number(e.value),self);break;
            case 'heal':if(r.health!==null)r.health=Math.min(target.entity.components.health.max,r.health+Math.max(0,number(e.value)));break;
            case 'charge':this.charge(target,number(e.value));break;
            case 'score':this.scene.addScore(Math.max(0,Math.min(1e6,number(e.value))));break;
            case 'destroy':this.destroy(target,self);break;
            case 'capture':if(target.type==='ball')this.capture(self,target);break;
            case 'release':if(target.type==='ball')this.release(r.heldBy,target);else this.releaseAll(target);break;
            case 'teleport':{const dest=this.byId.get(e.destination??self.entity?.links?.exit);if(dest&&target.type==='ball'&&this.time>=r.warpUntil){const p=this.safePoint(dest,target,number(e.angle,-90));if(p){target.gameObject.setPosition(p.x,p.y);r.warpUntil=this.time+.6;}}break;}
            case 'split':if(target.type==='ball'&&r.generation<3)this.split(target,{count:number(e.count,3),spread:number(e.spread,45),speed:number(e.speed,600),consumeParent:e.consume??true},self);break;
            case 'fire':{const cost=Math.max(0,number(e.cost)),resource=e.resource??'charge',balance=resource==='charge'?r.charge:number(r.vars[resource]);if(balance<cost)break;
                const made=this.spawnFan(target,number(e.count,1),number(e.speed,600),number(e.angle,-90),number(e.spread,30));if(made){if(resource==='charge')r.charge-=cost;else r.vars[resource]=balance-cost;}break;}
            case 'state':if(e.key&&!['__proto__','constructor','prototype'].includes(e.key)&&['boolean','number','string'].includes(typeof e.value))r.vars[e.key]=e.value;break;
            case 'signal':if(this.signals.length<64)this.signals.push({target,source:self,name:e.name??'signal',value:e.value??0});break;
            case 'modify':{
                if(!['speed','attack','drive','gravity'].includes(e.key))break;const source=e.source??self.runtime.id;
                if(e.stack==='reject'&&r.modifiers.some(m=>m.source===source&&m.key===e.key))break;
                if(e.stack!=='independent')r.modifiers=r.modifiers.filter(m=>m.source!==source||m.key!==e.key);
                if(r.modifiers.length<32)r.modifiers.push({source,key:e.key,value:number(e.value),operation:e.operation??'add',until:this.time+(e.duration??1)});break;
            }
        }
    }
    afterStep() {
        if(this.scene.waitingLaunch||this.scene.isGameOver)return;
        this.flush();
        for(const burst of this.pendingBursts.filter(x=>x.due<=this.time))if(burst.source.runtime?.active){const c=burst.config;this.spawnFan(burst.source,c.count,c.speed,c.direction+this.angle(burst.source),c.spread);}
        this.pendingBursts=this.pendingBursts.filter(x=>x.due>this.time);
        for(const ball of this.liveBalls()){
            if(ball.runtime.heldBy)this.positionHeld(ball);
            else{const v=this.velocity(ball),speed=Math.hypot(...v),cap=this.modifier(ball,'speed',1320);if(speed>cap&&speed>0)this.setVelocity(ball,v.map(x=>x*cap/speed));}
        }
    }
    draw() {
        for(const[o,r]of this.records){if(!r.active)continue;const g=r.graphics;if(!g)continue;const p=this.position(o),c=r.spec.components??{};g.clear();
            if(c.field){g.lineStyle(1,parseInt(o.color.slice(1),16),.35);g.strokeCircle(p.x,p.y,c.field.radius);const v=this.vectorAt(c.field.direction+this.angle(o),24);g.lineBetween(p.x-v[0],p.y-v[1],p.x+v[0],p.y+v[1]);}
            const width=o.type==='flipper'?o.width:Math.max(50,o.width),y=p.y-(o.radius??o.height/2)-13;
            if(c.health){g.fillStyle(0x15202c,.9);g.fillRect(p.x-width/2,y,width,5);g.fillStyle(0xffb074,1);g.fillRect(p.x-width/2,y,width*r.health/c.health.max,5);}
            const q=c.flipper?.charge?r.chargeLevel:c.charge?r.charge/c.charge.maximum:0;
            if(c.charge||c.flipper?.charge){g.lineStyle(3,0xffd568,.9);g.strokeCircle(p.x,p.y,(o.radius??18)+5);if(q>0){g.lineStyle(5,0x7beaff,1);g.beginPath();g.arc(p.x,p.y,(o.radius??18)+5,-Math.PI/2,-Math.PI/2+2*Math.PI*q);g.strokePath();}}
            if(r.label){r.label.setPosition(p.x,p.y);r.label.setAlpha(r.held.length?.6:1);}
        }
    }
    resetRound() {
        this.round++;this.cancelInput();this.queue=[];this.signals=[];this.pendingBursts=[];
        for(const ball of [...this.scene.balls])if(ball!==this.scene.ball)this.destroy(ball,null,true);
        this.flush();
        for(const[o,r]of this.records){r.held=[];r.zones.clear();r.claimed=false;r.modifiers=[];r.down=false;r.scatterAt=0;r.splitAt=0;}
        const ball=this.scene.ball,r=ball.runtime;if(this.body(ball).isStatic)this.scene.matter.body.setStatic(this.body(ball),false);
        r.heldBy=null;r.active=true;r.generation=0;r.born=this.time;r.health=ball.entity?.components?.health?.max??null;r.attackBoost=1;r.warpUntil=0;r.captureUntil=0;r.chargeLevel=0;
        this.body(ball).collisionFilter.mask=0xffffffff;ball.gameObject.setVisible(true);this.scene.skin?.views.get(ball)?.container.setVisible(true);this.scene.skin?.refresh(ball);this.applyPhysics(ball);
        for(const[o,state]of this.records)if(o.type==='flipper'&&Math.abs(o.width-state.base.width)>.01)this.resizeFlipper(o,state.base.width);
    }
    shutdown() {this.queue=[];this.removals=[];this.signals=[];this.pendingBursts=[];for(const r of this.records.values()){r.graphics?.destroy();r.label?.destroy();}this.records.clear();this.byId.clear();}
}
