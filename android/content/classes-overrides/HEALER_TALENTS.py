"""Android's own healer trees: the shared ones, with the filler given a job.

The healers' trees live in src/classes, which the frozen web app reads and the
parity corpus was recorded on, so they could not be touched. They are now laid
over here instead: GameData.load prefers classes-overrides/<cls>/talents.json,
and the parity fixture reads the shared file, so the recorded runs still play
the tree they were recorded on.

What this rewrites, and what it leaves alone:

  - Anything the engine reads by mechanic (Grace, Beacon, Illumination, the
    capstones) and anything that unlocks a spell is copied through untouched.
  - The three "chance to remove a curse" talents -- Absolve, Purify,
    Naturalize -- do nothing at all: no code has ever read them, and Cleanse
    has been a real spell since level 4. They become Cleanse upgrades.
  - Every other node was one of "Healing Focus I-V" or "X and Y Focus". Each
    now does one distinct thing: a plain stat (one node per stat), or a named
    spell's healing, cost or cooldown.
  - A tree with more filler than there are jobs drops the remainder, and
    anything that required a dropped node requires what it required.

    python android/content/classes-overrides/HEALER_TALENTS.py
"""
import io, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(HERE, '..', '..', '..', 'src', 'classes')

# The jobs each tree hands out, in order. A stat entry is (key, per-rank value);
# a spell entry is ("heal:<id>"/"cost:<id>"/"cooldown:<id>", per-rank value).
JOBS = {
    'priest': [
        ('healingBoost', 3, 'Healing Focus', 'Increases all healing by 3% per rank.'),
        ('critChance', 1.2, 'Critical Focus', 'Increases critical strike chance by 1.2% per rank.'),
        ('haste', 1.5, 'Renewal Rhythm', 'Increases haste by 1.5% per rank.'),
        ('manaPool', 25, 'Mana Focus', 'Increases maximum mana by 25 per rank.'),
        ('uniqueStat', 1.0, 'Inner Light', 'Increases your signature stat by 1 per rank.'),
        ('manaReturnOnDirectHeal', 1.2, 'Meditation', 'Returns 1.2 mana per rank on each direct heal.'),
        ('heal:flash_heal', 4, 'Improved Flash Heal', 'Flash Heal heals for 4% more per rank.'),
        ('heal:greater_heal', 5, 'Empowered Healing', 'Greater Heal heals for 5% more per rank.'),
        ('heal:circle_of_healing', 5, 'Wider Circle', 'Circle of Healing heals for 5% more per rank.'),
        ('cost:flash_heal', 2, 'Mental Agility', 'Flash Heal costs 2 less mana per rank.'),
        ('cost:greater_heal', 3, 'Improved Greater Heal', 'Greater Heal costs 3 less mana per rank.'),
        ('cost:circle_of_healing', 4, 'Divine Economy', 'Circle of Healing costs 4 less mana per rank.'),
        ('cooldown:greater_heal', 5, 'Swift Words', "Greater Heal's cooldown is 0.5 seconds shorter per rank."),
        ('cooldown:circle_of_healing', 10, 'Rapid Circle', "Circle of Healing's cooldown is 1 second shorter per rank."),
        ('cost:renew', 1, 'Improved Renew', 'Renew costs 1 less mana per rank.'),
        ('heal:renew', 6, 'Blessed Recovery', "Renew's opening heal is 6% stronger per rank."),
    ],
    'druid': [
        ('healingBoost', 3, 'Healing Focus', 'Increases all healing by 3% per rank.'),
        ('critChance', 1.2, 'Critical Focus', 'Increases critical strike chance by 1.2% per rank.'),
        ('haste', 1.5, 'Natural Swiftness', 'Increases haste by 1.5% per rank.'),
        ('manaPool', 20, 'Mana Focus', 'Increases maximum mana by 20 per rank.'),
        ('manaReturnOnDirectHeal', 1.2, 'Moonglow', 'Returns 1.2 mana per rank on each direct heal.'),
        ('heal:regrowth', 5, 'Improved Regrowth', 'Regrowth heals for 5% more per rank.'),
        ('heal:healing_touch', 5, 'Empowered Touch', 'Healing Touch heals for 5% more per rank.'),
        ('heal:swiftmend', 6, 'Improved Swiftmend', 'Swiftmend heals for 6% more per rank.'),
        ('heal:lifebloom', 5, 'Empowered Bloom', "Lifebloom's bloom is 5% stronger per rank."),
        ('heal:wild_growth', 5, 'Improved Wild Growth', 'Wild Growth heals for 5% more per rank.'),
        ('cost:regrowth', 2, 'Tranquil Spirit', 'Regrowth costs 2 less mana per rank.'),
        ('cost:healing_touch', 3, 'Improved Healing Touch', 'Healing Touch costs 3 less mana per rank.'),
        ('cost:wild_growth', 5, 'Efficient Growth', 'Wild Growth costs 5 less mana per rank.'),
        ('cost:rejuvenation', 1, 'Improved Rejuvenation', 'Rejuvenation costs 1 less mana per rank.'),
        ('cooldown:swiftmend', 15, 'Quick Mend', "Swiftmend's cooldown is 1.5 seconds shorter per rank."),
        ('cooldown:healing_touch', 5, 'Nature’s Haste', "Healing Touch's cooldown is 0.5 seconds shorter per rank."),
        ('cooldown:wild_growth', 10, 'Rampant Growth', "Wild Growth's cooldown is 1 second shorter per rank."),
        ('uniqueStat', 1.0, 'Heart of the Wild', 'Increases your signature stat by 1 per rank.'),
    ],
    'paladin': [
        ('healingBoost', 3, 'Healing Focus', 'Increases all healing by 3% per rank.'),
        ('critChance', 1.2, 'Critical Focus', 'Increases critical strike chance by 1.2% per rank.'),
        ('haste', 2, 'Haste Focus', 'Increases haste by 2% per rank.'),
        ('manaPool', 30, 'Judicator’s Precision', 'Increases maximum mana by 30 per rank.'),
        ('uniqueStat', 1.0, 'Conviction', 'Increases your signature stat by 1 per rank.'),
        ('manaReturnOnDirectHeal', 1.5, 'Illuminated Focus', 'Returns 1.5 mana per rank on each direct heal.'),
        ('heal:flash_heal', 4, 'Improved Flash of Light', 'Flash Heal heals for 4% more per rank.'),
        ('heal:holy_light', 5, 'Empowered Holy Light', 'Holy Light heals for 5% more per rank.'),
        ('heal:light_of_dawn', 5, 'Broader Dawn', 'Light of Dawn heals for 5% more per rank.'),
        ('cost:flash_heal', 2, 'Benediction', 'Flash Heal costs 2 less mana per rank.'),
        ('cost:holy_light', 3, 'Improved Holy Light', 'Holy Light costs 3 less mana per rank.'),
        ('cost:light_of_dawn', 4, 'Efficient Dawn', 'Light of Dawn costs 4 less mana per rank.'),
        ('cooldown:holy_light', 5, 'Swift Light', "Holy Light's cooldown is 0.5 seconds shorter per rank."),
        ('cooldown:light_of_dawn', 10, 'Rapid Dawn', "Light of Dawn's cooldown is 1 second shorter per rank."),
    ],
}

# The dead ones: no code has ever read them. They become the dispel's upgrades.
CLEANSE = {
    'priest': ('Purification', 'Cleanse costs 4 less mana per rank.', 'cost:cleanse', 4),
    'druid': ('Nature’s Cure', "Cleanse's cooldown is 1 second shorter per rank.", 'cooldown:cleanse', 10),
    'paladin': ('Sacred Cleansing', 'Cleanse costs 4 less mana per rank.', 'cost:cleanse', 4),
}
DEAD = {'absolve', 'purify', 'naturalize'}

STATS = {'healingBoost', 'critChance', 'haste', 'manaPool', 'uniqueStat', 'manaReturnOnDirectHeal'}


def rewrite(cls):
    src = os.path.join(SHARED, cls, 'talents.json')
    tree = json.load(io.open(src, encoding='utf-8'))
    jobs = list(JOBS[cls])
    out = []
    dropped = {}

    for t in tree:
        mech = t.get('mechanicId')
        if mech in DEAD:
            name, desc, key, value = CLEANSE[cls]
            t = dict(t)
            t.pop('mechanicId', None)
            t['name'] = name
            t['description'] = desc
            t['statBonus'] = None
            t['effects'] = {key: value}
            out.append(t)
            continue
        if mech or t.get('spellId'):
            out.append(t)
            continue
        if not jobs:
            dropped[t['id']] = t.get('prerequisites', [])
            continue
        key, value, name, desc = jobs.pop(0)
        t = dict(t)
        t['name'] = name
        t['description'] = desc
        if key in STATS:
            t['statBonus'] = {key: value}
            t.pop('effects', None)
        else:
            t['statBonus'] = None
            t['effects'] = {key: value}
        out.append(t)

    # Anything that needed a dropped node needs what that node needed.
    def resolve(ids, seen=()):
        fixed = []
        for i in ids:
            if i in dropped:
                if i in seen:
                    continue
                fixed += resolve(dropped[i], seen + (i,))
            else:
                fixed.append(i)
        return list(dict.fromkeys(fixed))

    for t in out:
        if t.get('prerequisites'):
            t['prerequisites'] = resolve(t['prerequisites'])

    dest = os.path.join(HERE, cls)
    os.makedirs(dest, exist_ok=True)
    io.open(os.path.join(dest, 'talents.json'), 'w', encoding='utf-8', newline='\n').write(
        json.dumps(out, indent=2, ensure_ascii=False) + '\n')
    print(f'{cls}: {len(out)} talents ({len(tree) - len(out)} dropped, {len(jobs)} jobs unused)')


if __name__ == '__main__':
    for cls in JOBS:
        rewrite(cls)
