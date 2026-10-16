// Ten authored feature tables, kept separate from the original ten layouts.
const PINBALL_LAB_TABLES = (() => {
    const rail=(x1,y1,x2,y2)=>({type:'wall',x:(x1+x2)/2,y:(y1+y2)/2,width:Math.hypot(x2-x1,y2-y1),height:24,angle:Math.atan2(y2-y1,x2-x1)*180/Math.PI,restitution:.65});
    const bumper=(x,y,radius=30,score=120,entity)=>({type:'bumper',x,y,radius,score,restitution:1.15,...(entity?{entity}:{})});
    const feature=(key,x,y,id,changes={})=>{
        const o=entityPresetRecord(key,x,y,id);for(const k of ['radius','width','height','angle','color','sensor','name'])if(changes[k]!==undefined)o[k]=changes[k];
        if(changes.components)for(const[k,v]of Object.entries(changes.components))o.entity.components={...o.entity.components,[k]:{...o.entity.components?.[k],...v}};
        if(changes.motion)o.entity.motion=changes.motion;if(changes.rules)o.entity.rules=changes.rules;return o;
    };
    const flippers=(component)=>[true,false].map(isLeft=>({type:'flipper',x:isLeft?260:540,y:850,width:120,height:24,isLeft,restAngle:isLeft?22:-22,flipAngle:isLeft?-38:38,
        ...(component?{entity:{version:1,id:isLeft?'left-paddle':'right-paddle',components:{flipper:component}}}:{})}));
    const make=(id,name,accent,description,tip,control,objects,options={})=>({id,name,accent,description,tip,control,group:'lab',level:'試遊',target:options.target??2500,launch:{x:options.vx??1.5,y:-7},
        layout:{schemaVersion:2,seed:options.seed??20261017,board:{width:800,height:1000},objects:[
            rail(0,100,100,0),rail(700,0,800,100),rail(0,640,260,850),rail(540,850,800,640),...flippers(options.flipper),...objects,
            {type:'ball',x:options.x??400,y:110,radius:10,isBallPositionMarker:true,entity:{version:1,id:'round-ball',roles:['projectile'],components:{attack:{damage:10}}}}
        ]}});
    return [
        make('lab-accelerator','アクセル・サーキット','#5ce7ba','加速・減速・方向転換のフィールドを通り抜ける台。','BOOSTは上向き加速、TURNは左上へ旋回。SLOWで球速を落とします。','輪の中で力が作用します。',[
            feature('accelerate',300,390,'boost',{components:{field:{radius:105,strength:850}}}),feature('redirect',530,430,'turn',{components:{field:{direction:-140,radius:95}}}),
            feature('brake',400,630,'slow',{components:{field:{radius:85,strength:900}}}),bumper(235,230),bumper(540,240),bumper(400,505,26,150)
        ],{x:300,vx:1}),
        make('lab-mirrors','ミラー・ダンス','#f7cf72','回転・往復・波形の仕掛けで球の反射が変わる台。','REFLECTは上向きへ返します。動くレールの角度と位置を見て狙います。','回転と波形移動を観察できます。',[
            feature('rotating',400,365,'rotor',{width:145}),feature('moving',235,535,'slider',{width:110,motion:{kind:'linear',range:[65,0],period:3.4}}),
            feature('reflector',570,535,'mirror',{angle:-25,motion:{kind:'wave',range:[0,40],period:2.5},rules:[{on:'contact',cooldown:.15,effects:[{op:'reflect',angle:-120,speed:720}]}]}),
            bumper(235,245),bumper(570,245),bumper(405,590,26,180)
        ],{x:290,vx:2}),
        make('lab-magnets','マグネット・ハーバー','#b793ff','引き寄せ・押し返し・一時吸着を組み合わせた港。','HOLDに入ると一時停止して自動発射。磁場の範囲は輪で示します。','捕獲した球は約1秒後に解放します。',[
            feature('magnet',260,340,'pull',{components:{field:{radius:145,strength:650}}}),feature('repeller',560,385,'push',{components:{field:{radius:125,strength:750}}}),
            feature('capture',400,530,'dock',{components:{capture:{hold:1.2,direction:-115,speed:650}}}),bumper(400,260,28,160),bumper(245,600,25),bumper(570,600,25)
        ]),
        make('lab-warps','ワープ・リンク','#c291ff','左右二組の入口と出口をつなぐ転送台。','同じ色のWARPが対です。転送後は少しの間、再転送されません。','出口の周囲が空いている方向へ転送します。',[
            feature('warp',300,280,'portal-a',{color:'#bd91ff',components:{warp:{target:'portal-b',direction:25}}}),
            feature('warp',560,540,'portal-b',{color:'#bd91ff',components:{warp:{target:'portal-a',direction:155}}}),
            feature('warp',540,275,'portal-c',{color:'#65e4d4',components:{warp:{target:'portal-d',direction:-25}}}),
            feature('warp',240,560,'portal-d',{color:'#65e4d4',components:{warp:{target:'portal-c',direction:150}}}),
            bumper(400,390,42,200),bumper(400,650,26,150)
        ],{x:280,vx:1}),
        make('lab-breakers','ブレイク・ガーデン','#f3a476','耐久つきの壁を壊して道を開く台。VOIDは球を消します。','BREAKは2～3回当てると破壊。下部左右のVOIDを避けて中央へ戻します。','壁上のバーが残り耐久です。',[
            ...[245,400,555].map((x,i)=>feature('breakable',x,350,'brick-'+i,{width:100,height:26})),
            ...[310,490].map((x,i)=>feature('breakable',x,510,'brick-low-'+i,{width:105,height:24,components:{health:{max:30,score:220}}})),
            feature('destroyer',135,585,'void-left',{radius:24}),feature('destroyer',665,585,'void-right',{radius:24}),
            bumper(240,220,28,150),bumper(550,220,28,150),bumper(400,630,26,180)
        ],{target:3500}),
        make('lab-prisms','プリズム・スプリット','#75ecff','プリズムで球が3つに分裂。球同士も反射します。','同じ世代の球は繰り返し分裂しません。すべて失うと次の1球です。','追加球の寿命は12秒です。',[
            feature('splitter',400,315,'prism',{radius:38,components:{split:{count:3,spread:100,speed:630}}}),bumper(230,440,34,150),bumper(570,440,34,150),bumper(400,575,34,150),
            rail(110,300,180,410),rail(620,410,690,300)
        ],{vx:0,target:4000}),
        make('lab-recycler','リサイクル・リアクター','#e6c265','球を吸収してエネルギーに変え、散弾として再発射。','RECYCLEは元の球を消費し、少し待って3球を撃ち出します。','再発射待ちもラウンド継続中です。',[
            feature('absorber',400,325,'reactor',{radius:42,components:{absorber:{gain:30,cost:30,count:3,spread:90,direction:-90,delay:.65}}}),
            bumper(230,250,30,180),bumper(570,250,30,180),bumper(270,520,32,150),bumper(530,520,32,150),bumper(400,650,26,120)
        ],{vx:0,target:4500}),
        make('lab-launcher','チャージ・ランチャー','#ffaa75','球を装填し、チャージ量に応じて発射する台。','捕獲中にEまたは特殊ボタンを長押しし、離して発射。連打でも充填できます。','E：保持で充填／解除で発射。6秒で自動解放。',[
            feature('launcher',400,350,'launcher',{radius:40,components:{capture:{direction:-115,hold:6}}}),
            bumper(215,220,34,200),bumper(575,250,34,200),bumper(250,560,30,150),bumper(550,560,30,150),
            feature('vortex',400,615,'swirl',{components:{field:{radius:100,strength:400}}})
        ],{vx:0}),
        make('lab-charge-swing','チャージ・スウィング','#ff879d','左右のフリッパーを溜めてから振る、タイミング重視の台。','左右を押している間は溜め、離すとスウィングします。満充填は約0.8秒です。','左右：押して溜める → 離して打つ。',[
            bumper(260,280,36,180),bumper(540,280,36,180),bumper(400,420,40,250),
            feature('breakable',400,610,'charge-target',{width:110,height:22,components:{health:{max:35,score:300}}}),
            rail(110,450,180,555),rail(620,555,690,450)
        ],{flipper:{charge:true,chargeTime:.8,boost:2.1},target:3500}),
        make('lab-extend-burst','エクステンド・バースト','#93ed8c','伸びるフリッパーで打ち返すと追加の球が飛び出します。','押すと伸長。打ち返し時に散弾を追加します。左→右→Eの順に素早く押すと6秒間強化。','左→右→E：コマンド。特殊ボタンでもEを入力できます。',[
            bumper(235,260,30,160),bumper(565,260,30,160),bumper(400,380,42,220),bumper(260,560,30,150),bumper(540,560,30,150),
            feature('moving',400,650,'moving-guard',{width:95,motion:{kind:'wave',range:[60,0],period:3}})
        ],{flipper:{extend:42,extendTime:.25,scatter:2,spread:45,cooldown:1.5,command:true},target:5000})
    ];
})();
PINBALL_TABLES.push(...PINBALL_LAB_TABLES);
