"""The nine bosses that were a health bar with a name.

Each fight is built around one question the player has to answer, using only
parts the engine already has -- attacks with wind-ups and states, mechanic
debuffs, add waves of the nine kinds, and phases. Everything here is content:
run this and the fights change, no Kotlin involved.

    python scripts/make-bosses.py
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'android', 'content', 'data', 'encounters.json')
e = json.load(io.open(P, encoding='utf-8'))


def attack(aid, name, icon, dmg, targeting, tell, cast=25, kick=False, state=None, state_ticks=0):
    o = {"abilityId": aid, "name": name, "icon": icon, "damage": dmg, "targeting": targeting,
         "castTicks": cast, "interruptible": kick, "tell": tell}
    if state:
        o["grantsState"] = state
        o["stateTicks"] = state_ticks
    return o


def debuff(aid, name, icon, dur, dot, targeting="single_random", dispellable=True):
    return {"abilityId": aid, "name": name, "icon": icon, "durationTicks": dur,
            "damagePerTick": dot, "targeting": targeting, "dispellable": dispellable}


def add(kind, name, look, hp, **kw):
    o = {"kind": kind, "name": name, "looksLike": look, "health": hp}
    o.update(kw)
    return o


def phase(at, tell, attacks=(), debuffs=(), adds=(), replace=False):
    o = {"atHealth": at, "tell": tell}
    if attacks:
        o["attacks"] = list(attacks)
    if debuffs:
        o["debuffs"] = list(debuffs)
    if adds:
        o["adds"] = list(adds)
    if replace:
        o["replace"] = True
    return o


B = e['bosses']
M = e['mechanics']

# --- Shadowfang Keep: Archmage Arugal -- kick the caster, then find him ------------
# The question: can you stop a caster you can see coming? Void Bolt is his
# whole threat until he calls the pack, then he blinks away and rains shadow.
B['shadowfang_keep'] = {
    "extraAttacks": [attack(
        "arugal_explosion", "Arcane Explosion", "wow/spell_nature_wispsplode", 20, "all_living",
        "Arcane light builds around Arugal. Kick it!", cast=25, kick=True)],
    "adds": [{"atHealth": 0.6, "spawn": [
        add("add", "Wolf Guard", "Shadowfang Worgen", 0.07, damagePerTick=0.7),
        add("add", "Wolf Guard", "Shadowfang Worgen", 0.07, damagePerTick=0.7)]}],
    "phases": [phase(0.3, "Arugal blinks to the balcony: “You will never reach me!”",
                     attacks=[attack("arugal_thundershock", "Thundershock", "wow/spell_nature_lightningoverload",
                                     18, "all_living", "Arugal calls the storm down on everyone.", cast=20)])],
}

# --- Gnomeregan: Mekgineer Thermaplugg -- the room fills with bombs ---------------
# The question: what do you kill first? Walking bombs on a fuse, and the Mekgineer
# overclocking himself if you let him finish.
B['gnomeregan'] = dict(B.get('gnomeregan', {}), **{
    "extraAttacks": [attack(
        "therm_overclock", "Overclock", "wow/inv_misc_enggizmos_27", 0, "all_living",
        "Thermaplugg jams the throttle open. Kick it!", cast=25, kick=True, state="frenzy", state_ticks=90)],
    "adds": [
        {"atHealth": 0.75, "spawn": [add("bomb", "Walking Bomb", "Mecha-Tank", 0.04, blast=40)]},
        {"atHealth": 0.45, "spawn": [add("bomb", "Walking Bomb", "Mecha-Tank", 0.04, blast=40),
                                     add("bomb", "Walking Bomb", "Mecha-Tank", 0.04, blast=40)]}],
    "phases": [phase(0.25, "Thermaplugg vents the reactor: “Everything goes!”",
                     attacks=[attack("therm_steam", "Steam Blast", "wow/spell_nature_cyclone",
                                     40, "all_living", "Steam screams out of every pipe.", cast=20)])],
})

# --- Razorfen Downs: Amnennar the Coldbringer -- the cold that splits ------------
# The question: can you keep up with things that come apart? Frost Nova on the
# room, and frozen souls that shatter into more when broken.
B['razorfen_downs'] = dict(B.get('razorfen_downs', {}), **{
    "extraAttacks": [attack(
        "amnennar_wrath", "Amnennar's Wrath", "wow/spell_frost_frostnova", 70, "single_random",
        "Amnennar singles someone out for the cold. Kick it!", cast=25, kick=True)],
    "phases": [phase(0.5, "Amnennar raises his frozen guard.",
                     adds=[add("splitter", "Frozen Soul", "Coldbringer Ward", 0.08,
                               splitsInto=[add("add", "Frost Shard", "Coldbringer Ward", 0.03, damagePerTick=0.7),
                                           add("add", "Frost Shard", "Coldbringer Ward", 0.03, damagePerTick=0.7)])])],
})

# --- Zul'Farrak: Chief Ukorz Sandscalp -- the bodyguard, then the berserk ---------
# The question: two targets, one to burn. Ruuzlu hits like a truck; Ukorz goes
# berserk late and the tank has to live through it.
B['zul_farrak'] = dict(B.get('zul_farrak', {}), **{
    "extraAttacks": [attack(
        "ukorz_whirl", "Sandstorm Whirl", "wow/ability_whirlwind", 45, "all_living",
        "Ukorz spins his axe through the whole party.", cast=25)],
    "adds": [{"atHealth": 0.7, "spawn": [add("add", "Ruuzlu", "Sandfury Troll", 0.14, damagePerTick=2.0)]}],
    "phases": [phase(0.3, "Ukorz howls: “Zul'Farrak will not fall!”",
                     attacks=[attack("ukorz_berserk", "Berserk", "wow/ability_racial_bloodrage", 0, "all_living",
                                     "Ukorz works himself into a rage. Kick it!", kick=True,
                                     state="frenzy", state_ticks=120)])],
})

# --- Sunken Temple: Shade of Eranikus -- the dream eats the healer ---------------
# The question: can you pull a friend out of a nightmare while the dream feeds
# on the party? Leeches heal him through what they drain; a nightmare takes one
# of your own.
M['eranikus_nightmare'] = {"kind": "mind_control", "durationTicks": 100, "everyTicks": 20, "hitDamage": 20}
B['sunken_temple'] = dict(B.get('sunken_temple', {}), **{
    "extraDebuffs": [debuff("eranikus_nightmare", "Waking Nightmare", "wow/ability_xavius_dreamsimulacrum", 100, 0)],
    "adds": [{"atHealth": 0.6, "spawn": [
        add("leech", "Nightmare Suppressor", "Nightmare Wyrm", 0.07, damagePerTick=1.2),
        add("leech", "Nightmare Suppressor", "Nightmare Wyrm", 0.07, damagePerTick=1.2)]}],
    "phases": [phase(0.3, "Eranikus sheds his shade and breathes the dream across the room.",
                     attacks=[attack("eranikus_nightmare_blast", "Nightmare Blast", "wow/spell_nature_acid_01",
                                     55, "all_living", "The dream tears open around Eranikus.", cast=25)])],
})

# --- Blackrock Depths: Emperor Thaurissan -- kill the queen first ---------------
# The question the dungeon is famous for: the Emperor's wife heals him. Kill
# Moira or kick her mending, and survive his Hand while you do.
B['blackrock_depths'] = dict(B.get('blackrock_depths', {}), **{
    "extraAttacks": [attack(
        "thaurissan_shock", "Earth Shock", "wow/spell_fire_fireball02", 65, "single_random",
        "Thaurissan points at someone. Kick it!", cast=25, kick=True)],
    "adds": [{"atHealth": 0.75, "spawn": [
        add("mender", "Princess Moira Bronzebeard", "Shadowcaster", 0.12, healFraction=0.06)]}],
    "phases": [phase(0.3, "Thaurissan calls on the Firelord: “BURN!”",
                     attacks=[attack("thaurissan_nova", "Avatar of Flame", "wow/spell_fire_sealoffire",
                                     60, "all_living", "Fire rolls out from the throne.", cast=20)])],
})

# --- Lower Blackrock Spire: Overlord Wyrmthalak -- the reinforcements ------------
# The question: can the tank hold while the room fills? He calls two warlords
# at half, and once hurt he cleaves the tank for real.
B['lbrs'] = dict(B.get('lbrs', {}), **{
    "adds": [{"atHealth": 0.5, "spawn": [
        add("add", "Spirestone Warlord", "Ogre Warmonger", 0.1, damagePerTick=1.4),
        add("add", "Smolderthorn Berserker", "Blackrock Orc", 0.08, damagePerTick=1.2)]}],
    "phases": [phase(0.35, "Wyrmthalak roars for his guard and takes up the great axe.",
                     attacks=[attack("wyrmthalak_crush", "Crushing Blow", "wow/ability_warrior_cleave",
                                     140, "highest_threat", "Wyrmthalak winds up at the tank.", cast=25)])],
})

# --- Scholomance: Darkmaster Gandling -- shields and the curse -------------------
# The question: interrupt discipline under a curse that will not stop spreading.
# His Shadow Shield has to be kicked or nothing lands; the dead rise at half.
B['scholomance'] = {
    "extraAttacks": [attack(
        "gandling_shield", "Shadow Shield", "wow/spell_shadow_antishadow", 0, "all_living",
        "Gandling wraps himself in shadow. Kick it!", cast=25, kick=True, state="shield", state_ticks=60)],
    "extraDebuffs": [debuff("gandling_curse", "Curse of the Darkmaster", "wow/spell_shadow_curseofmannoroth",
                            60, 1.6, "single_random", True)],
    "adds": [{"atHealth": 0.5, "spawn": [
        add("add", "Risen Guardian", "Risen Guard", 0.07, damagePerTick=1.1),
        add("caster", "Risen Bonecaster", "Necromancer", 0.06, blast=45)]}],
    "phases": [phase(0.25, "Gandling opens the dark: “You will serve the Scourge!”",
                     debuffs=[debuff("scholo_haunt", "Shadow Portal", "wow/spell_shadow_sealofkings",
                                     120, 1.4, "single_random", True)])],
}

# --- Upper Blackrock Spire: General Drakkisath -- the elite guard -----------------
# The question: can you split damage between a dragon and his two best? The
# guard arrives early; his conflagration phase already exists and now has
# something to go with it.
B['ubrs'] = dict(B.get('ubrs', {}), **{
    "extraAttacks": [attack(
        "drakkisath_thunderclap", "Thunderclap", "wow/spell_fire_selfdestruct", 180, "highest_threat",
        "Drakkisath raises his halberd over the tank.", cast=25)],
    "adds": [{"atHealth": 0.8, "spawn": [
        add("add", "Chromatic Elite Guard", "Blackhand Elite", 0.09, damagePerTick=1.8),
        add("shielder", "Chromatic Elite Guard", "Chromatic Dragonkin", 0.09, wardFraction=0.3)]}],
})

e['note'] += " Bosses filled in by scripts/make-bosses.py." if 'make-bosses' not in e['note'] else ''
io.open(P, 'w', encoding='utf-8', newline='\n').write(json.dumps(e, indent=2, ensure_ascii=False) + '\n')

filled = ['shadowfang_keep', 'gnomeregan', 'razorfen_downs', 'zul_farrak', 'sunken_temple',
          'blackrock_depths', 'lbrs', 'scholomance', 'ubrs']
for d in filled:
    b = B[d]
    print('%-18s %s' % (d, {k: len(v) for k, v in b.items() if isinstance(v, list)}))
