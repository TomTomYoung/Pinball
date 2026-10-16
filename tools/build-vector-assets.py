#!/usr/bin/env python3
"""Rebuild original geometric assets in handoff order. Python standard library only."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets'
assets = []
PALETTE = {'steel': '#c4d2dd', 'dark': '#101923', 'blue': '#00aaff', 'red': '#ff343e', 'warm': '#ffce75'}

def svg(path, w, h, body, *, group, role, **extra):
    target = OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" fill="none">\n{body}\n</svg>\n')
    assets.append(dict(id=Path(path).stem, path=path, group=group, role=role, format='svg', width=w, height=h, origin=[w/2, h/2], transparent=True, source='original vector', **extra))

STEEL = '''<defs><linearGradient id="steel" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#f4f9fd"/><stop offset=".12" stop-color="#aabcc9"/><stop offset=".3" stop-color="#475a6c"/><stop offset=".52" stop-color="#d8e4ec"/><stop offset=".68" stop-color="#8c9eaf"/><stop offset="1" stop-color="#253441"/></linearGradient></defs>'''

# 02: Cabinet. Rotate this top edge/corner around the board; clip repeated edges.
svg('frame/frame-edge.svg',64,32,STEEL+'''<path fill="#080d13" d="M0 0h64v32H0z"/><path fill="url(#steel)" d="M0 2h64v28H0z"/><path fill="#152431" d="M0 7h64v14H0z"/><path stroke="#5e7b91" d="M0 8.5h64"/><path stroke="#060b10" stroke-width="2" d="M0 22h64"/><path stroke="#00aaff" stroke-opacity=".5" d="M0 25.5h64"/>''',group=2,role='筐体の上辺。回転して4辺へ使用',repeatAxis='x',rotationAllowed=True)
svg('frame/frame-corner.svg',32,32,STEEL+'''<path fill="#080d13" d="M0 0h32v32H0z"/><path fill="url(#steel)" d="M2 2h30v28H2z"/><path fill="#152431" d="M7 7h25v14H21v11H7z"/><path d="M8 31V8h24" stroke="#5e7b91"/><path d="M22 32V22h10" stroke="#060b10" stroke-width="2"/><path d="M25.5 32v-6.5H32" stroke="#00aaff" stroke-opacity=".5"/><circle cx="14" cy="14" r="4.5" fill="#09121b"/><circle cx="14" cy="14" r="3" fill="#9cafbf"/><path d="m12.5 15.5 3-3" stroke="#354c5f"/>''',group=2,role='左上コーナー。90度単位で回転',rotationAllowed=True)

# 03: Rail straight section and mirror end caps. Gradient is constant along x.
svg('rails/rail-body.svg',32,40,STEEL+'''<path fill="#101923" d="M0 0h32v40H0z"/><path fill="url(#steel)" d="M0 2h32v36H0z"/><path stroke="#fff" stroke-opacity=".8" d="M0 5.5h32"/><path stroke="#253c4f" stroke-width="2" d="M0 18h32"/><path stroke="#dbe9f3" stroke-opacity=".6" d="M0 21h32"/><path stroke="#101923" d="M0 35.5h32"/>''',group=3,role='壁・レールの繰り返し本体',repeatAxis='x',collisionRect=[0,0,32,40])
cap = '''<path fill="#101923" d="M12 0h12v40H12C5.4 40 0 34.6 0 28V12C0 5.4 5.4 0 12 0Z"/><path fill="url(#steel)" d="M12 2h12v36H12C6.5 38 2 33.5 2 28V12C2 6.5 6.5 2 12 2Z"/><path d="M23 5.5H12a7 7 0 0 0-7 7" stroke="#fff" stroke-opacity=".8"/><path d="M24 18H11v3h13" fill="#253c4f"/><circle cx="11" cy="28" r="3.5" fill="#263e51"/><path d="M9 28h4" stroke="#bfd2df"/>'''
for side in ['left','right']:
    content=cap if side=='left' else f'<g transform="translate(24 0) scale(-1 1)">{cap}</g>'
    svg(f'rails/rail-cap-{side}.svg',24,40,STEEL+content,group=3,role=f'壁の{side}端部',collisionRect=[0,0,24,40])

# 04: Ball. Art extends to radius 30, two pixels transparent safety margin.
svg('ball/ball-chrome.svg',64,64,'''<defs><radialGradient id="ball" cx=".31" cy=".24" r=".78"><stop stop-color="#fff"/><stop offset=".19" stop-color="#f1f7fc"/><stop offset=".39" stop-color="#b1c4d4"/><stop offset=".56" stop-color="#536c83"/><stop offset=".64" stop-color="#d7e4ed"/><stop offset=".78" stop-color="#7a94aa"/><stop offset="1" stop-color="#263b4f"/></radialGradient></defs><circle cx="32" cy="32" r="30" fill="url(#ball)"/><path d="M11 25a23 23 0 0 1 24-15" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/><path d="M22 55a25 25 0 0 0 29-14" stroke="#d8e9f5" stroke-opacity=".65" stroke-width="1.4"/>''',group=4,role='真円の金属球',collisionCircle=[32,32,30],defaultScale=1/3)
svg('ball/ball-shadow.svg',96,96,'''<defs><radialGradient id="shadow"><stop stop-color="#000" stop-opacity=".58"/><stop offset=".4" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs><circle cx="48" cy="48" r="45" fill="url(#shadow)"/>''',group=4,role='球の影。物理なし。球の下にオフセット配置',suggestedOffset=[2,3],defaultScale=1/3)

# 05: Flipper surface exactly matches the existing 5:1 rectangular collision body.
reddefs='''<defs><linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ff6670"/><stop offset=".3" stop-color="#ff343e"/><stop offset=".7" stop-color="#cb172b"/><stop offset="1" stop-color="#700b20"/></linearGradient><linearGradient id="inset"><stop stop-color="#4d0b1b"/><stop offset="1" stop-color="#c52035"/></linearGradient></defs>'''
flipper='''<rect x="20" y="12" width="200" height="40" fill="#300a13"/><rect x="21" y="13" width="198" height="38" rx="3" fill="url(#red)"/><path d="M23 15h194" stroke="#ffb3b8" stroke-width="2"/><rect x="31" y="22" width="174" height="17" rx="3" fill="url(#inset)"/><path d="M48 25h137" stroke="#ff6b73" stroke-opacity=".7"/><path d="m192 25 7 6-7 6" stroke="#ffb3b8" stroke-width="2"/><path d="M22 48h196" stroke="#5a0b1d" stroke-width="3"/>'''
for side in ['left','right']:
    body=flipper if side=='left' else f'<g transform="translate(240 0) scale(-1 1)">{flipper}</g>'
    svg(f'flippers/flipper-{side}.svg',240,64,reddefs+body,group=5,role=f'{side}フリッパー本体',collisionRect=[20,12,200,40],pivot=[20 if side=='left' else 220,32],defaultScale=.5,aspectPolicy='native 5:1 body only; composite or Shape fallback for other aspect ratios')
svg('flippers/flipper-pivot.svg',48,48,STEEL+'''<circle cx="24" cy="24" r="22" fill="#090f16"/><circle cx="24" cy="24" r="19" fill="url(#steel)"/><circle cx="24" cy="24" r="13" fill="#152431" stroke="#dfebf3"/><circle cx="24" cy="24" r="7" fill="#415c73"/><path d="m20 28 8-8" stroke="#acbfce" stroke-width="2"/><path d="M11 19a14 14 0 0 1 13-9" stroke="#fff" stroke-opacity=".6"/>''',group=5,role='支点キャップ。中心を物理ヒンジに合わせる。物理なし',defaultScale=.5)

# 06: Bumper base is independently reusable; cap exactly covers diameter 80.
svg('bumpers/bumper-base.svg',128,128,STEEL+'''<circle cx="64" cy="64" r="60" fill="#091018"/><circle cx="64" cy="64" r="56" fill="url(#steel)"/><circle cx="64" cy="64" r="49" fill="#172d40" stroke="#526a7d" stroke-width="2"/><circle cx="64" cy="64" r="44" fill="#08131e"/><g fill="#142b3e" stroke="#9fb4c5"><circle cx="64" cy="13" r="3"/><circle cx="115" cy="64" r="3"/><circle cx="64" cy="115" r="3"/><circle cx="13" cy="64" r="3"/></g>''',group=6,role='バンパー台座。物理なし',defaultScale=.5)
for lit in [False,True]:
    colors=['#efffff','#b1f3ff','#00aaff','#086dca'] if lit else ['#8de5ff','#2cc4ff','#008cda','#03477c']
    body=f'''<defs><radialGradient id="cap" cx=".35" cy=".25" r=".8">{''.join(f'<stop offset="{i/3:.3f}" stop-color="{c}"/>' for i,c in enumerate(colors))}</radialGradient></defs><circle cx="48" cy="48" r="40" fill="url(#cap)"/><circle cx="48" cy="48" r="35" stroke="{'#ebffff' if lit else '#81d9ff'}" stroke-width="2"/><circle cx="48" cy="48" r="27" fill="#03477c" fill-opacity=".17"/><path d="M21 41a28 28 0 0 1 33-20" stroke="#fff" stroke-opacity="{'.9' if lit else '.45'}" stroke-width="3" stroke-linecap="round"/><circle cx="48" cy="48" r="7" fill="{'#fff6cd' if lit else '#d3f3ff'}"/><path d="M48 29v6m0 26v6M29 48h6m26 0h6" stroke="#dcf8ff" stroke-width="2"/>'''
    svg(f'bumpers/bumper-{"lit" if lit else "normal"}.svg',96,96,body,group=6,role='点灯キャップ' if lit else '通常キャップ',collisionCircle=[48,48,40],defaultScale=.5)
svg('bumpers/bumper-glow.svg',192,192,'''<defs><radialGradient id="glow"><stop stop-color="#d4fbff" stop-opacity=".08"/><stop offset=".34" stop-color="#8defff" stop-opacity=".45"/><stop offset=".48" stop-color="#00aaff" stop-opacity=".22"/><stop offset="1" stop-color="#00aaff" stop-opacity="0"/></radialGradient></defs><circle cx="96" cy="96" r="94" fill="url(#glow)"/>''',group=6,role='加算合成用の発光。物理なし',defaultScale=.5)

# 07: Independent effect frames; deterministic timing and no engine-specific sheet.
for i in range(6):
    t=i/5
    radius=8+40*t
    opacity=(1-t)**.7 if i<5 else .03
    spokes=[]
    for j in range(8):
        a=j*math.pi/4+.12
        r1=radius+4; r2=r1+14*(1-t)+3
        spokes.append(f'<path d="M{64+r1*math.cos(a):.2f} {64+r1*math.sin(a):.2f}L{64+r2*math.cos(a):.2f} {64+r2*math.sin(a):.2f}" stroke="#ffe9b4" stroke-width="{3-2*t:.2f}" stroke-linecap="round"/>')
    body=f'<g opacity="{opacity:.3f}"><circle cx="64" cy="64" r="{radius:.2f}" stroke="#ffc667" stroke-width="{5-4*t:.2f}"/>{"".join(spokes)}<circle cx="64" cy="64" r="{max(1,6-5*t):.2f}" fill="#fff6dc"/></g>'
    svg(f'effects/hit-{i:02}.svg',128,128,body,group=7,role=f'衝突演出フレーム{i+1}/6',frameIndex=i,frameDurationMs=30,defaultScale=.5)

# 08: Score panel, fixed-ratio button surfaces and native vector editor icons.
svg('ui/score-panel.svg',320,96,STEEL+'''<rect x="1" y="1" width="318" height="94" rx="12" fill="#071019" stroke="#526c81" stroke-width="2"/><rect x="5" y="5" width="310" height="86" rx="9" stroke="url(#steel)" stroke-opacity=".45"/><rect x="15" y="15" width="290" height="66" rx="5" fill="#0c1b28"/><path d="M24 23h272" stroke="#00aaff" stroke-opacity=".5"/><path d="M24 75h272" stroke="#26455e"/><g fill="#8298aa"><circle cx="10" cy="10" r="1.6"/><circle cx="310" cy="10" r="1.6"/><circle cx="10" cy="86" r="1.6"/><circle cx="310" cy="86" r="1.6"/></g>''',group=8,role='スコア表示枠。数値は別DOM',textSafeRect=[24,28,272,43])
for state in ['normal','pressed','disabled']:
    colors={'normal':('#304a61','#152b3e','#8db6d3'),'pressed':('#10283b','#204562','#00aaff'),'disabled':('#28323c','#1c2731','#53616d')}
    a,b,c=colors[state]
    body=f'''<defs><linearGradient id="button" x1="0" y1="0" x2="0" y2="1"><stop stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs><rect x="1" y="1" width="158" height="46" rx="8" fill="#080f16"/><rect x="2" y="2" width="156" height="{42 if state=='normal' else 44}" rx="7" fill="url(#button)" stroke="{c}"/><path d="M12 5h136" stroke="{c}" stroke-opacity=".55"/>'''
    svg(f'ui/button-{state}.svg',160,48,body,group=8,role=f'ボタン{state}。ラベルは別DOM',textSafeRect=[12,10,136,28])
icons={
 'select':'<path d="m6 3 13 11-7 1-3 7z"/><path d="m13 15 4 7"/>',
 'wall':'<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M3 12h18M9 7v5m6 0v5"/>',
 'bumper':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2"/>',
 'flipper':'<path d="M5 9h14a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6Z"/><circle cx="5" cy="12" r="1"/>',
 'ball':'<circle cx="12" cy="12" r="9"/><path d="M6 10a6 6 0 0 1 5-4"/>',
 'spawn':'<circle cx="12" cy="12" r="6"/><path d="M12 1v6m0 10v6M1 12h6m10 0h6"/>',
 'save':'<path d="M4 3h13l4 4v14H3V3z"/><path d="M7 3v6h10V3M7 21v-8h10v8m-3-18v4"/>',
 'load':'<path d="M3 8V5h7l2 3h9v13H3V8Z"/><path d="M12 10v7m-3-3 3 3 3-3"/>',
 'delete':'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 'play':'<path d="m7 3 14 9-14 9Z"/>',
 'restart':'<path d="M4 10a8 8 0 1 1 1 8M4 3v7h7"/>',
 'edit':'<path d="m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4"/>',
 'volume':'<path d="M3 9h4l5-5v16l-5-5H3zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
 'mute':'<path d="M3 9h4l5-5v16l-5-5H3zM16 9l6 6m0-6-6 6"/>',
}
for name,paths in icons.items():
    svg(f'ui/icons/{name}.svg',24,24,f'<g stroke="#dceaf4" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{paths}</g>',group=8,role=f'{name}用UIアイコン',recolor='change stroke or use CSS mask; keep accessible button label')
    assets[-1]['id']='icon-'+name

(OUT / 'vector-manifest.json').write_text(json.dumps({'version':1,'palette':PALETTE,'assets':assets},ensure_ascii=False,indent=2)+'\n')
print(f'Wrote {len(assets)} original SVG assets in groups 02–08.')
