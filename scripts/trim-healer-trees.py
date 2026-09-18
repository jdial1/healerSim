"""Priest and Druid down to sixteen talents each, like every other class.

They carried thirty-two -- double the rest -- against seven or eight spells,
and about half were one-number tweaks to one spell (+5% Renew, -2 mana on
Flash Heal, -1s on Swiftmend). Charms do that job now, as a choice with a
cost, so those nodes go. What stays is what makes the class play the way it
does: every talent that unlocks a spell, the mechanics, the Cleanse node, the
capstone, and one node for each core stat. The stat nodes take more ranks so
the tree still has ~31 points to spend, as the others do.

Ids are kept, so a save's ranks in a surviving node carry over; points in a
removed node are simply refunded (talentPoints counts only nodes that exist).

    python scripts/trim-healer-trees.py
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSES = os.path.join(ROOT, 'android', 'content', 'classes')
WIDTH = 5  # columns a tree is laid across

# id -> new maxPoints (None keeps it)
KEEP = {
    'priest': {
        # a node per core stat, deeper than before
        'p_r0c0': 5,     # Healing Focus
        'p_r0c1': 4,     # Critical Focus
        'p_r0c3': 4,     # Mana Focus
        # the mechanics that make a Priest a Priest
        'p_r0c4': None,  # Meditative Wellspring
        'p_r1c4': None,  # Path of the Sun  } one or the other
        'p_r2c4': None,  # Path of the Moon }
        'p_r2c1': 3,     # Aegis of Faith (Divine Aegis)
        'p_r2c3': None,  # Harsh Confession (Surge of Light)
        'p_r3c1': None,  # Binding Tether
        'p_r4c1': None,  # Power Infusion
        'p_r4c2': None,  # Spirit of Redemption
        'p_r4c4': None,  # Grace
        'p_cap': None,   # Archangel
        # spells a talent teaches
        'p_r1c2': None,  # Greater Heal
        'p_r3c2': None,  # Circle of Healing
        # the dispel
        'p_r3c5': None,  # Purification (Cleanse)
    },
    'druid': {
        'd_r0c0': 5,     # Healing Focus
        'd_r0c1': 4,     # Critical Focus
        'd_r0c3': 4,     # Mana Focus
        'd_r0c4': 3,     # Verdant Reservoir
        'd_r1c4': None,  # Cultivation   } one or the other
        'd_r2c4': None,  # Deep Roots    }
        'd_r2c1': None,  # Living Seed
        'd_r3c1': None,  # Natural Perfection
        'd_r3c3': 3,     # Mastery: Harmony
        'd_r4c2': None,  # Tree of Life
        'd_cap': None,   # Nature's Grace
        'd_r1c2': None,  # Healing Touch
        'd_r2c2': None,  # Swiftmend
        'd_r3c2': None,  # Wild Growth
        'd_r3c4': None,  # Lifebloom
        'd_r3c5': None,  # Nature's Cure (Cleanse)
    },
}

for cls, keep in KEEP.items():
    path = os.path.join(CLASSES, cls, 'talents.json')
    tree = json.load(io.open(path, encoding='utf-8'))
    ids = {t['id'] for t in tree}
    missing = set(keep) - ids
    assert not missing, (cls, missing)
    by_id = {t['id']: dict(t) for t in tree}
    kept = [t for t in tree if t['id'] in keep]
    for t in kept:
        if keep[t['id']] is not None:
            t['maxPoints'] = keep[t['id']]
        # A partner or prerequisite that was cut would leave a dangling
        # reference. A prerequisite is followed back through anything removed
        # to the nearest surviving ancestor, so a gated node stays gated by
        # something that still exists rather than silently becoming free.
        if t.get('exclusiveWith'):
            t['exclusiveWith'] = [x for x in t['exclusiveWith'] if x in keep]
        if t.get('prerequisites'):
            resolved = []
            for pre in t['prerequisites']:
                seen = set()
                while pre is not None and pre not in keep and pre not in seen:
                    seen.add(pre)
                    parents = by_id.get(pre, {}).get('prerequisites') or []
                    pre = parents[0] if parents else None
                if pre is not None and pre in keep and pre not in resolved:
                    resolved.append(pre)
            t['prerequisites'] = resolved
    # Re-lay each level tier as its own row, centred, so the tree has no holes
    # where nodes used to be.
    tiers = sorted({t['levelReq'] for t in kept})
    for row, level in enumerate(tiers):
        here = sorted([t for t in kept if t['levelReq'] == level], key=lambda t: (t['gridY'], t['gridX']))
        start = max(0, (WIDTH - len(here)) // 2)
        for i, t in enumerate(here):
            t['gridY'] = row
            t['gridX'] = start + i
    io.open(path, 'w', encoding='utf-8', newline='\n').write(json.dumps(kept, indent=2, ensure_ascii=False) + '\n')
    ranks = sum(t['maxPoints'] * t.get('cost', 1) for t in kept)
    print('%-7s %d -> %d nodes, %d ranks, rows %s' % (
        cls, len(tree), len(kept), ranks,
        [(lv, sum(1 for t in kept if t['levelReq'] == lv)) for lv in tiers]))
