"""Give every spell a sound of its own within its class.

A class's spells each get a different sound, drawn from the pool for what the
spell does -- a heal from the heals, a strike from the strikes. Two classes may
share one; one class may not use it twice. Every consumable, the mana potion
and the whole stash, shares the potion sound.

Deterministic: spells are taken in the class's spellOrder and each takes the
first variant its class has not used, so running this twice changes nothing.

    python scripts/assign-sounds.py
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, 'android', 'content')

MELEE = {'WARRIOR', 'ROGUE', 'DEATHKNIGHT', 'MONK'}

# Names are ui/Feedback.kt's Cue constants, lower-cased.
POOLS = {
    'heal': ['heal', 'heal_b', 'heal_c', 'heal_d'],
    'heal_aoe': ['heal_group', 'heal_group_b'],
    'hot': ['hot', 'hot_b'],
    'shield': ['shield', 'heal_d'],
    'mana': ['mana'],
    'wall': ['defensive', 'wall_b', 'wall_c'],
    'taunt': ['taunt'],
    'interrupt': ['kick'],
    'dispel': ['dispel'],
    'melee': ['swing', 'swing_b', 'strike'],
    'magic': ['spell', 'bolt_b', 'bolt_c'],
    'melee_aoe': ['cleave', 'cleave_b'],
    'magic_aoe': ['storm', 'storm_b'],
    'dot': ['dot', 'dot_b'],
}
# If a class runs out of a kind, it borrows from a neighbour rather than repeat.
SPILL = {
    'heal': ['heal_aoe', 'hot'], 'hot': ['heal'], 'heal_aoe': ['heal'],
    'melee': ['melee_aoe'], 'magic': ['magic_aoe'], 'dot': ['magic', 'melee'],
    'wall': ['shield'], 'shield': ['wall'],
}


def kind(spell, cls):
    if spell.get('interrupts'):
        return 'interrupt'
    if spell.get('dispels'):
        return 'dispel'
    if spell.get('tauntTicks') is not None:
        return 'taunt'
    if spell.get('damageReduction') is not None:
        return 'wall'
    if spell.get('manaRegenBuffDurationTicks'):
        return 'mana'
    if spell.get('school') == 'damage':
        melee = cls in MELEE
        if spell.get('type') == 'HOT':
            return 'dot'
        if spell.get('type') == 'AOE':
            return 'melee_aoe' if melee else 'magic_aoe'
        return 'melee' if melee else 'magic'
    if spell.get('shield') and not spell.get('healing'):
        return 'shield'
    if spell.get('type') == 'AOE':
        return 'heal_aoe'
    if spell.get('type') == 'HOT':
        return 'hot'
    return 'heal'


def pick(k, used):
    for pool in [k] + SPILL.get(k, []):
        for name in POOLS[pool]:
            if name not in used:
                return name
    raise SystemExit('no sound left for a %s spell' % k)


classes = os.path.join(CONTENT, 'classes')
for cls_dir in sorted(os.listdir(classes)):
    path = os.path.join(classes, cls_dir, 'spells.json')
    if not os.path.exists(path):
        continue
    meta = json.load(io.open(os.path.join(classes, cls_dir, 'class.json'), encoding='utf-8'))
    spells = json.load(io.open(path, encoding='utf-8'))
    order = meta['progression']['spellOrder'] + [s for s in spells if s not in meta['progression']['spellOrder']]
    used = set()
    for sid in order:
        if sid not in spells:
            continue
        sound = pick(kind(spells[sid], meta['id']), used)
        used.add(sound)
        spells[sid]['sound'] = sound
    io.open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(spells, indent=2, ensure_ascii=False) + '\n')
    print('%-12s %s' % (cls_dir, ', '.join('%s=%s' % (s, spells[s]['sound']) for s in order if s in spells)))

# Consumables: one sound for all of them.
for rel, key in (('data/shared_spells.json', None), ('data/stash.json', 'items')):
    path = os.path.join(CONTENT, *rel.split('/'))
    doc = json.load(io.open(path, encoding='utf-8'))
    for spell in (doc[key] if key else doc).values():
        spell['sound'] = 'potion'
    io.open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(doc, indent=2, ensure_ascii=False) + '\n')
print('consumables -> potion')
