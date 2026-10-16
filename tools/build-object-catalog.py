#!/usr/bin/env python3
"""Build the offline visual companion from doc/OBJECT_CATALOG.md (stdlib only).

The small Markdown renderer supports the headings, paragraphs, lists, links,
bold, and inline code used in this document. Figures use existing SVG assets;
they explain geometry, not a second implementation of the game physics.
"""
import base64
import hashlib
import html
import json
from pathlib import Path
import re
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "doc/OBJECT_CATALOG.md"
OUTPUT = ROOT / "doc/object-catalog.html"
REPO = "https://github.com/TomTomYoung/Pinball/blob/main/"
ASSETS = {a["id"]: a for a in json.loads((ROOT / "assets/manifest.json").read_text())["assets"]}


def asset(asset_id):
    record = ASSETS[asset_id]
    data = (ROOT / "assets" / record["path"]).read_bytes()
    assert record["format"] == "svg", asset_id
    assert hashlib.sha256(data).hexdigest() == record["sha256"], asset_id
    return "data:image/svg+xml;base64," + base64.b64encode(data).decode()


def picture(asset_id, x, y, width=None, height=None, opacity=1):
    record = ASSETS[asset_id]
    return (f'<image href="{asset(asset_id)}" x="{x}" y="{y}" '
            f'width="{width if width is not None else record["width"]}" '
            f'height="{height if height is not None else record["height"]}" opacity="{opacity}"/>')


def point(x, y):
    return f'<path class="origin" d="M{x-7} {y}h14 M{x} {y-7}v14"/><circle class="origin" cx="{x}" cy="{y}" r="3"/>'


def text(x, y, label, anchor="middle", cls="svg-label"):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" class="{cls}">{html.escape(label)}</text>'


def figure(content, title, caption):
    return ('<figure><svg viewBox="0 0 560 240" role="img" aria-label="' + html.escape(title, quote=True)
            + '">' + content + '</svg><figcaption>' + caption + '</figcaption></figure>')


def rail_figure():
    # Body tiles keep their native aspect ratio via a pattern, not image stretching.
    pattern = (f'<defs><pattern id="rail-repeat" width="48" height="60" patternUnits="userSpaceOnUse">'
               + picture("rail-body", 0, 0, 48, 60) + '</pattern></defs>')
    s = pattern + picture("rail-cap-left", 130, 82, 36, 60)
    s += '<rect x="166" y="82" width="228" height="60" fill="url(#rail-repeat)"/>'
    s += picture("rail-cap-right", 394, 82, 36, 60)
    s += '<rect class="bounds" x="130" y="82" width="300" height="60"/>' + point(280, 112)
    s += '<path class="measure" d="M130 65v-9h300v9 M449 82h9v60h-9"/>'
    s += text(280, 44, "width 100") + text(470, 118, "20", "start")
    s += text(280, 197, "CENTER  (200, 200)")
    return figure(s, "壁の中心と100×20の矩形当たり判定", "原点は中心。端部の描画を含む全長が幅で、物理形状は矩形です。")


def bumper_figure():
    s = ""
    for cx, lit in [(160, False), (400, True)]:
        s += picture("bumper-base", cx-64, 56)
        if lit:
            s += picture("bumper-glow", cx-96, 24)
        s += picture("bumper-lit" if lit else "bumper-normal", cx-48, 72)
        s += f'<circle class="bounds" cx="{cx}" cy="120" r="40"/>' + point(cx, 120)
        s += text(cx, 210, "COLLECTED / HIT" if lit else "NORMAL")
    return figure(s, "バンパーの通常状態と点灯状態", "破線は物理円。台座と発光は円の外側に広がりますが、衝突しません。")


def flipper_figure():
    s = ""
    for is_left, pivot in [(True, 85), (False, 475)]:
        center = pivot + (85 if is_left else -85)
        s += picture("flipper-left" if is_left else "flipper-right", center-102, 87.8, 204, 54.4)
        s += picture("flipper-pivot", pivot-20.4, 94.6, 40.8, 40.8)
        s += f'<rect class="bounds" x="{center-85}" y="98" width="170" height="34"/>' + point(pivot, 115)
        s += text(center, 52, "LEFT" if is_left else "RIGHT")
        s += text(center, 190, "0° → −45°" if is_left else "0° → +45°")
    return figure(s, "左右フリッパーの矩形と端にある支点", "十字は保存する支点X・Y。左右の素材も、当たり判定も端を基準に配置します。")


def ball_figure():
    s = ""
    for cx, marker in [(160, True), (400, False)]:
        opacity = .5 if marker else 1
        s += picture("ball-shadow", cx-35, 77.5, 80, 80, opacity)
        s += picture("ball-chrome", cx-80/3, 110-80/3, 160/3, 160/3, opacity)
        if not marker:
            s += f'<circle class="bounds" cx="{cx}" cy="110" r="25"/>'
        s += point(cx, 110)
        s += text(cx, 180, "MARKER  /  α 0.5" if marker else "BALL  /  α 1.0")
        s += text(cx, 207, "NO BODY" if marker else "CIRCLE BODY")
    return figure(s, "半透明の開始位置マーカーと動的な実ボール", "同じ球の素材を使用します。開始位置マーカーには当たり判定がありません。")


def boundary_figure():
    s = '<g transform="translate(130 31) scale(.18)">'
    s += '<rect width="800" height="1000" fill="#101d2b" stroke="#394d64" stroke-width="4"/>'
    s += '<g fill="#5cb5dd" fill-opacity=".45"><rect x="-58" y="0" width="68" height="1000"/><rect x="790" y="0" width="68" height="1000"/><rect x="-68" y="-58" width="936" height="68"/></g>'
    s += '<path class="bounds" style="stroke-width:8" d="M10 1000V10H790V1000"/>'
    s += '<circle cx="400" cy="1070" r="10" fill="#fff"/></g>'
    s += text(325, 71, "3 AUTO WALLS", "start") + text(325, 102, "800 × 1000", "start")
    s += text(325, 157, "NO FLOOR", "start") + text(325, 188, "DRAIN: Y > 1060", "start")
    return figure(s, "完成台の自動外周3枚と床のない落球位置", "完成台の外周は外側へ厚くしています。下辺は開放され、落球はY座標で判定します。")


def decor_figure():
    s = picture("frame-corner", 50, 38, 48, 48) + picture("frame-edge", 98, 38, 96, 48)
    s += picture("ball-shadow", 229, 14) + picture("hit-02", 373, 0, 128, 128)
    s += text(122, 119, "FRAME") + text(277, 119, "SHADOW") + text(437, 119, "HIT FX")
    s += picture("score-panel", 45, 155, 192, 57.6) + picture("button-normal", 318, 155, 192, 57.6)
    return figure(s, "当たり判定を持たない枠・影・演出・UI素材", "装飾とUIは表示用です。物理ボディ数にも保存するオブジェクト数にも含めません。")


def inline(value):
    tokens = re.compile(r'`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)')
    out, cursor = [], 0
    for match in tokens.finditer(value):
        out.append(html.escape(value[cursor:match.start()]))
        if match[1] is not None:
            out.append('<code>' + html.escape(match[1]) + '</code>')
        elif match[2] is not None:
            out.append('<strong>' + html.escape(match[2]) + '</strong>')
        else:
            href = '#top' if match[4] == './object-catalog.html' else urljoin(REPO + 'doc/', match[4])
            out.append('<a href="' + html.escape(href, quote=True) + '">' + html.escape(match[3]) + '</a>')
        cursor = match.end()
    out.append(html.escape(value[cursor:]))
    return ''.join(out)


def markdown(value):
    out, paragraph, listing = [], [], None

    def flush():
        if paragraph:
            out.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            paragraph.clear()

    def close_list():
        nonlocal listing
        if listing:
            out.append('</' + listing + '>')
            listing = None

    for line in value.splitlines() + ['']:
        if not line.strip():
            flush()
            close_list()
        elif line.startswith('### '):
            flush()
            close_list()
            out.append('<h3>' + inline(line[4:]) + '</h3>')
        elif re.match(r'(- |\d+\. )', line):
            flush()
            kind = 'ul' if line.startswith('- ') else 'ol'
            if listing != kind:
                close_list()
                out.append('<' + kind + '>')
                listing = kind
            out.append('<li>' + inline(re.sub(r'^(- |\d+\. )', '', line)) + '</li>')
        else:
            close_list()
            paragraph.append(line.strip())
    return ''.join(out)


CSS = """
:root{color-scheme:dark;--bg:#0a111b;--panel:#101c2a;--line:#294054;--muted:#a6b8c9;--text:#e9f1f7;--cyan:#71d8fa;--orange:#ffc277}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:22px}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.9 system-ui,-apple-system,"Noto Sans CJK JP","Yu Gothic",Meiryo,sans-serif}a{color:var(--cyan);text-underline-offset:4px}a:hover{color:white}a:focus-visible,input:focus-visible{outline:2px solid var(--orange);outline-offset:5px}.hero{max-width:1220px;margin:auto;padding:60px 36px 28px}.eyebrow{font:12px/1.4 ui-monospace,monospace;letter-spacing:.22em;color:var(--cyan)}h1{font-size:clamp(30px,4vw,52px);line-height:1.35;font-weight:700;letter-spacing:-.035em;margin:16px 0}.hero .intro{max-width:900px;color:var(--muted)}.hero p{margin:12px 0}.hero strong{color:var(--text)}.stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:26px}.stats span{border:1px solid var(--line);border-radius:999px;padding:5px 14px;font-size:12px;color:var(--muted)}.stats b{color:var(--cyan);margin-right:7px}.shell{max-width:1220px;margin:auto;padding:0 36px 70px;display:grid;grid-template-columns:190px minmax(0,1fr);gap:36px}aside{align-self:start;position:sticky;top:24px;padding-top:25px}aside p{font-size:11px;letter-spacing:.15em;color:var(--muted);margin:0 0 14px}nav a{display:block;padding:7px 0;text-decoration:none;font-size:13px;color:#bfd0dd}nav a:hover{color:var(--cyan)}.controls{margin-top:26px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:12px}label{cursor:pointer;display:flex;gap:9px;align-items:center}input{accent-color:var(--cyan);width:16px;height:16px;margin:0}.legend{display:block;margin-top:12px}.legend i{color:var(--orange);font-style:normal;margin-right:7px}.section{padding:28px 0 20px;border-top:1px solid var(--line)}h2{font-size:25px;line-height:1.5;letter-spacing:-.025em;margin:0 0 20px}h3{font-size:18px;color:var(--cyan);margin:28px 0 12px}p{margin:16px 0}ul,ol{padding-left:1.5em;margin:18px 0}li{padding-left:.3em;margin:12px 0;color:#c8d7e3}strong{color:var(--text)}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.85em;color:#b8e7f6;background:#192c3c;border-radius:4px;padding:2px 5px;overflow-wrap:anywhere}figure{margin:0 0 24px;border:1px solid var(--line);border-radius:14px;overflow:hidden;background-color:var(--panel);background-image:linear-gradient(#1b2c3a80 1px,transparent 1px),linear-gradient(90deg,#1b2c3a80 1px,transparent 1px);background-size:24px 24px}figure svg{display:block;width:100%;height:auto;max-height:295px}figcaption{border-top:1px solid var(--line);padding:12px 20px;background:#0d1824;font-size:12px;color:var(--muted)}.svg-label{fill:#bfd0df;font:12px ui-monospace,monospace;letter-spacing:1px}.bounds{fill:none;stroke:var(--cyan);stroke-width:1.5;stroke-dasharray:5 4}.hide-bounds .bounds{visibility:hidden}.origin{fill:none;stroke:var(--orange);stroke-width:1.4}.measure{stroke:#7892a7;stroke-width:1;fill:none}footer{max-width:1148px;margin:0 auto;padding:24px 0 40px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}.top-link{float:right}.note{font-size:12px;color:var(--muted)}
@media(max-width:800px){.hero{padding:32px 22px 24px}.shell{padding:0 22px 40px;display:block}aside{position:static;padding:0 0 25px}aside p{display:none}nav{display:flex;flex-wrap:wrap;gap:5px 15px}nav a{padding:2px 0}.controls{margin-top:14px;padding-top:12px;display:flex;gap:18px;flex-wrap:wrap}.legend{margin:0}.section{padding-top:24px}h2{font-size:22px}footer{margin:0 22px}.hero .intro{font-size:14px}code{word-break:break-word}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{html{color-scheme:light}body{background:white;color:#172330;font-size:10pt}.hero{padding:0 0 15px}h1{font-size:26pt}.shell{display:block;padding:0}aside,.stats,.top-link{display:none}h2{font-size:17pt}.section{break-before:page}p,li,.hero .intro,strong{color:#172330}a{color:#175a7d}code{color:#175a7d;background:#eef4f7}figure{break-inside:avoid;print-color-adjust:exact}footer{margin:0}.section:first-child{break-before:auto}}
"""


def build():
    source = SOURCE.read_text(encoding="utf-8")
    pieces = source.split('\n## ')
    intro = pieces[0].split('\n', 1)[1]
    diagrams = [rail_figure(), bumper_figure(), flipper_figure(), ball_figure(), boundary_figure(), decor_figure()]
    labels = ['壁・レール', 'バンパー', '左右フリッパー', 'ボール開始位置', '実ボール・外周・落球', '装飾・演出・UI', 'スキン・座標・範囲', '10台の構成例', '正本と更新方法']
    sections, nav = [], []
    assert len(pieces)-1 == len(labels), 'Update navigation for new sections'
    for i, part in enumerate(pieces[1:], 1):
        title, content = part.split('\n', 1)
        nav.append(f'<a href="#object-{i:02}">{i:02}　{labels[i-1]}</a>')
        sections.append(f'<section class="section" id="object-{i:02}"><h2>{inline(title)}</h2>'
                        + (diagrams[i-1] if i <= len(diagrams) else '') + markdown(content) + '</section>')
    page = ('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<meta name="color-scheme" content="dark light"><title>Pinball オブジェクトカタログ</title><style>' + CSS + '</style></head><body id="top">'
            '<header class="hero"><div class="eyebrow">PINBALL / OBJECT CATALOG / 2026.10</div><h1>オブジェクトカタログ</h1>'
            '<div class="intro">' + markdown(intro) + '</div><div class="stats"><span><b>04</b>配置できる型</span>'
            '<span><b>10</b>完成台の構成例</span><span><b>49</b>既存の画像・音素材</span></div></header>'
            '<div class="shell"><aside><p>CONTENTS</p><nav aria-label="カタログ目次">' + ''.join(nav) + '</nav>'
            '<div class="controls"><label><input id="show-bounds" type="checkbox" checked>当たり判定の線を表示</label>'
            '<span class="legend"><i>＋</i>保存する位置・支点</span></div></aside><main>' + ''.join(sections) + '</main></div>'
            '<footer>本文・ソースのリンクはGitHubで開きます。図は既存SVGを使用した説明図です。'
            '<a class="top-link" href="#top">先頭へ ↑</a></footer>'
            '<script>document.getElementById("show-bounds").addEventListener("change",event=>{document.documentElement.classList.toggle("hide-bounds",!event.target.checked);});</script>'
            '</body></html>\n')
    OUTPUT.write_text(page, encoding="utf-8")
    print(f'{OUTPUT.relative_to(ROOT)}: {len(page.encode())} bytes; {len(sections)} sections')


if __name__ == '__main__':
    build()
