// Declarative entity definitions. No executable text is accepted from layouts.
class EntityModel {
    static events = new Set(['spawn', 'tick', 'contact', 'enter', 'stay', 'exit', 'destroy', 'capture', 'release', 'chargeFull', 'input.down', 'input.hold', 'input.up', 'input.cancel', 'input.double', 'input.command', 'signal']);
    static operations = new Set(['accelerate','impulse','velocity','redirect','reflect','teleport','capture','release','damage','heal','charge','score','split','fire','destroy','state','signal','modify']);
    static expressionOps = {
        add:[2,8], sub:[2,2], mul:[2,8], div:[2,2], mod:[2,2], pow:[2,2], min:[1,8], max:[1,8], clamp:[3,3],
        abs:[1,1], sqrt:[1,1], sin:[1,1], cos:[1,1], atan2:[2,2], eq:[2,2], ne:[2,2], gt:[2,2], gte:[2,2], lt:[2,2], lte:[2,2],
        and:[1,8], or:[1,8], not:[1,1], vec:[2,2], length:[1,1], normalize:[1,1], dot:[2,2], distance:[2,2], has:[2,2]
    };
    static fail(message) { throw new Error('拡張設定: ' + message); }
    static clone(value) { return JSON.parse(JSON.stringify(value)); }
    static object(value, keys, name) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) this.fail(name + 'はオブジェクトで指定してください。');
        for (const key of Object.keys(value)) if (!keys.includes(key)) this.fail(name + 'の未対応項目: ' + key);
        return value;
    }
    static num(value, fallback, min, max, name) {
        const n = value === undefined ? fallback : value;
        if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) this.fail(name + 'は' + min + '～' + max + 'です。');
        return n;
    }
    static str(value, fallback, name, max = 100) {
        const s = value === undefined ? fallback : value;
        if (typeof s !== 'string' || s.length > max || /[<>\u0000]/.test(s)) this.fail(name + 'が不正です。');
        return s;
    }
    static bool(value, fallback, name) {
        if (value === undefined) return fallback;
        if (typeof value !== 'boolean') this.fail(name + 'はtrue/falseです。');
        return value;
    }
    static choice(value, fallback, choices, name) {
        value ??= fallback;
        if (!choices.includes(value)) this.fail(name + 'が未対応です。');
        return value;
    }
    static vector(value, fallback = [0,0], max = 100000) {
        value ??= fallback;
        if (!Array.isArray(value) || value.length !== 2) this.fail('ベクトルは2要素です。');
        return value.map(n => this.num(n, 0, -max, max, 'ベクトル'));
    }
    static identifier(value, fallback = '') {
        value = this.str(value, fallback, 'ID', 80);
        if (value && !/^[a-zA-Z0-9_-]+$/.test(value)) this.fail('IDは英数字・_・-で指定してください。');
        return value;
    }
    static expression(value, depth = 0) {
        if (depth > 12) this.fail('式は12段までです。');
        if (typeof value === 'number') return this.num(value, 0, -1e9, 1e9, '式の数値');
        if (typeof value === 'boolean' || value === null) return value;
        if (typeof value === 'string') return this.str(value, '', '式の文字列');
        if (Array.isArray(value)) return this.vector(value);
        if (value?.ref !== undefined) {
            this.object(value, ['ref'], '参照');
            if (typeof value.ref !== 'string' || !/^(self|other|event|input|world)(\.[a-zA-Z][a-zA-Z0-9_]*){1,5}$/.test(value.ref) || /(__proto__|prototype|constructor)/.test(value.ref)) this.fail('参照先が不正です。');
            return { ref: value.ref };
        }
        this.object(value, ['op','args'], '式');
        const arity = this.expressionOps[value.op];
        if (!arity || !Array.isArray(value.args) || value.args.length < arity[0] || value.args.length > arity[1]) this.fail('式の演算または引数が不正です。');
        return { op: value.op, args: value.args.map(a => this.expression(a, depth + 1)) };
    }
    static evaluate(e, context) {
        if (!e || typeof e !== 'object') return e;
        if (Array.isArray(e)) return [...e];
        if (e.ref) {
            let result = context;
            for (const key of e.ref.split('.')) {
                if (!result || !Object.prototype.hasOwnProperty.call(result, key)) return null;
                result = result[key];
            }
            return result;
        }
        const a = e.args.map(x => this.evaluate(x, context));
        const numeric = () => a.every(v => typeof v === 'number' && Number.isFinite(v));
        const vector = v => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
        let result;
        switch (e.op) {
            case 'and': return a.every(Boolean); case 'or': return a.some(Boolean); case 'not': return !a[0];
            case 'eq': return a[0] === a[1]; case 'ne': return a[0] !== a[1];
            case 'has': return Array.isArray(a[0]) && a[0].includes(a[1]);
            case 'length': return vector(a[0]) ? Math.hypot(...a[0]) : null;
            case 'normalize': { if (!vector(a[0])) return null; const n = Math.hypot(...a[0]); return n ? a[0].map(x => x/n) : [0,0]; }
            case 'distance': return vector(a[0]) && vector(a[1]) ? Math.hypot(a[0][0]-a[1][0],a[0][1]-a[1][1]) : null;
            case 'dot': return vector(a[0]) && vector(a[1]) ? a[0][0]*a[1][0]+a[0][1]*a[1][1] : null;
        }
        if (!numeric()) return null;
        switch (e.op) {
            case 'add': result=a.reduce((x,y)=>x+y,0); break; case 'sub': result=a[0]-a[1]; break;
            case 'mul': result=a.reduce((x,y)=>x*y,1); break; case 'div': result=a[0]/a[1]; break;
            case 'mod': result=a[0]%a[1]; break; case 'pow': result=a[0]**a[1]; break;
            case 'min': result=Math.min(...a); break; case 'max': result=Math.max(...a); break;
            case 'clamp': result=Math.max(a[1],Math.min(a[2],a[0])); break;
            case 'abs': result=Math.abs(a[0]); break; case 'sqrt': result=Math.sqrt(a[0]); break;
            case 'sin': result=Math.sin(a[0]); break; case 'cos': result=Math.cos(a[0]); break; case 'atan2': result=Math.atan2(a[0],a[1]); break;
            case 'gt': return a[0]>a[1]; case 'gte': return a[0]>=a[1]; case 'lt': return a[0]<a[1]; case 'lte': return a[0]<=a[1];
            case 'vec': return a;
        }
        return Number.isFinite(result) ? result : null;
    }
    static normalize(value, type) {
        if (value === undefined || value === null) return null;
        this.object(value, ['version','id','prototype','roles','tags','owner','links','physics','motion','components','state','rules','attachment','regions'], 'entity');
        if (value.version !== undefined && value.version !== 1) this.fail('entity.versionは1です。');
        const out = { version:1, id:this.identifier(value.id), roles:value.roles ?? [type === 'ball' ? 'projectile' : type === 'flipper' ? 'flipper' : 'object'], tags:value.tags ?? [] };
        for (const key of ['roles','tags']) {
            if (!Array.isArray(out[key]) || out[key].length > 16) this.fail(key + 'は16個までです。');
            out[key] = out[key].map(x=>this.identifier(x));
        }
        if (out.roles.some(x=>!['object','projectile','flipper'].includes(x))) this.fail('rolesが不正です。');
        if (value.prototype !== undefined) out.prototype=this.identifier(value.prototype);
        if (value.owner !== undefined) out.owner=this.identifier(value.owner);
        if (value.links) {
            if (typeof value.links !== 'object' || Array.isArray(value.links) || Object.keys(value.links).length>16) this.fail('linksは16件までです。');
            out.links={}; for(const [k,v] of Object.entries(value.links)) { this.identifier(k); if(['__proto__','constructor','prototype'].includes(k))this.fail('リンク名が不正です。');out.links[k]=this.identifier(v); }
        }
        if (value.physics) {
            const p=this.object(value.physics,['mass','gravityScale','frictionAir','ballCollision'],'physics');out.physics={};
            if(p.mass!==undefined)out.physics.mass=this.num(p.mass,1,.01,1000,'質量');
            if(p.gravityScale!==undefined)out.physics.gravityScale=this.num(p.gravityScale,1,-5,5,'重力倍率');
            if(p.frictionAir!==undefined)out.physics.frictionAir=this.num(p.frictionAir,.001,0,1,'空気摩擦');
            if(p.ballCollision!==undefined)out.physics.ballCollision=this.bool(p.ballCollision,true,'球同士の衝突');
        }
        if(value.motion) {
            const m=this.object(value.motion,['kind','mode','range','period','phase','angularSpeed','points','loop','x','y','angle','stiffness','damping'],'motion');
            const kind=this.choice(m.kind,'wave',['none','linear','wave','orbit','path','formula'],'軌道');
            out.motion={kind,mode:this.choice(m.mode,'direct',['direct','force'],'運動方法'),range:this.vector(m.range,[70,0],2000),period:this.num(m.period,4,.2,120,'周期'),phase:this.num(m.phase,0,-3600,3600,'位相'),angularSpeed:this.num(m.angularSpeed,0,-720,720,'回転速度')};
            out.motion.stiffness=this.num(m.stiffness,8,0,100,'追従の強さ');out.motion.damping=this.num(m.damping,3,0,30,'追従の減衰');
            if(kind==='path') { if(!Array.isArray(m.points)||m.points.length<2||m.points.length>32)this.fail('経路は2～32点です。');out.motion.points=m.points.map(v=>this.vector(v));out.motion.loop=this.bool(m.loop,true,'経路ループ'); }
            if(kind==='formula') { out.motion.x=this.expression(m.x??0);out.motion.y=this.expression(m.y??0);if(m.angle!==undefined)out.motion.angle=this.expression(m.angle); }
        }
        if(value.attachment) {
            const a=this.object(value.attachment,['target','offset','angle','onParentDestroyed'],'attachment');
            out.attachment={target:this.identifier(a.target),offset:this.vector(a.offset),angle:this.num(a.angle,0,-360,360,'相対角度'),onParentDestroyed:this.choice(a.onParentDestroyed,'detach',['detach','destroy'],'親の破壊時')};
        }
        if(value.regions) {
            if(!Array.isArray(value.regions)||value.regions.length>8)this.fail('検知領域は8個までです。');
            out.regions=value.regions.map(r=>{
                this.object(r,['id','shape','offset','radius','width','height','angle'],'領域');
                return {id:this.identifier(r.id,'zone'),shape:this.choice(r.shape,'circle',['circle','rectangle'],'領域形状'),offset:this.vector(r.offset),radius:this.num(r.radius,50,.5,2000,'領域半径'),width:this.num(r.width,100,1,4000,'領域幅'),height:this.num(r.height,100,1,4000,'領域高さ'),angle:this.num(r.angle,0,-180,180,'領域角度')};
            });
            if(new Set(out.regions.map(r=>r.id)).size!==out.regions.length)this.fail('領域IDが重複しています。');
        }
        if(value.components) {
            const c=this.object(value.components,['health','attack','charge','field','capture','warp','split','absorber','flipper','lifetime'],'components');out.components={};
            const numeric=(name,fields)=>{if(!c[name])return;this.object(c[name],Object.keys(fields),name);const d={};for(const[k,v]of Object.entries(fields))d[k]=this.num(c[name][k],...v,k);out.components[name]=d;};
            numeric('health',{max:[30,1,1e6],armor:[0,0,1e6],score:[100,0,1e6]});
            numeric('attack',{damage:[10,0,1e6]});numeric('charge',{maximum:[100,1,1e6],rate:[25,0,10000],initial:[0,0,1e6]});numeric('lifetime',{seconds:[12,.1,300]});
            if(c.field) {
                const f=this.object(c.field,['kind','radius','strength','direction','maxSpeed','turnRate'],'field');
                out.components.field={kind:this.choice(f.kind,'accelerate',['accelerate','attract','repel','vortex','redirect','brake'],'力場'),radius:this.num(f.radius,90,1,600,'範囲'),strength:this.num(f.strength,600,0,10000,'力場の強さ'),direction:this.num(f.direction,-90,-3600,3600,'方向'),maxSpeed:this.num(f.maxSpeed,1100,1,1320,'速度上限'),turnRate:this.num(f.turnRate,360,1,1440,'旋回速度')};
            }
            if(c.capture) {
                const a=this.object(c.capture,['hold','speed','direction','capacity','manual','chargeBoost'],'capture');
                out.components.capture={hold:this.num(a.hold,2,.1,15,'保持時間'),speed:this.num(a.speed,650,60,1200,'解放速度'),direction:this.num(a.direction,-90,-3600,3600,'方向'),capacity:this.num(a.capacity,1,1,8,'捕獲数'),manual:this.bool(a.manual,false,'手動発射'),chargeBoost:this.num(a.chargeBoost,350,0,1000,'追加速度')};
            }
            if(c.warp) {
                const w=this.object(c.warp,['target','direction','offset','cooldown','preserveSpeed'],'warp');
                out.components.warp={target:this.identifier(w.target),direction:this.num(w.direction,-90,-3600,3600,'出口方向'),offset:this.num(w.offset,0,0,300,'出口距離'),cooldown:this.num(w.cooldown,.6,.15,5,'転送間隔'),preserveSpeed:this.bool(w.preserveSpeed,true,'速度維持')};
            }
            if(c.split) {
                const s=this.object(c.split,['count','spread','speed','generations','cooldown','consumeParent'],'split');
                out.components.split={count:this.num(s.count,3,2,8,'分裂数'),spread:this.num(s.spread,55,0,180,'拡散角'),speed:this.num(s.speed,0,0,1200,'子球速度'),generations:this.num(s.generations,1,1,3,'世代'),cooldown:this.num(s.cooldown,1,.1,30,'分裂間隔'),consumeParent:this.bool(s.consumeParent,true,'親球消費')};
            }
            if(c.absorber) {
                const a=this.object(c.absorber,['gain','cost','count','spread','speed','direction','delay'],'absorber');
                out.components.absorber={gain:this.num(a.gain,30,1,1000,'吸収量'),cost:this.num(a.cost,30,1,1000,'発射消費'),count:this.num(a.count,3,1,8,'弾数'),spread:this.num(a.spread,50,0,180,'拡散角'),speed:this.num(a.speed,650,60,1200,'発射速度'),direction:this.num(a.direction,-90,-3600,3600,'発射方向'),delay:this.num(a.delay,.5,0,3,'発射待ち')};
            }
            if(c.flipper) {
                if(type!=='flipper')this.fail('フリッパー機能はflipperに付けてください。');
                const f=this.object(c.flipper,['charge','chargeTime','boost','extend','extendTime','scatter','spread','cooldown','command'],'flipper');
                out.components.flipper={charge:this.bool(f.charge,false,'チャージスウィング'),chargeTime:this.num(f.chargeTime,1,.2,5,'充填時間'),boost:this.num(f.boost,1.8,1,4,'駆動倍率'),extend:this.num(f.extend,0,0,100,'伸長量'),extendTime:this.num(f.extendTime,.3,.1,3,'伸長時間'),scatter:this.num(f.scatter,0,0,5,'追加弾'),spread:this.num(f.spread,35,0,120,'散弾角'),cooldown:this.num(f.cooldown,1.5,.2,15,'散弾間隔'),command:this.bool(f.command,false,'コマンド強化')};
            }
            for(const name of ['capture','split','absorber','flipper'])for(const key of ['count','capacity','generations','scatter'])if(out.components[name]?.[key]!==undefined&&!Number.isInteger(out.components[name][key]))this.fail(key+'は整数です。');
            if(['capture','warp','split','absorber'].filter(k=>out.components[k]).length>1)this.fail('捕獲・ワープ・分裂・吸収は同じ物体に重複できません。');
            if(out.components.charge&&out.components.charge.initial>out.components.charge.maximum)this.fail('初期チャージが上限を超えています。');
        }
        if(value.state) {
            this.object(value.state,Object.keys(value.state).filter(k=>/^[a-zA-Z][a-zA-Z0-9_]*$/.test(k)&&!['constructor','prototype'].includes(k)),'state');
            if(Object.keys(value.state).length>32)this.fail('状態変数は32個までです。');out.state={};
            for(const[k,v]of Object.entries(value.state)){if(!['number','boolean','string'].includes(typeof v))this.fail('初期状態は数値・真偽値・文字列です。');out.state[k]=this.expression(v);}
        }
        if(value.rules) {
            if(!Array.isArray(value.rules)||value.rules.length>32)this.fail('ルールは32個までです。');
            out.rules=value.rules.map((r,i)=>{
                this.object(r,['id','on','if','effects','priority','cooldown','limit','scope','exclusiveGroup','input','signal'],'ルール');
                if(!this.events.has(r.on))this.fail('未対応イベント: '+r.on);
                if(!Array.isArray(r.effects)||r.effects.length<1||r.effects.length>12)this.fail('作用は1～12個です。');
                const rule={id:this.identifier(r.id,'rule-'+i),on:r.on,if:this.expression(r.if??true),priority:this.num(r.priority,0,-100,100,'優先度'),cooldown:this.num(r.cooldown,0,0,300,'間隔'),limit:this.num(r.limit,0,0,100000,'回数'),scope:this.choice(r.scope,'pair',['entity','pair','contact','swing','round','game'],'範囲'),exclusiveGroup:this.identifier(r.exclusiveGroup),effects:r.effects.map(e=>this.effect(e))};
                if(r.input!==undefined)rule.input=this.choice(r.input,'action',['left','right','action'],'入力');
                if(r.signal!==undefined)rule.signal=this.identifier(r.signal);
                return rule;
            });
            if(new Set(out.rules.map(r=>r.id)).size!==out.rules.length)this.fail('ルールIDが重複しています。');
        }
        return out;
    }
    static effect(e) {
        this.object(e,['op','target','value','vector','angle','space','count','spread','speed','consume','destination','key','name','duration','source','operation','stack','cost','resource'],'作用');
        if(!this.operations.has(e.op))this.fail('未対応作用: '+e.op);
        const out={op:e.op,target:this.str(e.target,'other','作用対象',80)};
        if(!/^(self|other|owner|nearby|link:[a-zA-Z0-9_-]+)$/.test(out.target))this.fail('作用対象が不正です。');
        for(const key of ['value','vector','angle','count','spread','speed','cost'])if(e[key]!==undefined)out[key]=this.expression(e[key]);
        for(const key of ['destination','key','name','source','resource'])if(e[key]!==undefined)out[key]=this.identifier(e[key]);
        if(e.space!==undefined)out.space=this.choice(e.space,'world',['world','self','projectile'],'座標系');
        if(e.duration!==undefined)out.duration=this.num(e.duration,1,.01,300,'持続時間');
        if(e.consume!==undefined)out.consume=this.bool(e.consume,false,'消費');
        if(e.operation!==undefined)out.operation=this.choice(e.operation,'add',['add','multiply','set','min','max'],'補正');
        if(e.stack!==undefined)out.stack=this.choice(e.stack,'refresh',['refresh','reject','independent'],'重ね方');
        if(e.op==='modify'&&!['speed','attack','drive','gravity'].includes(e.key))this.fail('補正対象はspeed / attack / drive / gravityです。');
        if(e.op==='state'&&!e.key)this.fail('stateにはkeyが必要です。');
        return out;
    }
    static validateLayout(objects) {
        const ids=new Map();
        objects.forEach((o,i)=>{
            if(o.entity&&!o.entity.id)o.entity.id='entity-'+i;
            const id=o.entity?.id??'object-'+i;
            if(ids.has(id))this.fail('IDが重複しています: '+id);ids.set(id,o);
        });
        for(const o of objects)if(o.entity){
            const e=o.entity;
            if(e.components?.warp&&!e.components.warp.target)this.fail('ワープ先のIDが必要です。');
            const effects=(e.rules??[]).flatMap(r=>r.effects);
            for(const effect of effects)if(effect.target.startsWith('link:')&&!e.links?.[effect.target.slice(5)])this.fail('作用のリンクが存在しません: '+effect.target);
            const references=[...Object.values(e.links??{}),e.components?.warp?.target,e.attachment?.target,e.owner,...effects.map(x=>x.destination)].filter(Boolean);
            for(const id of references)if(!ids.get(id)?.entity||id===e.id)this.fail('参照先が存在しないか、自分自身です: '+id);
            if(e.motion?.mode==='direct'&&o.type==='flipper')this.fail('フリッパーには支点駆動を使用してください。');
            if(e.attachment&&e.motion)this.fail('装着と軌道の同時指定はできません。');
        }
        for(const o of objects){const seen=new Set();let current=o;while(current?.entity?.attachment){const id=current.entity.id;if(seen.has(id))this.fail('装着が循環しています。');seen.add(id);current=ids.get(current.entity.attachment.target);}}
    }
}

const ENTITY_PRESETS = {
    accelerate:{name:'加速ゾーン',color:'#5ce7ba',sensor:true,components:{field:{kind:'accelerate',direction:-90,strength:750,radius:85}}},
    redirect:{name:'方向転換ゾーン',color:'#8fe36f',sensor:true,components:{field:{kind:'redirect',direction:-50,radius:80,turnRate:540}}},
    brake:{name:'減速ゾーン',color:'#b7d9ef',sensor:true,components:{field:{kind:'brake',strength:700,radius:75}}},
    reflector:{name:'方向反射板',color:'#f7cf72',shape:'rectangle',width:120,height:18,rules:[{on:'contact',cooldown:.12,effects:[{op:'reflect',target:'other',angle:-90,speed:650}]}]},
    magnet:{name:'吸引マグネット',color:'#ba93ff',components:{field:{kind:'attract',radius:155,strength:800}}},
    repeller:{name:'反発マグネット',color:'#ff9e74',components:{field:{kind:'repel',radius:145,strength:900}}},
    vortex:{name:'渦フィールド',color:'#8dbbff',sensor:true,components:{field:{kind:'vortex',radius:135,strength:700}}},
    capture:{name:'吸着・自動解放',color:'#66dbed',sensor:true,components:{capture:{hold:1.1,speed:650,direction:-65}}},
    warp:{name:'ワープ入口',color:'#c291ff',sensor:true,components:{warp:{target:'exit',direction:-90}}},
    breakable:{name:'破壊できる壁',color:'#f3a476',shape:'rectangle',width:110,height:24,components:{health:{max:20,score:150}}},
    destroyer:{name:'弾消去ゾーン',color:'#fa6986',sensor:true,rules:[{on:'contact',effects:[{op:'destroy',target:'other'},{op:'score',target:'self',value:75}]}]},
    splitter:{name:'プリズム分裂',color:'#75ecff',sensor:true,components:{split:{count:3,spread:60,speed:620,generations:1}}},
    absorber:{name:'吸収・再発射',color:'#e6c265',sensor:true,components:{charge:{maximum:120},absorber:{gain:30,cost:30,count:3,speed:620,direction:-90,delay:.6}}},
    launcher:{name:'チャージ発射台',color:'#ffaa75',sensor:true,components:{charge:{maximum:100,rate:55},capture:{hold:6,speed:420,direction:-90,manual:true,chargeBoost:650}}},
    moving:{name:'往復する壁',color:'#9eb5c8',shape:'rectangle',width:120,height:20,motion:{kind:'wave',range:[90,0],period:3}},
    rotating:{name:'回転する反射板',color:'#e1c987',shape:'rectangle',width:130,height:16,motion:{kind:'none',angularSpeed:65}},
    chargedFlipper:{name:'チャージフリッパー',type:'flipper',components:{flipper:{charge:true,chargeTime:.8,boost:2}}},
    extendedFlipper:{name:'伸長フリッパー',type:'flipper',components:{flipper:{extend:45,extendTime:.3}}},
    scatterFlipper:{name:'散弾フリッパー',type:'flipper',components:{flipper:{scatter:2,spread:38,cooldown:1.5}}}
};
function entityPresetRecord(key, x=400, y=400, id='feature') {
    const p=ENTITY_PRESETS[key];if(!p)throw new Error('Unknown preset');
    const entity={version:1,id,prototype:key};for(const k of ['components','motion','rules'])if(p[k])entity[k]=EntityModel.clone(p[k]);
    if(p.type==='flipper')return {type:'flipper',x,y,width:120,height:24,isLeft:true,restAngle:22,flipAngle:-38,name:p.name,entity};
    return {type:'device',x,y,width:p.width??64,height:p.height??64,radius:32,shape:p.shape??'circle',sensor:p.sensor??false,name:p.name,color:p.color,restitution:.8,entity};
}
