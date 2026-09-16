"""Authors the Mage class content into android/content/classes/mage/.

Android-owned, not src/classes/: the frozen web app builds a static class
registry from that directory and validates class names on load, so a fourth
class there would break it.

The tree is deliberately built from `statBonus` rather than hook code. That
closed six-key set is nominally healing-flavoured, but the engine reuses
`healing` as the damage magnitude, so `healingBoost` scales a Frostbolt exactly
as it scales a Flash Heal. A whole DPS tree therefore needs no new engine code
-- which is the point of having done increments 1 and 2 first.
"""
import io, json, os

OUT = r'C:\Users\justin.dial\Documents\GitHub\healerSim\android\content\classes\mage'
os.makedirs(OUT, exist_ok=True)

def w(name, obj):
    p = os.path.join(OUT, name)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(obj, indent=2) + "\n")
    print('wrote', name, len(json.dumps(obj)), 'bytes')

# --- class -----------------------------------------------------------------
w('class.json', {
    "id": "MAGE",
    "name": "Frost Mage",
    "role": "DPS",
    "description": "Ranged burst and control. Big numbers, thin margins, and no one to blame.",
    "iconKey": "snowflake",
    "color": "bg-sky-500",
    "textColor": "text-sky-300",
    "hoverBorderClass": "hover:border-sky-400",
    "locked": False,
    "portraitUrl": "",
    "portraitIcon": "mage",
    "portraitGlow": "spell",
    "passiveTraitName": "Shatter",
    "passiveTraitDescription": "Frostbolt chills the enemy. Your next other spell against a chilled enemy is far more likely to crit.",
    "passiveTraitIcon": "wow/spell_nature_lightning",
    "tutorial": {"passiveDescription": "Shatter: Frost spells crit more."},
    "statCurves": {
        "baseIntellect": 34,
        "baseSpirit": 14,
        "intellectPerLevel": 4.0,
        "spiritPerLevel": 1.0,
        "baseUniqueStat": 9,
        "uniqueStatPerLevel": 0.6,
    },
    "progression": {
        "starterSpells": ["frostbolt", "fireball"],
        "spellOrder": ["frostbolt", "fireball", "arcane_missiles", "living_bomb"],
        # no capstone: the field defaults to "" in Kotlin
    },
})

# --- spells ----------------------------------------------------------------
# `healing` is the magnitude; school DAMAGE routes it at the enemy. HOT + DAMAGE
# is a DoT, which is why Living Bomb needs no new spell shape.
SPELLS = {
    "frostbolt": {
        "id": "frostbolt", "name": "Frostbolt", "type": "DIRECT", "school": "damage",
        "manaCost": 16, "healing": 74, "cooldown": 0,
        "icon": "wow/spell_frost_frostbolt02", "tags": [],
        "threatMultiplier": 0.9,
        "color": "bg-sky-400", "actionBarBorderClass": "border-sky-400", "glowType": "spell",
    },
    "fireball": {
        "id": "fireball", "name": "Fireball", "type": "DIRECT", "school": "damage",
        "manaCost": 24, "healing": 108, "cooldown": 0,
        "icon": "wow/spell_fire_flamebolt", "tags": [],
        "threatMultiplier": 1.0,
        "color": "bg-orange-400", "actionBarBorderClass": "border-orange-400", "glowType": "spell",
    },
    "arcane_missiles": {
        "id": "arcane_missiles", "name": "Arcane Missiles", "type": "AOE", "school": "damage",
        "manaCost": 34, "healing": 62, "cooldown": 60,
        "icon": "wow/spell_nature_starfall", "tags": [],
        "threatMultiplier": 1.15,
        "color": "bg-violet-400", "actionBarBorderClass": "border-violet-400", "glowType": "spell",
    },
    "living_bomb": {
        "id": "living_bomb", "name": "Living Bomb", "type": "HOT", "school": "damage",
        "manaCost": 28, "healing": 0, "cooldown": 80,
        "hotDuration": 60, "hotHealingPerTick": 9,
        "icon": "wow/ability_mage_livingbomb", "tags": [],
        "threatMultiplier": 0.85,
        "color": "bg-emerald-400", "actionBarBorderClass": "border-emerald-400", "glowType": "spell",
    },
}
w('spells.json', SPELLS)

# --- talents ---------------------------------------------------------------
# Seven rows, matching the levelReq tiers every other class uses.
TIERS = [1, 5, 9, 13, 17, 21, 25]
ICON = {
    "dmg": "wow/spell_holy_searinglightpriest",
    "crit": "wow/spell_holy_crusade",
    "haste": "wow/spell_nature_swiftness",
    "mana": "wow/spell_holy_power",
    "regen": "wow/spell_holy_sealofwisdom",
}

def t(row, col, name, desc, maxp, bonus, icon, spell=None, prereq=None, excl=None):
    d = {
        "id": "m_r%dc%d" % (row, col),
        "name": name,
        "description": desc,
        "maxPoints": maxp,
        "levelReq": TIERS[row],
        "cost": 1,
        # An unlock talent shows its spell's icon, as the healer trees do.
        "icon": SPELLS[spell]["icon"] if spell else ICON[icon],
        "gridX": col,
        "gridY": row,
        "prerequisites": prereq or [],
        "exclusiveWith": excl or [],
        "synergyWith": [],
        "maxRankBonusDescription": "",
        "statBonus": bonus,
        "points": 0,
    }
    if spell:
        d["spellId"] = spell
    return d

TAL = [
    t(0, 0, "Improved Frostbolt", "Increases spell damage by 2% per rank.", 3, {"healingBoost": 2}, "dmg"),
    t(0, 2, "Arcane Focus", "Increases critical strike chance by 1% per rank.", 3, {"critChance": 1}, "crit"),
    t(0, 4, "Frost Channeling", "Increases maximum mana by 3% per rank.", 3, {"manaPool": 3}, "mana"),

    t(1, 1, "Elemental Precision", "Increases spell damage by 3% per rank.", 2, {"healingBoost": 3}, "dmg",
      prereq=["m_r0c0"]),
    t(1, 3, "Piercing Ice", "Increases critical strike chance by 2% per rank.", 2, {"critChance": 2}, "crit",
      prereq=["m_r0c2"]),

    t(2, 0, "Icy Veins", "Increases haste by 3% per rank.", 2, {"haste": 3}, "haste"),
    t(2, 2, "Arcane Missiles", "Unlocks Arcane Missiles.", 1, {}, "dmg", spell="arcane_missiles",
      prereq=["m_r1c3"]),
    t(2, 4, "Arcane Meditation", "Returns mana on each direct cast.", 3, {"manaReturnOnDirectHeal": 1}, "regen"),

    t(3, 1, "Empowered Fireball", "Increases spell damage by 4% per rank.", 2, {"healingBoost": 4}, "dmg",
      prereq=["m_r1c1"]),
    t(3, 3, "Shatter", "Increases critical strike chance by 3% per rank.", 2, {"critChance": 3}, "crit",
      prereq=["m_r2c2"]),

    t(4, 0, "Living Bomb", "Unlocks Living Bomb.", 1, {}, "dmg", spell="living_bomb", prereq=["m_r2c0"]),
    t(4, 2, "Molten Fury", "Increases spell damage by 5% per rank.", 2, {"healingBoost": 5}, "dmg",
      prereq=["m_r3c1"], excl=["m_r4c4"]),
    t(4, 4, "Arcane Potency", "Increases critical strike chance by 4% per rank.", 2, {"critChance": 4}, "crit",
      prereq=["m_r3c3"], excl=["m_r4c2"]),

    t(5, 1, "Netherwind Presence", "Increases haste by 4% per rank.", 2, {"haste": 4}, "haste",
      prereq=["m_r2c0"]),
    t(5, 3, "Torment the Weak", "Increases spell damage by 6% per rank.", 2, {"healingBoost": 6}, "dmg",
      prereq=["m_r4c2"]),

    t(6, 2, "Arcane Power", "Increases spell damage by 10%.", 1, {"healingBoost": 10}, "dmg",
      prereq=["m_r5c3"]),
]
w('talents.json', TAL)
print('talents:', len(TAL), 'rows:', sorted({x["gridY"] for x in TAL}))
