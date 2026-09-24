"""Party-frame mockups in the idiom of VuhDo / HealBot / Grid, themed for TBC-WotLK.

The comparison that matters: in those addons the health bar IS the cell. No card
around it, no separate title row, gaps of 1-2px. Name, health, HoTs and debuffs
are overlaid on the bar or tucked into its corners, because every pixel of a
raid frame is meant to carry data.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = r'C:\Users\justin.dial\Documents\GitHub\healerSim\android\design\mockups'
ARIALN = r'C:\Windows\Fonts\ARIALN.TTF'
ARIALNB = r'C:\Windows\Fonts\ARIALNB.TTF'
GEORGIA = r'C:\Windows\Fonts\georgiab.ttf'

W = 1000

CLS = {
    'warrior': (199, 156, 110), 'mage': (105, 204, 240), 'rogue': (255, 245, 105),
    'druid': (255, 125, 10), 'priest': (255, 255, 255), 'warlock': (148, 130, 201),
}

# name, class, hp, shield, hots, debuff kind, has aggro
PARTY = [
    ('Stonekin', 'warrior', 0.62, 0.00, 0, 'magic', True),
    ('Zappy Mage', 'mage', 1.00, 0.00, 0, None, False),
    ('Sneaky Rogue', 'rogue', 0.78, 0.00, 1, None, False),
    ('Feral Kitty', 'druid', 0.45, 0.12, 2, 'poison', False),
    ('Player (You)', 'priest', 0.91, 0.00, 1, None, False),
]
DISPEL = {'magic': (90, 160, 255), 'curse': (170, 120, 240), 'poison': (120, 220, 110)}
MAXHP = 2400


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gloss(img, box, strength=52):
    """The classic Blizzard/Gloss statusbar texture: lit upper half, shaded lower."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w <= 0 or h <= 0:
        return
    ov = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for i in range(h):
        t = i / max(1, h - 1)
        if t < 0.5:
            d.line([(0, i), (w, i)], fill=(255, 255, 255, int(strength * (1 - t / 0.5))))
        else:
            d.line([(0, i), (w, i)], fill=(0, 0, 0, int(strength * 0.8 * (t - 0.5) / 0.5)))
    img.alpha_composite(ov, (x0, y0))


def bevel(d, box, light, dark, width=2):
    x0, y0, x1, y1 = box
    for i in range(width):
        d.line([(x0 + i, y0 + i), (x1 - i, y0 + i)], fill=light)
        d.line([(x0 + i, y0 + i), (x0 + i, y1 - i)], fill=light)
        d.line([(x0 + i, y1 - i), (x1 - i, y1 - i)], fill=dark)
        d.line([(x1 - i, y0 + i), (x1 - i, y1 - i)], fill=dark)


def chip(d, box, fill, ring, timer, font):
    d.rectangle(box, fill=fill, outline=ring, width=2)
    d.text(((box[0] + box[2]) / 2, (box[1] + box[3]) / 2), str(timer),
           font=font, fill=(255, 255, 255), anchor='mm',
           stroke_width=2, stroke_fill=(0, 0, 0))


def ink(col, over_fill):
    """Text colour picked from what is behind it. Class colours run from white
    (priest) to dark orange (druid), so a fixed white name is unreadable on some
    rows -- the addons solve this with an outline, which is what this is."""
    if not over_fill:
        return (255, 255, 255)
    lum = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]
    return (16, 14, 12) if lum > 150 else (255, 255, 255)


def label(d, xy, text, font, fill, anchor='la'):
    d.text(xy, text, font=font, fill=fill, anchor=anchor,
           stroke_width=2, stroke_fill=(0, 0, 0) if sum(fill) > 200 else (245, 245, 245))


def header(d, text, sub):
    d.text((16, 10), text, font=ImageFont.truetype(GEORGIA, 23), fill=(226, 200, 140))
    d.text((16, 40), sub, font=ImageFont.truetype(ARIALN, 19), fill=(140, 140, 148))


def vuhdo(path):
    rows, gap, pad, top = 62, 2, 14, 74
    H = top + pad + rows * len(PARTY) + gap * (len(PARTY) - 1) + pad
    img = Image.new('RGBA', (W, H), (18, 18, 20, 255))
    d = ImageDraw.Draw(img)
    header(d, 'VuhDo idiom', 'The bar is the cell. Name tinted by dispel type, debuff top-left, HoTs bottom-right.')

    fn, fv, ft = (ImageFont.truetype(ARIALNB, 26), ImageFont.truetype(ARIALNB, 26),
                  ImageFont.truetype(ARIALNB, 16))
    y = top + pad
    for name, cls, hp, shield, hots, debuff, aggro in PARTY:
        col = CLS[cls]
        x0, x1 = pad, W - pad
        d.rectangle((x0, y, x1, y + rows), fill=mix(col, (0, 0, 0), 0.84))
        fw = int((x1 - x0) * hp)
        d.rectangle((x0, y, x0 + fw, y + rows), fill=col)
        gloss(img, (x0, y, x0 + fw, y + rows))
        if shield:
            sw = int((x1 - x0) * shield)
            d.rectangle((x0 + fw, y, min(x1, x0 + fw + sw), y + rows), fill=mix(col, (255, 255, 255), 0.6))
        # aggro is a border. The bar colour already means class, and health means health.
        d.rectangle((x0, y, x1, y + rows), outline=(206, 44, 44) if aggro else (8, 8, 8),
                    width=3 if aggro else 1)

        tx = x0 + (40 if debuff else 10)
        nc = DISPEL[debuff] if debuff else ink(col, tx < x0 + fw)
        label(d, (tx, y + 6), name, fn, nc)
        if hp < 1:
            label(d, (tx, y + 34), '-%d' % int((1 - hp) * MAXHP), ft, ink(col, tx < x0 + fw))

        pct = '%d%%' % int(hp * 100)
        pw = d.textlength(pct, font=fv)
        label(d, (x1 - 10, y + 6), pct, fv, ink(col, x1 - pw - 10 < x0 + fw), 'ra')

        if debuff:
            chip(d, (x0 + 5, y + 5, x0 + 33, y + rows - 5), (34, 12, 12), DISPEL[debuff], 8, ft)
        hx = int(x1 - pw - 24)
        for _ in range(hots):
            chip(d, (hx - 24, y + rows - 30, hx - 4, y + rows - 8), (18, 42, 22), (96, 206, 116), 6, ft)
            hx -= 26
        y += rows + gap
    img.convert('RGB').save(path)
    print('  ', os.path.basename(path))


def healbot(path):
    rows, aux, gap, pad, top = 54, 7, 3, 14, 74
    H = top + pad + (rows + aux) * len(PARTY) + gap * (len(PARTY) - 1) + pad
    img = Image.new('RGBA', (W, H), (16, 16, 18, 255))
    d = ImageDraw.Draw(img)
    header(d, 'HealBot idiom', 'Name left, health right, power strip beneath. The border carries dispel type.')

    fn, fv, ft = (ImageFont.truetype(ARIALNB, 25), ImageFont.truetype(ARIALN, 25),
                  ImageFont.truetype(ARIALNB, 15))
    y = top + pad
    for name, cls, hp, shield, hots, debuff, aggro in PARTY:
        col = CLS[cls]
        x0, x1 = pad, W - pad
        d.rectangle((x0, y, x1, y + rows), fill=(28, 28, 30))
        fw = int((x1 - x0) * hp)
        d.rectangle((x0, y, x0 + fw, y + rows), fill=col)
        gloss(img, (x0, y, x0 + fw, y + rows), 46)
        if shield:
            sw = int((x1 - x0) * shield)
            d.rectangle((x0 + fw, y, min(x1, x0 + fw + sw), y + rows), fill=(203, 216, 238))
        bc = DISPEL[debuff] if debuff else ((206, 60, 60) if aggro else (62, 62, 66))
        d.rectangle((x0, y, x1, y + rows), outline=bc, width=3 if (debuff or aggro) else 1)

        label(d, (x0 + 11, y + 12), name, fn, ink(col, True))
        hv = str(int(hp * MAXHP))
        hw = d.textlength(hv, font=fv)
        label(d, (x1 - 11, y + 12), hv, fv, ink(col, x1 - hw - 11 < x0 + fw), 'ra')

        hx = int(x1 - hw - 26)
        for _ in range(hots):
            chip(d, (hx - 22, y + 7, hx - 4, y + 25), (18, 42, 22), (96, 206, 116), 6, ft)
            hx -= 24

        ay = y + rows
        d.rectangle((x0, ay, x1, ay + aux), fill=(12, 12, 14))
        mana = 0.42 if name.startswith('Player') else 0.85
        d.rectangle((x0, ay, x0 + int((x1 - x0) * mana), ay + aux), fill=(58, 108, 198))
        y += rows + aux + gap
    img.convert('RGB').save(path)
    print('  ', os.path.basename(path))


def stone(path):
    rows, gap, pad, top = 66, 4, 16, 74
    H = top + pad + rows * len(PARTY) + gap * (len(PARTY) - 1) + pad
    img = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    for yy in range(H):
        d.line([(0, yy), (W, yy)], fill=mix((46, 42, 36), (23, 20, 17), yy / H))
    header(d, 'TBC / WotLK idiom', 'Stone ground, brass bevel, recessed socket. Same density, period dressing.')

    fn, fv, ft = (ImageFont.truetype(GEORGIA, 23), ImageFont.truetype(ARIALNB, 26),
                  ImageFont.truetype(ARIALNB, 15))
    BRASS_L, BRASS_D = (198, 162, 88), (82, 61, 25)
    y = top + pad
    for name, cls, hp, shield, hots, debuff, aggro in PARTY:
        col = CLS[cls]
        x0, x1 = pad, W - pad
        d.rectangle((x0, y, x1, y + rows), fill=(21, 19, 17))
        bevel(d, (x0, y, x1, y + rows), (216, 92, 62) if aggro else BRASS_L, BRASS_D, 2)

        bx0, bx1, by0, by1 = x0 + 6, x1 - 6, y + 6, y + rows - 6
        d.rectangle((bx0, by0, bx1, by1), fill=(12, 11, 10))
        fw = int((bx1 - bx0) * hp)
        d.rectangle((bx0, by0, bx0 + fw, by1), fill=col)
        gloss(img, (bx0, by0, bx0 + fw, by1), 68)
        if shield:
            sw = int((bx1 - bx0) * shield)
            d.rectangle((bx0 + fw, by0, min(bx1, bx0 + fw + sw), by1), fill=(203, 216, 238))
        d.rectangle((bx0, by0, bx1, by1), outline=(0, 0, 0), width=1)

        nc = DISPEL[debuff] if debuff else (247, 236, 205)
        label(d, (bx0 + 10, y + 8), name, fn, nc)
        pct = '%d%%' % int(hp * 100)
        pw = d.textlength(pct, font=fv)
        label(d, (bx1 - 10, y + 8), pct, fv, ink(col, bx1 - pw - 10 < bx0 + fw), 'ra')
        label(d, (bx0 + 10, y + 38), ('-%d' % int((1 - hp) * MAXHP)) if hp < 1 else 'full',
              ft, ink(col, True))

        if debuff:
            chip(d, (bx1 - 34, by1 - 28, bx1 - 8, by1 - 2), (38, 13, 13), DISPEL[debuff], 8, ft)
        hx = bx0 + 128
        for _ in range(hots):
            chip(d, (hx, by1 - 28, hx + 22, by1 - 6), (20, 46, 24), (122, 212, 132), 6, ft)
            hx += 26
        y += rows + gap
    img.convert('RGB').save(path)
    print('  ', os.path.basename(path))


os.makedirs(OUT, exist_ok=True)
print('mockups:')
vuhdo(os.path.join(OUT, '01-vuhdo-idiom.png'))
healbot(os.path.join(OUT, '02-healbot-idiom.png'))
stone(os.path.join(OUT, '03-wotlk-stone-brass.png'))


# ---------------------------------------------------------------------------
# 04: the TBC/WotLK dressing, built out so auras are the second thing you read.
# ---------------------------------------------------------------------------

ICONS = r'C:\Users\justin.dial\Documents\GitHub\healerSim\public\icons'

# Real art from the game's own asset set, so the mockup is not promising icons
# the app does not ship. Buffs are the WoW icons used for HoTs; debuffs are the
# game-icons glyphs the boss debuff templates actually reference.
BUFF_ART = {
    'renew': 'wow/spell_holy_renew.png',
    'rejuv': 'wow/spell_nature_rejuvenation.png',
    'shield': 'wow/spell_holy_powerwordshield.png',
    'wild': 'wow/spell_nature_giftofthewild.png',
}
DEBUFF_ART = {
    'sunder': 'game-icons/lorc/sunder-armor.png',
    'skull': 'game-icons/lorc/skull-staff.png',
    'vines': 'game-icons/lorc/vines.png',
}

# name, class, hp, shield, buffs [(art, secs, stacks)], debuffs [(art, secs, stacks)], aggro
PARTY_AURAS = [
    ('Stonekin', 'warrior', 0.62, 0.00, [('shield', 6, 1)], [('sunder', 8, 3)], True),
    ('Zappy Mage', 'mage', 1.00, 0.00, [('wild', 21, 1)], [], False),
    ('Sneaky Rogue', 'rogue', 0.78, 0.00, [('renew', 9, 1)], [('vines', 4, 1)], False),
    ('Feral Kitty', 'druid', 0.45, 0.12, [('rejuv', 7, 1), ('renew', 3, 1)],
     [('skull', 12, 2), ('sunder', 5, 1)], False),
    ('Player (You)', 'priest', 0.91, 0.00, [('renew', 11, 1)], [], False),
]

_art_cache = {}


def art(rel, size):
    """Load a game icon at `size`. game-icons ship as a transparent glyph mask,
    so they are recoloured off the alpha channel rather than pasted flat."""
    key = (rel, size)
    if key in _art_cache:
        return _art_cache[key]
    src = Image.open(os.path.join(ICONS, rel.replace('/', os.sep))).convert('RGBA')
    if rel.startswith('game-icons'):
        a = src.split()[3].resize((size, size), Image.LANCZOS)
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        img.paste(Image.new('RGBA', (size, size), (246, 226, 196, 255)), (0, 0), a)
        plate = Image.new('RGBA', (size, size), (44, 16, 16, 255))
        plate.alpha_composite(img)
        img = plate
    else:
        img = src.resize((size, size), Image.LANCZOS).convert('RGBA')
    _art_cache[key] = img
    return img


def aura(img, d, rel, box, hostile, secs, stacks, ft):
    """One aura socket. The ring is the whole signal: hot red for something
    hurting this unit, cold brass for something helping. Size and position are
    identical either way, so the row height never moves and the eye only has to
    sort by colour."""
    x, y, s = box
    glow = Image.new('RGBA', (s + 20, s + 20), (0, 0, 0, 0))
    ImageDraw.Draw(glow).rectangle((0, 0, s + 19, s + 19),
                                   fill=(226, 40, 28, 140) if hostile else (14, 12, 10, 105))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(9)), (x - 10, y - 10))
    img.alpha_composite(art(rel, s), (x, y))
    ring = (222, 60, 48) if hostile else (206, 172, 96)
    # A black kerb on both sides of the ring. Without the outer one the brass
    # disappears into a light class bar, which is exactly where a buff icon
    # most often sits.
    d.rectangle((x - 6, y - 6, x + s + 5, y + s + 5), outline=(0, 0, 0), width=2)
    d.rectangle((x - 4, y - 4, x + s + 3, y + s + 3), outline=ring, width=4)
    d.rectangle((x - 1, y - 1, x + s, y + s), outline=(0, 0, 0), width=1)
    d.text((x + s - 1, y + s + 1), str(secs), font=ft, fill=(255, 255, 255),
           anchor='rs', stroke_width=2, stroke_fill=(0, 0, 0))
    if stacks > 1:
        d.text((x + 2, y + 2), str(stacks), font=ft, fill=(255, 216, 130),
               anchor='la', stroke_width=2, stroke_fill=(0, 0, 0))


def stone_auras(path):
    rows, gap, pad, top, S = 88, 5, 16, 84, 48
    H = top + pad + rows * len(PARTY_AURAS) + gap * (len(PARTY_AURAS) - 1) + pad
    img = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    for yy in range(H):
        d.line([(0, yy), (W, yy)], fill=mix((46, 42, 36), (23, 20, 17), yy / H))
    header(d, 'TBC / WotLK idiom \u2014 auras centred',
           'Debuffs ringed red, buffs ringed brass. Fixed centre slot, so the row never changes height.')

    fn, fv, ft = (ImageFont.truetype(GEORGIA, 24), ImageFont.truetype(ARIALNB, 27),
                  ImageFont.truetype(ARIALNB, 17))
    BRASS_L, BRASS_D = (198, 162, 88), (82, 61, 25)
    y = top + pad
    for name, cls, hp, shield, buffs, debuffs, aggro in PARTY_AURAS:
        col = CLS[cls]
        x0, x1 = pad, W - pad
        d.rectangle((x0, y, x1, y + rows), fill=(21, 19, 17))
        bevel(d, (x0, y, x1, y + rows), (216, 92, 62) if aggro else BRASS_L, BRASS_D, 2)

        bx0, bx1, by0, by1 = x0 + 6, x1 - 6, y + 6, y + rows - 6
        d.rectangle((bx0, by0, bx1, by1), fill=(12, 11, 10))
        fw = int((bx1 - bx0) * hp)
        d.rectangle((bx0, by0, bx0 + fw, by1), fill=col)
        gloss(img, (bx0, by0, bx0 + fw, by1), 68)
        if shield:
            sw = int((bx1 - bx0) * shield)
            d.rectangle((bx0 + fw, by0, min(bx1, bx0 + fw + sw), by1), fill=(203, 216, 238))
        d.rectangle((bx0, by0, bx1, by1), outline=(0, 0, 0), width=1)

        label(d, (bx0 + 10, y + 12), name, fn, (247, 236, 205))
        pct = '%d%%' % int(hp * 100)
        pw = d.textlength(pct, font=fv)
        label(d, (bx1 - 10, y + 12), pct, fv, ink(col, bx1 - pw - 10 < bx0 + fw), 'ra')
        label(d, (bx0 + 10, y + 48), ('-%d' % int((1 - hp) * MAXHP)) if hp < 1 else 'full',
              ft, ink(col, True))

        # Debuffs first so triage reads left to right, and the cluster is centred
        # on the row rather than crowded into a corner.
        items = ([(DEBUFF_ART[k], True, s, n) for k, s, n in debuffs] +
                 [(BUFF_ART[k], False, s, n) for k, s, n in buffs])
        if items:
            step = S + 20
            cx = (bx0 + bx1) // 2 - (len(items) * step - 20) // 2
            ay = y + (rows - S) // 2
            for rel, hostile, secs, stacks in items:
                aura(img, d, rel, (cx, ay, S), hostile, secs, stacks, ft)
                cx += step
        y += rows + gap
    img.convert('RGB').save(path)
    print('  ', os.path.basename(path))


stone_auras(os.path.join(OUT, '04-wotlk-auras.png'))


def stone_auras_phone(path):
    """The same design at true phone scale, because the wide mockup does not
    answer the question that actually decides this: does it fit?

    1080px = a 360dp phone at 3x. Rows are 56dp (168px) with 30dp (90px) icons,
    against the 48dp floor the current layout already lives at. Five rows plus
    gaps come to ~880px of a ~2400px screen, which leaves the enemy frame and
    the action bar the room they have today.
    """
    global W
    prev_w, W = W, 1080
    rows, gap, pad, top, S = 168, 12, 24, 0, 90
    H = rows * len(PARTY_AURAS) + gap * (len(PARTY_AURAS) - 1) + pad * 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(img)
    for yy in range(H):
        d.line([(0, yy), (W, yy)], fill=mix((46, 42, 36), (23, 20, 17), yy / H))

    fn, fv, ft = (ImageFont.truetype(GEORGIA, 42), ImageFont.truetype(ARIALNB, 48),
                  ImageFont.truetype(ARIALNB, 30))
    BRASS_L, BRASS_D = (198, 162, 88), (82, 61, 25)
    y = top + pad
    for name, cls, hp, shield, buffs, debuffs, aggro in PARTY_AURAS:
        col = CLS[cls]
        x0, x1 = pad, W - pad
        d.rectangle((x0, y, x1, y + rows), fill=(21, 19, 17))
        bevel(d, (x0, y, x1, y + rows), (216, 92, 62) if aggro else BRASS_L, BRASS_D, 4)

        bx0, bx1, by0, by1 = x0 + 11, x1 - 11, y + 11, y + rows - 11
        d.rectangle((bx0, by0, bx1, by1), fill=(12, 11, 10))
        fw = int((bx1 - bx0) * hp)
        d.rectangle((bx0, by0, bx0 + fw, by1), fill=col)
        gloss(img, (bx0, by0, bx0 + fw, by1), 68)
        if shield:
            sw = int((bx1 - bx0) * shield)
            d.rectangle((bx0 + fw, by0, min(bx1, bx0 + fw + sw), by1), fill=(203, 216, 238))
        d.rectangle((bx0, by0, bx1, by1), outline=(0, 0, 0), width=2)

        label(d, (bx0 + 18, y + 22), name, fn, (247, 236, 205))
        pct = '%d%%' % int(hp * 100)
        pw = d.textlength(pct, font=fv)
        label(d, (bx1 - 18, y + 22), pct, fv, ink(col, bx1 - pw - 18 < bx0 + fw), 'ra')
        label(d, (bx0 + 18, y + 96), ('-%d' % int((1 - hp) * MAXHP)) if hp < 1 else 'full',
              ft, ink(col, True))

        items = ([(DEBUFF_ART[k], True, s, n) for k, s, n in debuffs] +
                 [(BUFF_ART[k], False, s, n) for k, s, n in buffs])
        if items:
            step = S + 34
            cx = (bx0 + bx1) // 2 - (len(items) * step - 34) // 2
            ay = y + (rows - S) // 2
            for rel, hostile, secs, stacks in items:
                aura(img, d, rel, (cx, ay, S), hostile, secs, stacks, ft)
                cx += step
        y += rows + gap
    img.convert('RGB').save(path)
    print('  ', os.path.basename(path), '%dx%d (360dp @3x)' % (W, H))
    W = prev_w


stone_auras_phone(os.path.join(OUT, '05-wotlk-auras-phone.png'))
