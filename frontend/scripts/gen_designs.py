"""Генератор фоновых иллюстраций для дизайнов фотокниг (SVG, векторные — печатаются в любом размере).

Темы повторяют ассортимент шаблонов picPac.by (Рождество, Новый год, выпускной, детский сад, путешествия,
свадьба, «итоги года», кино, мама, осень…), рисунок — наш собственный, процедурный.
Запуск: python scripts/gen_designs.py  → public/designs/*.svg и ../backend/app/config_data/designs_art.json
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "designs"
CFG = ROOT.parent / "backend" / "app" / "config_data" / "designs_art.json"
W = H = 1000


def svg(body: str, bg: str, defs: str = "") -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
            f"<defs>{defs}</defs><rect width='{W}' height='{H}' fill='{bg}'/>{body}</svg>")


GRAIN = ("<filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='.9' "
         "numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0'/></filter>")
grain = "<rect width='1000' height='1000' filter='url(#g)'/>"


# ---------- мотивы ----------
def star(x, y, r, fill, rot=0, op=1.0, stroke=None, sw=3):
    pts = []
    for i in range(10):
        a = math.pi / 5 * i - math.pi / 2 + math.radians(rot)
        rr = r if i % 2 == 0 else r * .45
        pts.append(f"{x + rr * math.cos(a):.1f},{y + rr * math.sin(a):.1f}")
    if stroke:
        return f"<polygon points='{' '.join(pts)}' fill='none' stroke='{stroke}' stroke-width='{sw}' stroke-linejoin='round' opacity='{op}'/>"
    return f"<polygon points='{' '.join(pts)}' fill='{fill}' opacity='{op}'/>"


def snowflake(x, y, r, c, op=.9, sw=3):
    s = []
    for i in range(6):
        a = math.pi / 3 * i
        ex, ey = x + r * math.cos(a), y + r * math.sin(a)
        s.append(f"<line x1='{x}' y1='{y}' x2='{ex:.1f}' y2='{ey:.1f}'/>")
        for k in (.55,):
            bx, by = x + r * k * math.cos(a), y + r * k * math.sin(a)
            for d in (-1, 1):
                b = a + d * .6
                s.append(f"<line x1='{bx:.1f}' y1='{by:.1f}' x2='{bx + r * .3 * math.cos(b):.1f}' y2='{by + r * .3 * math.sin(b):.1f}'/>")
    return f"<g stroke='{c}' stroke-width='{sw}' stroke-linecap='round' opacity='{op}'>{''.join(s)}</g>"


def bauble(x, y, r, fill, cap="#C9A227", stripe=None, line=None):
    g = [f"<line x1='{x}' y1='{y - r - 40}' x2='{x}' y2='{y - r - 8}' stroke='{line or cap}' stroke-width='2'/>",
         f"<rect x='{x - r * .28}' y='{y - r - 10}' width='{r * .56}' height='14' rx='3' fill='{cap}'/>",
         f"<circle cx='{x}' cy='{y}' r='{r}' fill='{fill}'/>"]
    if stripe:
        g.append(f"<path d='M{x - r} {y} Q{x} {y + r * .35} {x + r} {y}' stroke='{stripe}' stroke-width='{r * .16:.1f}' fill='none'/>")
        g.append(f"<path d='M{x - r * .9} {y - r * .4} Q{x} {y - r * .1} {x + r * .9} {y - r * .4}' stroke='{stripe}' stroke-width='{r * .08:.1f}' fill='none'/>")
    g.append(f"<ellipse cx='{x - r * .35}' cy='{y - r * .35}' rx='{r * .18}' ry='{r * .12}' fill='#fff' opacity='.45'/>")
    return "".join(g)


def tree(x, y, h, fill, star_c=None, trunk="#7a4b2a"):
    w = h * .62
    g = [f"<rect x='{x - h * .04}' y='{y - h * .08}' width='{h * .08}' height='{h * .1}' fill='{trunk}'/>"]
    for i, (k, ww) in enumerate(((0, 1), (.28, .78), (.52, .56))):
        top = y - h * (.42 + k * .9) - h * .1
        g.append(f"<polygon points='{x},{top:.1f} {x - w * ww / 2:.1f},{y - h * .08 - h * k * .9:.1f} {x + w * ww / 2:.1f},{y - h * .08 - h * k * .9:.1f}' fill='{fill}'/>")
    if star_c:
        g.append(star(x, y - h * 1.02, h * .09, star_c))
    return "".join(g)


def heart(x, y, s, fill, rot=0, op=1.0):
    return (f"<path transform='translate({x} {y}) rotate({rot}) scale({s})' opacity='{op}' fill='{fill}' "
            "d='M0 6 C0 -4 12 -4 12 6 C12 14 0 20 0 24 C0 20 -12 14 -12 6 C-12 -4 0 -4 0 6Z'/>")


def leaf(x, y, s, fill, rot=0, op=1.0, vein=None):
    v = f"<path d='M0 0 Q20 -2 40 0' stroke='{vein}' stroke-width='1.2' fill='none'/>" if vein else ""
    return (f"<g transform='translate({x} {y}) rotate({rot}) scale({s})' opacity='{op}'>"
            f"<path d='M0 0 C10 -14 30 -14 40 0 C30 14 10 14 0 0Z' fill='{fill}'/>{v}</g>")


def sprig(x, y, s, stem, leafc, rot=0, berries=None):
    g = [f"<path d='M0 0 C10 -30 14 -70 8 -110' stroke='{stem}' stroke-width='3' fill='none'/>"]
    for i, t in enumerate((.2, .4, .6, .8)):
        yy = -110 * t
        g.append(leaf(6, yy, .7, leafc, rot=-150 if i % 2 else -30))
    if berries:
        for bx, by in ((10, -112), (0, -118), (16, -120)):
            g.append(f"<circle cx='{bx}' cy='{by}' r='7' fill='{berries}'/>")
    return f"<g transform='translate({x} {y}) rotate({rot}) scale({s})'>{''.join(g)}</g>"


def flower(x, y, r, petal, center, n=6, rot=0, op=1.0):
    g = []
    for i in range(n):
        a = 360 / n * i + rot
        g.append(f"<ellipse cx='{x}' cy='{y - r * .55}' rx='{r * .32}' ry='{r * .55}' fill='{petal}' transform='rotate({a} {x} {y})'/>")
    g.append(f"<circle cx='{x}' cy='{y}' r='{r * .28}' fill='{center}'/>")
    return f"<g opacity='{op}'>{''.join(g)}</g>"


def lineflower(x, y, r, c, sw=2.2, rot=0):
    g = []
    for i in range(5):
        a = 72 * i + rot
        g.append(f"<ellipse cx='{x}' cy='{y - r * .55}' rx='{r * .3}' ry='{r * .55}' fill='none' stroke='{c}' stroke-width='{sw}' transform='rotate({a} {x} {y})'/>")
    g.append(f"<circle cx='{x}' cy='{y}' r='{r * .16}' fill='none' stroke='{c}' stroke-width='{sw}'/>")
    stem = f"<path d='M{x} {y + r * .2} C{x + r * .3} {y + r} {x - r * .2} {y + r * 1.6} {x + r * .1} {y + r * 2.4}' stroke='{c}' stroke-width='{sw}' fill='none'/>"
    return "".join(g) + stem


def mitten(x, y, s, fill, cuff="#fff", rot=0):
    return (f"<g transform='translate({x} {y}) rotate({rot}) scale({s})'>"
            f"<path d='M10 0 C-10 0 -14 30 -8 60 L34 60 C40 40 44 30 50 22 C56 14 46 4 38 14 L34 20 C34 6 26 0 10 0Z' fill='{fill}'/>"
            f"<rect x='-10' y='56' width='46' height='18' rx='6' fill='{cuff}'/>"
            f"<path d='M2 24 L28 24 M2 36 L28 36' stroke='{cuff}' stroke-width='3' stroke-dasharray='4 5'/></g>")


def cup(x, y, s, fill, rot=0):
    return (f"<g transform='translate({x} {y}) rotate({rot}) scale({s})'>"
            f"<path d='M0 10 L4 60 C6 70 40 70 42 60 L46 10Z' fill='{fill}'/>"
            f"<path d='M46 20 C64 20 64 46 44 46' stroke='{fill}' stroke-width='7' fill='none'/>"
            f"<path d='M14 -4 C8 -14 20 -18 14 -28 M28 -4 C22 -14 34 -18 28 -28' stroke='{fill}' stroke-width='3' fill='none' opacity='.6'/>"
            f"{tree(23, 52, 34, '#fff')}</g>")


def bolt(x, y, s, fill, rot=0):
    return f"<path transform='translate({x} {y}) rotate({rot}) scale({s})' d='M8 0 L0 20 L8 20 L2 38 L18 14 L10 14 L16 0Z' fill='{fill}'/>"


def big(markup: str, x: float, y: float, k: float) -> str:
    return f"<g transform='translate({x:.1f} {y:.1f}) scale({k}) translate({-x:.1f} {-y:.1f})'>{markup}</g>"


def scatter(fn, n, seed, margin=0, avoid=None, **kw):
    rnd = random.Random(seed)
    out = []
    tries = 0
    while len(out) < n and tries < n * 40:
        tries += 1
        x, y = rnd.uniform(margin, W - margin), rnd.uniform(margin, H - margin)
        if avoid and avoid[0] < x < avoid[2] and avoid[1] < y < avoid[3]:
            continue
        out.append(fn(x, y, rnd))
    return "".join(out)


def border_ring(fn, n, seed, inner=.2):
    """Мотивы по краю страницы, центр свободен под фото/текст."""
    lo, hi = W * inner, W * (1 - inner)
    return scatter(fn, n, seed, margin=18, avoid=(lo, lo, hi, hi))


# ---------- дизайны ----------
D: list[dict] = []


def add(id, name, tags, svgtext, **style):
    (OUT / f"{id}.svg").write_text(svgtext, encoding="utf-8")
    D.append({"id": id, "name": name, "tags": tags, "bg": f"/designs/{id}.svg", "art": True, **style})


def build():
    OUT.mkdir(parents=True, exist_ok=True)

    # 1. Рождество нашей семьи — белый, акварельные красные мотивы по краю
    reds = ["#C92A2A", "#E8590C", "#A61E4D", "#D9480F"]
    body = border_ring(lambda x, y, r: r.choice([
        lambda: mitten(x, y, 1.7, r.choice(reds), rot=r.uniform(-25, 25)),
        lambda: cup(x, y, 1.6, r.choice(reds), rot=r.uniform(-15, 15)),
        lambda: heart(x, y, 3.2, r.choice(reds), rot=r.uniform(-30, 30)),
        lambda: sprig(x, y, 1.5, "#8C6A4F", "#A63D2A", rot=r.uniform(-40, 40), berries="#C92A2A"),
        lambda: star(x, y, 28, "#E8590C", rot=r.uniform(0, 70)),
    ])(), 22, 11)
    add("xmas-family", "Рождество семьи", ["новый год", "рождество", "семья"],
        svg(body + grain, "#FFFDF8", GRAIN), page="#FFFDF8", ink="#B02A2A", accent="#C92A2A", font="script", frame="round", inset=.1, decor="none")

    # 2. Merry night — тёмный, неоновые дудлы
    neon = ["#C0EB75", "#F783AC", "#FFD43B", "#63E6BE"]
    body = scatter(lambda x, y, r: r.choice([
        lambda: star(x, y, r.uniform(10, 22), "", rot=r.uniform(0, 70), stroke=r.choice(neon), sw=3),
        lambda: f"<circle cx='{x:.0f}' cy='{y:.0f}' r='{r.uniform(2, 4):.1f}' fill='{r.choice(neon)}'/>",
        lambda: snowflake(x, y, r.uniform(14, 24), r.choice(neon), sw=2.5),
        lambda: f"<g fill='none' stroke='{r.choice(neon)}' stroke-width='3'>{tree(x, y, 60, 'none').replace(chr(39)+'none'+chr(39), chr(39)+'none'+chr(39))}</g>",
    ])(), 46, 21, margin=10)
    add("neon-night", "Неоновая ночь", ["новый год", "праздник", "молодёжь"],
        svg(body, "#2B2D42"), page="#2B2D42", ink="#F8F9FA", accent="#C0EB75", font="hand", frame="thin", inset=.08, decor="none")

    # 3. Наш счастливый Новый год — пудровый, гирлянда и ёлочки
    garland = "".join(
        f"<path d='M{x0} 0 Q{x0 + 125} 120 {x0 + 250} 0' stroke='#4A3B32' stroke-width='2' fill='none'/>" +
        "".join(f"<circle cx='{x0 + 250 * t:.0f}' cy='{120 * 2 * t * (1 - t) * 1:.0f}' r='7' fill='{c}'/>"
                for t, c in ((.2, "#F59F00"), (.4, "#E64980"), (.6, "#37B24D"), (.8, "#4DABF7")))
        for x0 in range(-50, 1050, 250))
    trees = "".join(tree(x, 960, h, c, star_c="#E0A800") for x, h, c in
                    ((140, 190, "#E9A6B4"), (250, 250, "#1F6E43"), (360, 170, "#D4A373"), (640, 160, "#E9A6B4"), (760, 240, "#1F6E43"), (880, 180, "#C9A227")))
    dots = scatter(lambda x, y, r: f"<circle cx='{x:.0f}' cy='{y:.0f}' r='{r.uniform(1.5, 3.5):.1f}' fill='#E0A800' opacity='.8'/>", 60, 31)
    add("happy-new-year", "Счастливый Новый год", ["новый год", "семья"],
        svg(garland + dots + trees + grain, "#F4E7E2", GRAIN), page="#F4E7E2", ink="#B02A2A", accent="#1F6E43", font="script", frame="white", inset=.12, decor="none")

    # 4. Ёлочные шары — плотный паттерн, фото в белой плашке
    rnd = random.Random(41)
    pat = []
    for gy in range(-40, 1080, 130):
        for gx in range(-40 + (gy // 130 % 2) * 65, 1080, 130):
            k = rnd.random()
            if k < .45:
                pat.append(bauble(gx, gy, 38, rnd.choice(["#E8875B", "#7FB7B0", "#3B4A6B", "#F2B880"]), cap="#F6E7C8", stripe="#F6E7C8", line="#F6E7C8"))
            elif k < .75:
                pat.append(sprig(gx, gy + 40, .7, "#F6E7C8", rnd.choice(["#E8875B", "#7FB7B0"]), rot=rnd.uniform(-60, 60)))
            else:
                pat.append(snowflake(gx, gy, 22, "#F6E7C8", sw=3))
    add("bauble-pattern", "Ёлочные шары", ["новый год", "паттерн"],
        svg("".join(pat), "#4A2A2A"), page="#4A2A2A", ink="#F6E7C8", accent="#E8875B", font="script", frame="white", inset=.14, decor="none")

    # 5. Christmas time — бордовая рамка, золотые ветви
    branch = lambda x, y, rot: f"<g transform='translate({x} {y}) rotate({rot})'>" + "".join(
        f"<line x1='0' y1='{-i * 14}' x2='{s * 34}' y2='{-i * 14 - 22}' stroke='#D4AF37' stroke-width='2.4'/>"
        for i in range(1, 12) for s in (-1, 1)) + "<line x1='0' y1='0' x2='0' y2='-170' stroke='#D4AF37' stroke-width='3'/></g>"
    body = ("<rect x='0' y='0' width='1000' height='1000' fill='#7B1E22'/>"
            "<rect x='60' y='60' width='880' height='880' fill='#2F1B14'/>" +
            branch(60, 200, 135) + branch(200, 60, 135) + branch(940, 800, -45) + branch(800, 940, -45) + branch(940, 160, 45) +
            scatter(lambda x, y, r: f"<circle cx='{x:.0f}' cy='{y:.0f}' r='{r.uniform(1.5, 3):.1f}' fill='#F1D58A' opacity='.7'/>", 70, 51))
    add("christmas-time", "Christmas time", ["новый год", "рождество"],
        svg(body, "#7B1E22"), page="#2F1B14", ink="#F8EBD0", accent="#D4AF37", font="script", frame="none", inset=.07, decor="none")

    # 6. Выпуск 2025 — неоновый градиент
    defs = ("<linearGradient id='n' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#151A63'/><stop offset='.55' stop-color='#3F1D8F'/>"
            "<stop offset='1' stop-color='#C2185B'/></linearGradient><filter id='glow'><feGaussianBlur stdDeviation='9'/></filter>")
    body = ("<rect width='1000' height='1000' fill='url(#n)'/>"
            "<path d='M-50 700 C200 560 420 860 1050 520' stroke='#ff4fd8' stroke-width='60' fill='none' opacity='.35' filter='url(#glow)'/>"
            "<path d='M-50 760 C260 640 480 900 1050 600' stroke='#4fd8ff' stroke-width='28' fill='none' opacity='.35' filter='url(#glow)'/>"
            "<text x='60' y='190' font-family='Jost, sans-serif' font-weight='200' font-size='170' fill='none' stroke='#fff' stroke-width='3'>2</text>"
            "<text x='820' y='930' font-family='Jost, sans-serif' font-weight='200' font-size='170' fill='none' stroke='#fff' stroke-width='3'>5</text>")
    add("grad-neon", "Выпуск · неон", ["выпускной", "школа", "11 класс"],
        svg(body, "#151A63", defs), page="#151A63", ink="#FFFFFF", accent="#4FD8FF", font="display", frame="neon", inset=.12, decor="none")

    # 7. Выпускной альбом — фиолетовый плеер
    defs = "<linearGradient id='p' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#6A1B9A'/><stop offset='1' stop-color='#9C27B0'/></linearGradient>"
    body = ("<rect width='1000' height='1000' fill='url(#p)'/>" +
            "".join(f"<rect x='{x}' y='{y}' width='180' height='180' rx='8' fill='#fff' opacity='.06'/>" for x in range(20, 1000, 200) for y in range(20, 1000, 200)) +
            "<rect x='150' y='905' width='700' height='4' rx='2' fill='#fff' opacity='.5'/><rect x='150' y='905' width='300' height='4' rx='2' fill='#fff'/>"
            "<circle cx='450' cy='907' r='9' fill='#fff'/>"
            "<path d='M470 935 l24 14 -24 14z M420 935 l-16 14 16 14z M406 935 h-6 v28 h6z M520 935 l16 14 -16 14z M536 935 h6 v28 h-6z' fill='#fff'/>")
    add("grad-player", "Выпускной · плеер", ["выпускной", "школа", "9 класс"],
        svg(body, "#6A1B9A", defs), page="#7B1FA2", ink="#FFFFFF", accent="#FFFFFF", font="sans", frame="white", inset=.1, decor="none")

    # 8. Детский сад — пастельные пятна и дудлы
    blobs = "".join(f"<path d='M{x} {y} c60 -80 180 -60 200 20 c20 80 -80 150 -160 120 c-70 -25 -90 -80 -40 -140z' fill='{c}' opacity='.85'/>"
                    for x, y, c in ((-40, 120, "#B9B4E6"), (820, 40, "#F7A58B"), (860, 860, "#FFD8A8"), (-30, 860, "#A5D8FF")))
    doodles = scatter(lambda x, y, r: big(r.choice([
        lambda: f"<text x='{x:.0f}' y='{y:.0f}' font-family='Caveat, cursive' font-size='54' fill='{r.choice(['#7048E8', '#F76707', '#0CA678'])}'>{r.choice('123ABC')}</text>",
        lambda: star(x, y, 14, "", stroke="#F59F00", sw=3, rot=r.uniform(0, 60)),
        lambda: f"<path d='M{x:.0f} {y:.0f} l20 -18 l20 18 v22 h-40z' fill='none' stroke='#1C7ED6' stroke-width='3'/>",
        lambda: f"<path d='M{x:.0f} {y:.0f} c10 -10 20 10 30 0 s20 10 30 0' fill='none' stroke='#E64980' stroke-width='3'/>",
    ])(), x, y, 1.8), 16, 61, margin=40, avoid=(170, 170, 830, 830))
    add("kindergarten", "Детский сад", ["выпускной", "детский сад", "дети"],
        svg(blobs + doodles + grain, "#FFF9F0", GRAIN), page="#FFF9F0", ink="#5F3DC4", accent="#F76707", font="hand", frame="polaroid", inset=.13, decor="none")

    # 9. Magic — крафт и молнии
    body = scatter(lambda x, y, r: bolt(x, y, 1.1, "#B03A2E", rot=r.uniform(-25, 25)), 70, 71, margin=10)
    add("magic", "Magic", ["дети", "праздник", "школа"],
        svg(body + grain, "#CDBFA6", GRAIN), page="#CDBFA6", ink="#7B1E22", accent="#B03A2E", font="display", frame="white", inset=.1, decor="none")

    # 10. Наша осень — бежевый, сухоцветы
    body = "".join(lineflower(x, y, s * 1.8, "#B08968", sw=2.6) for x, y, s in ((80, 820, 36), (150, 760, 26), (60, 680, 22), (920, 120, 30), (860, 200, 22))) + \
        "".join(leaf(x, y, 2.6, c, rot=rt, op=.8, vein="#8C6A4F") for x, y, c, rt in
                ((40, 950, "#D4A373", -60), (180, 960, "#CCA36A", -100), (900, 60, "#D4A373", 120), (960, 230, "#BC8A5F", 160)))
    add("autumn", "Наша осень", ["осень", "семья", "прогулка"],
        svg(body + grain, "#EFE6DA", GRAIN), page="#EFE6DA", ink="#5C4033", accent="#B08968", font="display", frame="none", inset=.1, decor="none")

    # 11. Воспоминания — луг с жёлтыми цветами по краю
    rnd = random.Random(81)
    meadow = []
    for _ in range(140):
        x, y = rnd.uniform(-20, 300), rnd.uniform(-20, 1020)
        k = rnd.random()
        meadow.append(flower(x, y, rnd.uniform(14, 26), rnd.choice(["#F2C94C", "#F4D35E", "#E9B949"]), "#8C6A1F", rot=rnd.uniform(0, 60)) if k < .45
                      else leaf(x, y, rnd.uniform(.8, 1.4), rnd.choice(["#7A8B4A", "#94A35C", "#5E7038"]), rot=rnd.uniform(0, 360)))
    add("meadow", "Воспоминания · луг", ["лето", "семья", "свадьба"],
        svg("".join(meadow) + "<rect x='300' y='0' width='4' height='1000' fill='#E9DFC8'/>" + grain, "#F7F1E3", GRAIN),
        page="#F7F1E3", ink="#5E7038", accent="#E9B949", font="script", frame="none", inset=.1, decor="none")

    # 12. Наше кино — чёрный, плёнка и тёплое свечение
    defs = "<radialGradient id='w' cx='.2' cy='.9' r='.8'><stop offset='0' stop-color='#E8590C' stop-opacity='.75'/><stop offset='1' stop-color='#E8590C' stop-opacity='0'/></radialGradient>"
    film = lambda y: f"<rect x='0' y='{y}' width='1000' height='70' fill='#111'/>" + "".join(
        f"<rect x='{x}' y='{y + 10}' width='26' height='14' rx='3' fill='#2b2b2b'/><rect x='{x}' y='{y + 46}' width='26' height='14' rx='3' fill='#2b2b2b'/>" for x in range(10, 1000, 48))
    add("cinema", "Наше кино", ["молодёжь", "друзья", "путешествия"],
        svg("<rect width='1000' height='1000' fill='url(#w)'/>" + film(0) + film(930) + grain, "#1A1A1A", defs + GRAIN),
        page="#1A1A1A", ink="#F8F0E3", accent="#E8590C", font="display", frame="thin", inset=.1, decor="none")

    # 13. Любимой маме — айвори и линейные цветы пастелью
    body = "".join(lineflower(x, y, s * 1.9, c, sw=3.2, rot=rt) for x, y, s, c, rt in
                   ((110, 130, 40, "#E599B6", 10), (210, 80, 28, "#9AC5E5", 30), (870, 140, 38, "#B5A1E0", 0), (790, 70, 24, "#E599B6", 20),
                    (120, 820, 34, "#9AC5E5", 5), (880, 800, 40, "#E599B6", 40), (800, 880, 26, "#B5A1E0", 12)))
    add("for-mom", "Любимой маме", ["мама", "семья", "праздник"],
        svg(body + grain, "#FBF7F0", GRAIN), page="#FBF7F0", ink="#4A4A4A", accent="#E599B6", font="script", frame="circle", inset=.14, decor="none")

    # 14. Итоги года — дудлы на белом
    doodle = lambda x, y, r: r.choice([
        lambda: star(x, y, r.uniform(12, 20), "", stroke="#222", sw=2.5, rot=r.uniform(0, 70)),
        lambda: f"<g fill='none' stroke='#222' stroke-width='2.5'><circle cx='{x:.0f}' cy='{y:.0f}' r='18'/><circle cx='{x - 6:.0f}' cy='{y - 4:.0f}' r='1.6' fill='#222'/><circle cx='{x + 6:.0f}' cy='{y - 4:.0f}' r='1.6' fill='#222'/><path d='M{x - 8:.0f} {y + 5:.0f} q8 8 16 0'/></g>",
        lambda: f"<g fill='none' stroke='#222' stroke-width='2.5'><circle cx='{x:.0f}' cy='{y + 14:.0f}' r='9'/><circle cx='{x + 18:.0f}' cy='{y + 18:.0f}' r='9'/><path d='M{x:.0f} {y + 5:.0f} q6 -26 20 -30 M{x + 18:.0f} {y + 9:.0f} q-2 -20 2 -34'/></g>",
        lambda: f"<path d='M{x:.0f} {y:.0f} c-20 -18 -30 6 -10 10 c-20 4 -10 28 10 10 c20 18 30 -6 10 -10 c20 -4 10 -28 -10 -10z' fill='none' stroke='#222' stroke-width='2.5'/>",
        lambda: f"<text x='{x:.0f}' y='{y:.0f}' font-family='Caveat, cursive' font-size='36' fill='#222'>ok</text>",
    ])()
    add("archive", "Итоги года", ["итоги года", "друзья", "молодёжь"],
        svg(border_ring(lambda x, y, r: big(doodle(x, y, r), x, y, 2.1), 20, 91, inner=.17) + grain, "#FFFFFF", GRAIN), page="#FFFFFF", ink="#1A1A1A", accent="#1A1A1A", font="hand", frame="polaroid", inset=.12, decor="none")

    # 15. Travel — авиапочта
    stripes = "".join(f"<polygon points='{x},0 {x + 30},0 {x + 10},24 {x - 20},24' fill='{c}'/>" for i, x in enumerate(range(-40, 1040, 40)) for c in [("#C92A2A" if i % 2 else "#1C3D7A")])
    body = stripes + stripes.replace("points='", "transform='translate(0 976)' points='") + \
        "<g fill='none' stroke='#1C3D7A' stroke-width='2' stroke-dasharray='8 10' opacity='.6'><path d='M80 880 C300 700 520 980 900 760'/></g>" \
        "<path d='M900 760 l-24 4 l10 10z' fill='#1C3D7A' opacity='.6'/>"
    add("travel", "Travel", ["путешествия", "море", "отпуск"],
        svg(body + grain, "#FAFAF7", GRAIN), page="#FAFAF7", ink="#1C3D7A", accent="#C92A2A", font="display", frame="none", inset=.1, decor="none")

    # 16. Moments — акварельный лавандовый
    defs = ("<filter id='wc'><feTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3' seed='7'/><feDisplacementMap in='SourceGraphic' scale='120'/>"
            "<feGaussianBlur stdDeviation='14'/></filter>")
    body = ("<g filter='url(#wc)' opacity='.9'><circle cx='120' cy='140' r='260' fill='#C3B5F5'/><circle cx='900' cy='200' r='240' fill='#F5B5D3'/>"
            "<circle cx='850' cy='880' r='280' fill='#B5D3F5'/><circle cx='120' cy='900' r='230' fill='#E5C3F5'/></g>")
    add("moments", "Moments · акварель", ["свадьба", "лето", "нежный"],
        svg(body, "#F7F3FB", defs), page="#F7F3FB", ink="#5B4B8A", accent="#9C88D9", font="display", frame="white", inset=.13, decor="none")

    # 17. Ретро-марка «С Новым годом»
    body = ("<rect x='40' y='40' width='920' height='920' fill='#F4EAD5'/>" +
            "".join(f"<circle cx='{x}' cy='40' r='13' fill='#2F5D62'/><circle cx='{x}' cy='960' r='13' fill='#2F5D62'/>" for x in range(40, 1000, 34)) +
            "".join(f"<circle cx='40' cy='{y}' r='13' fill='#2F5D62'/><circle cx='960' cy='{y}' r='13' fill='#2F5D62'/>" for y in range(40, 1000, 34)) +
            scatter(lambda x, y, r: snowflake(x, y, r.uniform(8, 16), "#2F5D62", op=.25, sw=2), 30, 101, margin=70))
    add("retro-stamp", "Ретро-открытка", ["новый год", "ретро", "открытка"],
        svg(body, "#2F5D62"), page="#F4EAD5", ink="#B02A2A", accent="#2F5D62", font="script", frame="white", inset=.12, decor="none")

    # 18. Свадьба · эвкалипт
    body = "".join(sprig(x, y, s * 1.9, "#7D8F69", c, rot=rt) for x, y, s, c, rt in
                   ((60, 330, 1.6, "#9CAF88", 30), (130, 260, 1.2, "#B5C4A1", 60), (940, 700, 1.6, "#9CAF88", -150), (870, 760, 1.2, "#B5C4A1", -120)))
    add("wedding-eucalyptus", "Свадьба · эвкалипт", ["свадьба", "любовь"],
        svg(body + grain, "#FBF9F4", GRAIN), page="#FBF9F4", ink="#5A6B4A", accent="#9CAF88", font="script", frame="arch", inset=.13, decor="none")

    # 19. Малыш — минимализм с датой
    body = "<rect x='0' y='0' width='500' height='1000' fill='#F1F3F5'/><rect x='500' y='500' width='500' height='500' fill='#E9ECEF'/>"
    add("baby-minimal", "Малыш · минимал", ["дети", "малыш", "семья"],
        svg(body, "#FFFFFF"), page="#FFFFFF", ink="#343A40", accent="#ADB5BD", font="display", frame="none", inset=.08, decor="none")

    # 20. Коллаж — горчица, точки, листья
    dots = "".join(f"<circle cx='{x}' cy='{y}' r='16' fill='#2D3A2E'/>" for x in range(740, 960, 50) for y in range(80, 300, 50))
    body = ("<rect x='0' y='0' width='160' height='1000' fill='#C9A227'/><circle cx='850' cy='880' r='170' fill='#E2B33C' opacity='.9'/>" + dots +
            "".join(leaf(x, y, 2.2, "#4E6E58", rot=rt, op=.9) for x, y, rt in ((60, 900, -50), (120, 960, -80), (40, 820, -20))))
    add("collage-mustard", "Коллаж · горчица", ["стиль", "друзья", "молодёжь"],
        svg(body + grain, "#F5F2EA", GRAIN), page="#F5F2EA", ink="#2D3A2E", accent="#C9A227", font="display", frame="none", inset=.1, decor="none")

    CFG.write_text(json.dumps({"designs": D}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(D)} designs -> {OUT}")


if __name__ == "__main__":
    build()
