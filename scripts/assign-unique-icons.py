"""Give every talent and spell an icon of its own.

The rules, which android's IconUniquenessTest enforces:

- no two talents share an icon, within a tree or across all trees;
- no two spells share an icon -- except potions, which are meant to look alike,
  and a spell two classes share by id (Flash Heal), which is one spell;
- a talent that unlocks a spell shows that spell's icon (the one deliberate
  echo), and no other talent uses a spell's icon.

The first use of an icon keeps it, in a fixed order (the web app's healers
first, then the Android classes). Each later use is replaced by an unused icon
from that class's own families -- ability_warrior_*, spell_frost_* and so on --
preferring one whose file name shares a word with the talent or spell name.
The choice is deterministic, so running this twice changes nothing.

Only the "icon" values change, edited in place, so each file keeps its own
formatting. Re-run after regenerating a class with a GENERATOR.py, which
writes the shared placeholder icons back.

    python scripts/assign-unique-icons.py          # rewrite
    python scripts/assign-unique-icons.py --check  # report only; exit 1 if anything would change
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WOW = os.path.join(ROOT, 'public', 'icons', 'wow')

# Order decides who keeps a contested icon.
CLASSES = [
    ('priest', 'src/classes'), ('druid', 'src/classes'), ('paladin', 'src/classes'),
    ('warrior', 'android/content/classes'), ('deathknight', 'android/content/classes'),
    ('mage', 'android/content/classes'), ('rogue', 'android/content/classes'),
    ('monk', 'android/content/classes'), ('warlock', 'android/content/classes'),
]

# Where each class looks for a replacement, most characteristic family first.
FAMILIES = {
    'priest': ['ability_priest_', 'spell_priest_', 'spell_holy_'],
    'druid': ['ability_druid_', 'spell_druid_', 'spell_nature_'],
    'paladin': ['ability_paladin_', 'spell_paladin_', 'spell_holy_'],
    'warrior': ['ability_warrior_', 'inv_shield_'],
    'deathknight': ['spell_deathknight_', 'ability_deathknight_', 'spell_shadow_'],
    'mage': ['spell_frost_', 'ability_mage_', 'spell_arcane_', 'spell_fire_'],
    'rogue': ['ability_rogue_', 'ability_poisons_'],
    'monk': ['ability_monk_', 'spell_monk_'],
    'warlock': ['ability_warlock_', 'spell_warlock_', 'spell_shadow_'],
}

# Where the family search would pick badly, the icon the game itself used.
OVERRIDES = {
    ('druid', 'swiftmend'): 'wow/inv_relics_idolofrejuvenation',
}

# Icons that would read as a mistake on a talent: food, mounts, test art.
JUNK = ('conjure', 'food', 'rank', 'mount', 'pet', 'test', 'placeholder', 'misc_')

STOP = {'the', 'of', 'and', 'improved', 'greater', 'lesser', 'with', 'from'}


def available_icons():
    names = sorted({os.path.splitext(f)[0] for f in os.listdir(WOW)})
    return names


def words(text):
    return [w for w in re.findall(r'[a-z]+', text.lower()) if len(w) >= 4 and w not in STOP]


def is_potion(spell_id, spell):
    return 'consumable' in (spell.get('tags') or []) or 'potion' in spell_id


def pick(cls, name, desc, used, icons, reserved):
    """The best unused icon for [name] from [cls]'s families.

    A word from the name counts most, one from the description a little. An
    icon named after something *else* this class has -- another talent or
    spell -- is avoided, or a talent would wear another one's picture.
    """
    own = set(words(name))
    extra = set(words(desc)) - own
    # A family word (frost, shadow, holy) is in half the pool: not a clue.
    family = {w for prefix in FAMILIES[cls] for w in re.findall(r'[a-z]+', prefix)}
    foreign = {w for w in reserved - own - extra if w not in family}
    best, best_score = None, None
    for rank, prefix in enumerate(FAMILIES[cls]):
        for icon in icons:
            if not icon.startswith(prefix) or 'wow/' + icon in used:
                continue
            if any(j in icon for j in JUNK):
                continue
            body = icon[len(prefix):]
            score = (10 * sum(1 for k in own if k in body)
                     + 3 * sum(1 for k in extra if k in body)
                     - 20 * any(k in body for k in foreign)
                     - 2 * rank)
            if best_score is None or score > best_score:
                best, best_score = icon, score
    if best is None:
        raise SystemExit(f'no unused icon left for {cls} / {name}')
    return 'wow/' + best


def replace_icon(text, obj_id, old, new):
    """Changes the icon of the object whose id is [obj_id], in place."""
    m = re.search(r'"id"\s*:\s*"%s"' % re.escape(obj_id), text)
    if not m:
        raise SystemExit(f'object {obj_id} not found')
    nxt = re.search(r'"id"\s*:', text[m.end():])
    end = m.end() + nxt.start() if nxt else len(text)
    pat = re.compile(r'("icon"\s*:\s*)"%s"' % re.escape(old))
    seg = text[m.end():end]
    if not pat.search(seg):
        raise SystemExit(f'icon {old} not found in {obj_id}')
    return text[:m.end()] + pat.sub(lambda g: g.group(1) + '"%s"' % new, seg, count=1) + text[end:]


def main():
    check = '--check' in sys.argv
    icons = available_icons()
    files = {}
    changes = []

    def load(cls, base, kind):
        p = os.path.join(ROOT, base, cls, kind + '.json')
        if p not in files:
            files[p] = io.open(p, encoding='utf-8', newline='').read()
        return p, json.loads(files[p])

    used = set()
    shared = json.load(open(os.path.join(ROOT, 'src/data/shared_spells.json'), encoding='utf-8'))
    spell_icon = {}

    reserved = {}
    for cls, base in CLASSES:
        names = [sp['name'] for sp in load(cls, base, 'spells')[1].values()]
        names += [t['name'] for t in load(cls, base, 'talents')[1]]
        reserved[cls] = {w for n in names for w in words(n)}

    # Spells first: a talent that unlocks one follows it.
    for cls, base in CLASSES:
        p, spells = load(cls, base, 'spells')
        for sid, sp in spells.items():
            icon = sp.get('icon', '')
            if is_potion(sid, sp):
                continue
            if sid in spell_icon:
                # The same spell in a second class: it must match, not differ.
                if icon != spell_icon[sid]:
                    files[p] = replace_icon(files[p], sid, icon, spell_icon[sid])
                    changes.append((cls, 'spell', sid, icon, spell_icon[sid]))
                continue
            forced = OVERRIDES.get((cls, sid))
            if forced and forced != icon and forced not in used:
                files[p] = replace_icon(files[p], sid, icon, forced)
                changes.append((cls, 'spell', sid, icon, forced))
                icon = forced
            if icon in used or not icon:
                new = pick(cls, sp['name'], sp.get('description', ''), used, icons, reserved[cls])
                files[p] = replace_icon(files[p], sid, icon, new)
                changes.append((cls, 'spell', sid, icon, new))
                icon = new
            used.add(icon)
            spell_icon[sid] = icon
    for sid, sp in shared.items():
        spell_icon.setdefault(sid, sp.get('icon', ''))

    for cls, base in CLASSES:
        p, talents = load(cls, base, 'talents')
        for t in talents:
            icon = t.get('icon', '')
            if t.get('spellId'):
                want = spell_icon.get(t['spellId'], icon)
                if want != icon:
                    files[p] = replace_icon(files[p], t['id'], icon, want)
                    changes.append((cls, 'unlock', t['id'], icon, want))
                continue
            if icon in used or not icon:
                new = pick(cls, t['name'], t.get('description', ''), used, icons, reserved[cls])
                files[p] = replace_icon(files[p], t['id'], icon, new)
                changes.append((cls, 'talent', t['id'], icon, new))
                icon = new
            used.add(icon)

    for c in changes:
        print('%-12s %-7s %-22s %s -> %s' % c)
    print(len(changes), 'icon(s)', 'would change' if check else 'changed')
    if check:
        sys.exit(1 if changes else 0)
    for p, text in files.items():
        io.open(p, 'w', encoding='utf-8', newline='').write(text)


if __name__ == '__main__':
    main()
