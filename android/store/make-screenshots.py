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


SPLASH = os.path.join(OUT, '..', '..', 'app', 'src', 'main', 'res', 'drawable', 'splash_bg.png')
FEATURE = os.path.join(os.path.dirname(OUT), 'feature-graphic.png')


def feature_graphic():
    """1024x500: the splash figure on the branded ground, the name beside it.

    The splash art is a round medallion with a white rim, so only the disc
    inside the rim is used, feathered, rather than the square it sits in.
    """
    W, H = 1024, 500
    canvas = ground(W, H).convert('RGBA')
    art = Image.open(SPLASH).convert('RGBA')
    size = art.width
    inner = int(size * 0.40)
    c = size // 2
    mask = Image.new('L', art.size, 0)
    ImageDraw.Draw(mask).ellipse([c - inner, c - inner, c + inner, c + inner], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(size // 40))
    art.putalpha(mask)
    art = art.resize((560, 560), Image.LANCZOS)
    canvas.alpha_composite(art, (W - 560 + 90, (H - 560) // 2))

    d = ImageDraw.Draw(canvas)
    f1 = ImageFont.truetype(CINZEL, 70)
    f2 = ImageFont.truetype(SANS_B, 30)
    f3 = ImageFont.truetype(SANS, 24)
    tracked(d, (60, 150), 'OVERHEAL', f1, GILT, 8)
    tracked(d, (64, 268), 'TANK  \u00b7  HEAL  \u00b7  DPS', f2, INK, 6)
    d.text((64, 322), 'A dungeon party where every role is yours.', font=f3, fill=INK_MUTED)
    canvas.convert('RGB').save(FEATURE, 'PNG')
    print('  ', os.path.basename(FEATURE), f'{W}x{H}')


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

# Role-based positioning: every class is a job, and the shots show all three.
print('portrait 1080x1920 (9:16):')
portrait(f'{RAW}/p-splash.png', 'OVERHEAL', 'TANK \u00b7 HEAL \u00b7 DPS', '01-title.png', title=True)
portrait(f'{RAW}/p-class.png', 'Pick your role', 'Heal, tank or deal the damage', '02-roles.png')
portrait(f'{RAW}/p-combat-heal.png', 'Keep them alive', 'Five bars and never enough mana', '03-heal.png')
portrait(f'{RAW}/p-combat-tank.png', 'Hold the line', 'Rage, threat, and a boss that wants you', '04-tank.png')
portrait(f'{RAW}/p-combat-dps.png', 'Build, then spend', 'Energy, combo points, one big finisher', '05-dps.png')
portrait(f'{RAW}/p-character.png', 'A mechanic per class', 'Your signature stat changes how it plays', '06-mastery.png')

print('landscape 1920x1080 (16:9):')
landscape(f'{RAW}/l-combat.png', 'Drag a spell onto a frame', 'Healers target and cast in one gesture.', '07-drag-to-cast.png')
landscape(f'{RAW}/l-combat2.png', 'Hold its attention', 'Tanks keep the enemy on themselves, or the healer pays for it.', '08-threat.png')
landscape(f'{RAW}/l-talents.png', 'Spend the point', 'A full talent tree for every class, and a free respec whenever you like.', '09-talents-wide.png')
landscape(f'{RAW}/l-dungeons.png', 'Sixteen dungeons deep', 'Then an endless one. Offline, no ads, nothing to buy.', '10-dungeons-wide.png')

print('feature graphic 1024x500:')
feature_graphic()
