"""Build Play-listing screenshots: device capture + caption on a branded ground.

Play wants each side 320-3840px and an aspect ratio no more extreme than 2:1.
The raw captures are 1080x2424 (2.24:1), which is OUTSIDE that, so every output
is composed onto a compliant 9:16 or 16:9 canvas rather than shipped raw.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

RAW = r'C:\Users\JUSTIN~1.DIA\AppData\Local\Temp\claude\C--Users-justin-dial-Documents-GitHub-healerSim\f9924cca-9961-4800-98ca-aa202849c03e\scratchpad\raw'
OUT = r'C:\Users\justin.dial\Documents\GitHub\healerSim\android\store\screenshots'
CINZEL = r'C:\Users\justin.dial\Documents\GitHub\healerSim\android\app\src\main\res\font\cinzel.ttf'
SANS = r'C:\Windows\Fonts\segoeui.ttf'
SANS_B = r'C:\Windows\Fonts\segoeuib.ttf'

OBSIDIAN_TOP = (10, 16, 36)
OBSIDIAN_BOT = (5, 7, 15)
GILT = (232, 200, 121)
GILT_DIM = (138, 106, 43)
INK = (237, 230, 214)
INK_MUTED = (150, 160, 185)


def ground(w, h):
    """Vertical obsidian gradient with a soft gilt bloom behind the device."""
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line([(0, y), (w, y)], fill=tuple(
            int(OBSIDIAN_TOP[i] + (OBSIDIAN_BOT[i] - OBSIDIAN_TOP[i]) * t) for i in range(3)))
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    r = int(min(w, h) * 0.55)
    gd.ellipse([w // 2 - r, int(h * 0.42) - r, w // 2 + r, int(h * 0.42) + r], fill=(60, 46, 18))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=min(w, h) // 6))
    return Image.blend(img, Image.blend(img, glow, 0.0), 0.0) if False else Image.composite(
        Image.blend(img, glow, 0.55), img, Image.new('L', (w, h), 90))


def tracked(draw, xy, text, font, fill, spacing):
    """PIL has no letter-spacing; draw glyph by glyph. Returns width used."""
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + spacing
    return x - xy[0] - spacing


def tracked_width(draw, text, font, spacing):
    return sum(draw.textlength(c, font=font) for c in text) + spacing * max(0, len(text) - 1)


def rounded(img, radius, border=4, border_col=GILT_DIM):
    mask = Image.new('L', img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                           radius=radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    ImageDraw.Draw(out).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1],
                                          radius=radius, outline=border_col + (255,), width=border)
    return out


def shadow_paste(canvas, art, pos):
    sh = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    sh.paste(Image.new('RGBA', art.size, (0, 0, 0, 190)), pos, art)
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(26)))
    canvas.alpha_composite(art, pos)


def fit_to(img, box_w, box_h):
    """Contain, not cover. A store screenshot that crops away the action bar or
    the party names is advertising a UI the app does not have."""
    s = min(box_w / img.width, box_h / img.height)
    return img.resize((int(img.width * s + 0.5), int(img.height * s + 0.5)), Image.LANCZOS)


def portrait(src, line1, line2, out_name, title=False):
    W, H = 1080, 1920
    canvas = ground(W, H).convert('RGBA')
    d = ImageDraw.Draw(canvas)

    if title:
        f1 = ImageFont.truetype(CINZEL, 132)
        f2 = ImageFont.truetype(SANS_B, 40)
        w1 = tracked_width(d, line1, f1, 14)
        tracked(d, ((W - w1) / 2, 150), line1, f1, GILT, 14)
        w2 = tracked_width(d, line2, f2, 10)
        tracked(d, ((W - w2) / 2, 320), line2, f2, INK_MUTED, 10)
        art_top, art_h = 430, 1360
    else:
        f1 = ImageFont.truetype(CINZEL, 76)
        f2 = ImageFont.truetype(SANS, 34)
        w1 = tracked_width(d, line1, f1, 6)
        tracked(d, ((W - w1) / 2, 120), line1, f1, GILT, 6)
        if line2:
            w2 = d.textlength(line2, font=f2)
            d.text(((W - w2) / 2, 232), line2, font=f2, fill=INK_MUTED)
        art_top, art_h = 320, 1470

    art = rounded(fit_to(Image.open(src).convert('RGB'), 900, art_h), 30)
    shadow_paste(canvas, art, ((W - art.width) // 2, art_top + (art_h - art.height) // 2))
    canvas.convert('RGB').save(os.path.join(OUT, out_name), 'PNG')
    print('  ', out_name, f'{W}x{H}')


def landscape(src, line1, line2, out_name):
    W, H = 1920, 1080
    canvas = ground(W, H).convert('RGBA')
    d = ImageDraw.Draw(canvas)

    f1 = ImageFont.truetype(CINZEL, 66)
    f2 = ImageFont.truetype(SANS, 30)
    # caption column on the left, device to its right
    x = 90
    y = 300
    words, line, lines = line1.split(' '), '', []
    for w in words:
        trial = (line + ' ' + w).strip()
        if tracked_width(d, trial, f1, 5) > 560 and line:
            lines.append(line)
            line = w
        else:
            line = trial
    lines.append(line)
    for ln in lines:
        tracked(d, (x, y), ln, f1, GILT, 5)
        y += 88
    if line2:
        y += 14
        for ln in _wrap(d, line2, f2, 560):
            d.text((x, y), ln, font=f2, fill=INK_MUTED)
            y += 42

    art_w, art_h = 1190, 940
    art = rounded(fit_to(Image.open(src).convert('RGB'), art_w, art_h), 26)
    shadow_paste(canvas, art, (W - art.width - 70, (H - art.height) // 2))
    canvas.convert('RGB').save(os.path.join(OUT, out_name), 'PNG')
    print('  ', out_name, f'{W}x{H}')


def _wrap(d, text, font, maxw):
    out, line = [], ''
    for w in text.split(' '):
        trial = (line + ' ' + w).strip()
        if d.textlength(trial, font=font) > maxw and line:
            out.append(line)
            line = w
        else:
            line = trial
    out.append(line)
    return out


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

print('portrait 1080x1920 (9:16):')
portrait(f'{RAW}/p-splash.png', 'OVERHEAL', 'THE HEALER\u2019S OATH', '01-title.png', title=True)
portrait(f'{RAW}/p-combat-boss.png', 'Five bars, one job', 'Nobody else is watching them', '02-five-bars.png')
portrait(f'{RAW}/p-combat-hots.png', 'The tank is not okay', 'He will not tell you this', '03-tank.png')
portrait(f'{RAW}/p-class.png', 'Pick your poison', 'Three healers, three problems', '04-classes.png')
portrait(f'{RAW}/p-talents.png', 'Talents that mean it', 'The numbers match the text', '05-talents.png')
portrait(f'{RAW}/p-dungeons.png', 'Sixteen dungeons', 'Then an endless one', '06-dungeons.png')

print('landscape 1920x1080 (16:9):')
landscape(f'{RAW}/l-combat.png', 'Drag a spell onto a frame', 'One gesture. Target and heal, the way click-casting always worked.', '07-drag-to-cast.png')
landscape(f'{RAW}/l-dungeons.png', 'Sixteen dungeons deep', 'Then an endless one that does not stop scaling.', '08-dungeons-wide.png')
landscape(f'{RAW}/l-talents.png', 'Spend the point', 'Thirty-odd talents a tree, and a free respec whenever you like.', '09-talents-wide.png')
landscape(f'{RAW}/l-combat2.png', 'Nobody thanks the healer', 'Play offline. No ads, no account, no timers, nothing to buy.', '10-no-thanks.png')
