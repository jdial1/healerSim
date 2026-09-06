"""Authors the four new Android-owned classes.

Two playable (Blood Death Knight, Assassination Rogue) and two locked
(Brewmaster Monk, Affliction Warlock), so every role has the same three-class
shape the healers already had.

The locked pair still get complete content: GameData.load iterates every
PlayerClass entry and parses each bundle, so a stub would fail the load rather
than degrade. They are locked by a flag in class.json, not by a level gate --
there is no goal to reach, they are simply not finished.

Trees are pure statBonus, like the Mage and Warrior: the engine reuses `healing`
as the damage magnitude, so healingBoost scales a Frostbolt or a Sinister Strike
exactly as it scales a Flash Heal. No hook code for any of them.
"""
import io, json, os

ROOT = r'C:\Users\justin.dial\Documents\GitHub\healerSim\android\content\classes'
TIERS = [1, 5, 9, 13, 17, 21, 25]

# Every icon here is checked by IconReferenceTest, which is how the Warrior's
# three broken references were found.
I = {
    "dmg": "wow/spell_holy_crusade",
    "crit": "wow/spell_holy_blessedresillience",
    "haste": "wow/spell_nature_swiftness",
    "mana": "wow/spell_holy_power",
    "tough": "wow/spell_holy_greaterblessingofsanctuary",
    "regen": "wow/spell_holy_sealofwisdom",
}


def talent(prefix, row, col, name, desc, maxp, bonus, icon, spell=None, pre=None):
    o = {
        "id": "%s_r%dc%d" % (prefix, row, col),
        "name": name, "description": desc, "maxPoints": maxp,
        "levelReq": TIERS[row], "cost": 1, "icon": I[icon],
        "gridX": col, "gridY": row,
        "prerequisites": pre or [], "exclusiveWith": [], "synergyWith": [],
        "maxRankBonusDescription": "", "statBonus": bonus, "points": 0,
    }
    if spell:
        o["spellId"] = spell
    return o


def tree(prefix, flavour, spells):
    """A 7-row tree in the shape every other class uses. `spells` are (row, col,
    talentName, spellId) unlocks."""
    t = [
        talent(prefix, 0, 0, flavour["t00"], "Increases power by 2% per rank.", 3, {"healingBoost": 2}, "dmg"),
        talent(prefix, 0, 2, flavour["t02"], "Increases critical strike chance by 1% per rank.", 3, {"critChance": 1}, "crit"),
        talent(prefix, 0, 4, flavour["t04"], "Increases maximum resource by 3% per rank.", 3, {"manaPool": 3}, "mana"),
        talent(prefix, 1, 1, flavour["t11"], "Increases power by 3% per rank.", 2, {"healingBoost": 3}, "dmg",
               pre=["%s_r0c0" % prefix]),
        talent(prefix, 1, 3, flavour["t13"], "Increases critical strike chance by 2% per rank.", 2, {"critChance": 2}, "crit",
               pre=["%s_r0c2" % prefix]),
        talent(prefix, 2, 0, flavour["t20"], "Increases haste by 3% per rank.", 2, {"haste": 3}, "haste"),
        talent(prefix, 2, 4, flavour["t24"], "Returns resource on each direct cast.", 3, {"manaReturnOnDirectHeal": 1}, "regen"),
        talent(prefix, 3, 3, flavour["t33"], "Increases critical strike chance by 3% per rank.", 2, {"critChance": 3}, "crit",
               pre=["%s_r1c3" % prefix]),
        talent(prefix, 4, 2, flavour["t42"], "Increases power by 5% per rank.", 2, {"healingBoost": 5}, "dmg",
               pre=["%s_r1c1" % prefix]),
        talent(prefix, 4, 4, flavour["t44"], "Increases toughness by 4% per rank.", 2, {"manaPool": 4}, "tough",
               pre=["%s_r3c3" % prefix]),
        talent(prefix, 5, 1, flavour["t51"], "Increases haste by 4% per rank.", 2, {"haste": 4}, "haste",
               pre=["%s_r2c0" % prefix]),
        talent(prefix, 5, 3, flavour["t53"], "Increases power by 6% per rank.", 2, {"healingBoost": 6}, "dmg",
               pre=["%s_r4c2" % prefix]),
        talent(prefix, 6, 2, flavour["t62"], "Increases power by 10%.", 1, {"healingBoost": 10}, "dmg",
               pre=["%s_r5c3" % prefix]),
    ]
    # Prerequisites must name a talent that actually exists. The rows are not
    # a full grid -- row 1 has columns 1 and 3, row 2 has 0 and 4 -- so the
    # previous row's column cannot be derived from this one. Passed explicitly.
    existing = {x["id"] for x in t}
    for row, col, nm, sid, pre in spells:
        pid = "%s_%s" % (prefix, pre)
        assert pid in existing, "%s prereq %s does not exist" % (sid, pid)
        t.append(talent(prefix, row, col, nm, "Unlocks %s." % nm, 1, {}, "dmg", spell=sid,
                        pre=[pid]))
    t.sort(key=lambda x: (x["gridY"], x["gridX"]))
    return t


def write(dirname, cls, spells, talents):
    d = os.path.join(ROOT, dirname)
    os.makedirs(d, exist_ok=True)
    for name, obj in (("class.json", cls), ("spells.json", spells), ("talents.json", talents)):
        io.open(os.path.join(d, name), 'w', encoding='utf-8', newline='\n').write(
            json.dumps(obj, indent=2) + "\n")
    print("wrote", dirname, "-", len(spells), "spells,", len(talents), "talents",
          "(locked)" if cls.get("locked") else "")


def meta(cid, name, role, desc, icon_key, colour, text, hover, portrait, passive, passive_desc,
         passive_icon, curves, starters, order, locked=False):
    return {
        "id": cid, "name": name, "role": role, "description": desc,
        "iconKey": icon_key, "color": colour, "textColor": text,
        "hoverBorderClass": hover, "locked": locked,
        "portraitUrl": "", "portraitIcon": portrait, "portraitGlow": "spell",
        "passiveTraitName": passive, "passiveTraitDescription": passive_desc,
        "passiveTraitIcon": passive_icon,
        "tutorial": {"passiveDescription": passive + ": " + passive_desc},
        "statCurves": curves,
        "progression": {"starterSpells": starters, "spellOrder": order},
    }


TANK_CURVES = {"baseIntellect": 18, "baseSpirit": 12, "intellectPerLevel": 2.0,
               "spiritPerLevel": 1.0, "baseUniqueStat": 12, "uniqueStatPerLevel": 0.8}
DPS_CURVES = {"baseIntellect": 32, "baseSpirit": 14, "intellectPerLevel": 3.8,
              "spiritPerLevel": 1.0, "baseUniqueStat": 9, "uniqueStatPerLevel": 0.6}

# --- Blood Death Knight: tank, playable ------------------------------------
write("deathknight",
      meta("DEATHKNIGHT", "Blood DK", "TANK",
           "Soaks what should have killed you and gives it back. Grim, and hard to move.",
           "skull", "bg-red-800", "text-red-300", "hover:border-red-500", "death_knight",
           "Blood Shield", "Damage you absorb hardens into a shield.",
           "wow/spell_holy_powerwordshield", TANK_CURVES,
           ["death_strike", "dark_command"],
           ["death_strike", "dark_command", "heart_strike", "icebound_fortitude"]),
      {
          "death_strike": {"id": "death_strike", "name": "Death Strike", "type": "DIRECT",
                           "school": "damage", "manaCost": 15, "healing": 62, "cooldown": 0,
                           "icon": "wow/spell_holy_crusade", "tags": [], "threatMultiplier": 3.0,
                           "color": "bg-red-500", "actionBarBorderClass": "border-red-500",
                           "glowType": "spell"},
          "dark_command": {"id": "dark_command", "name": "Dark Command", "type": "DIRECT",
                           "school": "utility", "manaCost": 8, "healing": 0, "cooldown": 80,
                           "tauntTicks": 60, "icon": "wow/spell_holy_avenginewrath", "tags": [],
                           "color": "bg-red-600", "actionBarBorderClass": "border-red-600",
                           "glowType": "spell"},
          "heart_strike": {"id": "heart_strike", "name": "Heart Strike", "type": "AOE",
                           "school": "damage", "manaCost": 20, "healing": 44, "cooldown": 40,
                           "icon": "wow/spell_holy_holynova", "tags": [], "threatMultiplier": 2.6,
                           "color": "bg-rose-500", "actionBarBorderClass": "border-rose-500",
                           "glowType": "spell"},
          "icebound_fortitude": {"id": "icebound_fortitude", "name": "Icebound Fortitude",
                                 "type": "DIRECT", "school": "utility", "manaCost": 22,
                                 "healing": 0, "cooldown": 300, "damageReduction": 0.4,
                                 "damageReductionTicks": 90,
                                 "icon": "wow/spell_holy_divineintervention", "tags": [],
                                 "color": "bg-sky-700", "actionBarBorderClass": "border-sky-700",
                                 "glowType": "spell"},
      },
      tree("dk", {"t00": "Bloodworms", "t02": "Might of the Frozen Wastes", "t04": "Rune Tap",
                  "t11": "Improved Death Strike", "t13": "Subversion", "t20": "Runic Focus",
                  "t24": "Scent of Blood", "t33": "Butchery", "t42": "Vendetta",
                  "t44": "Veteran of the Third War", "t51": "Bone Shield", "t53": "Crimson Scourge",
                  "t62": "Dancing Rune Weapon"},
           [(2, 2, "Heart Strike", "heart_strike", "r1c1"), (3, 1, "Icebound Fortitude", "icebound_fortitude", "r2c0")]))

# --- Assassination Rogue: dps, playable -------------------------------------
write("rogue",
      meta("ROGUE", "Assassin Rogue", "DPS",
           "Bleeds things to death from behind. Fragile, and entirely unbothered by that.",
           "dagger", "bg-yellow-600", "text-yellow-300", "hover:border-yellow-400", "rogue",
           "Seal Fate", "Critical strikes sharpen the wound that follows.",
           "wow/spell_holy_surgeoflight", DPS_CURVES,
           ["sinister_strike", "rupture"],
           ["sinister_strike", "rupture", "eviscerate", "fan_of_knives"]),
      {
          "sinister_strike": {"id": "sinister_strike", "name": "Sinister Strike", "type": "DIRECT",
                              "school": "damage", "manaCost": 14, "healing": 68, "cooldown": 0,
                              "icon": "wow/spell_holy_searinglightpriest", "tags": [],
                              "threatMultiplier": 0.9, "color": "bg-yellow-500",
                              "actionBarBorderClass": "border-yellow-500", "glowType": "spell"},
          "rupture": {"id": "rupture", "name": "Rupture", "type": "HOT", "school": "damage",
                      "manaCost": 24, "healing": 0, "cooldown": 70, "hotDuration": 80,
                      "hotHealingPerTick": 11, "icon": "wow/inv_misc_herb_felblossom", "tags": [],
                      "threatMultiplier": 0.85, "color": "bg-red-400",
                      "actionBarBorderClass": "border-red-400", "glowType": "spell"},
          "eviscerate": {"id": "eviscerate", "name": "Eviscerate", "type": "DIRECT",
                         "school": "damage", "manaCost": 26, "healing": 124, "cooldown": 50,
                         "icon": "wow/spell_holy_crusade", "tags": [], "threatMultiplier": 1.0,
                         "color": "bg-orange-500", "actionBarBorderClass": "border-orange-500",
                         "glowType": "spell"},
          "fan_of_knives": {"id": "fan_of_knives", "name": "Fan of Knives", "type": "AOE",
                            "school": "damage", "manaCost": 32, "healing": 58, "cooldown": 60,
                            "icon": "wow/spell_nature_wispsplode", "tags": [],
                            "threatMultiplier": 1.15, "color": "bg-lime-500",
                            "actionBarBorderClass": "border-lime-500", "glowType": "spell"},
      },
      tree("rg", {"t00": "Improved Poisons", "t02": "Malice", "t04": "Relentless Strikes",
                  "t11": "Lethality", "t13": "Puncturing Wounds", "t20": "Blade Flurry",
                  "t24": "Ruthlessness", "t33": "Cold Blood", "t42": "Murder",
                  "t44": "Endurance", "t51": "Adrenaline Rush", "t53": "Hunger for Blood",
                  "t62": "Mutilate"},
           [(2, 2, "Eviscerate", "eviscerate", "r1c1"), (3, 1, "Fan of Knives", "fan_of_knives", "r2c0")]))

# --- Brewmaster Monk: tank, locked ------------------------------------------
write("monk",
      meta("MONK", "Brewmaster", "TANK",
           "Staggers damage rather than avoiding it. Not finished yet.",
           "keg", "bg-emerald-700", "text-emerald-300", "hover:border-emerald-500", "monk",
           "Stagger", "Damage arrives late, and spread thin.",
           "wow/spell_holy_holyprotection", TANK_CURVES,
           ["keg_smash", "provoke"],
           ["keg_smash", "provoke", "breath_of_fire", "fortifying_brew"], locked=True),
      {
          "keg_smash": {"id": "keg_smash", "name": "Keg Smash", "type": "DIRECT",
                        "school": "damage", "manaCost": 15, "healing": 60, "cooldown": 0,
                        "icon": "wow/spell_holy_holybolt", "tags": [], "threatMultiplier": 3.0,
                        "color": "bg-emerald-500", "actionBarBorderClass": "border-emerald-500",
                        "glowType": "spell"},
          "provoke": {"id": "provoke", "name": "Provoke", "type": "DIRECT", "school": "utility",
                      "manaCost": 8, "healing": 0, "cooldown": 80, "tauntTicks": 60,
                      "icon": "wow/spell_holy_avenginewrath", "tags": [], "color": "bg-teal-600",
                      "actionBarBorderClass": "border-teal-600", "glowType": "spell"},
          "breath_of_fire": {"id": "breath_of_fire", "name": "Breath of Fire", "type": "AOE",
                             "school": "damage", "manaCost": 20, "healing": 42, "cooldown": 40,
                             "icon": "wow/spell_holy_holynova", "tags": [], "threatMultiplier": 2.6,
                             "color": "bg-orange-600", "actionBarBorderClass": "border-orange-600",
                             "glowType": "spell"},
          "fortifying_brew": {"id": "fortifying_brew", "name": "Fortifying Brew", "type": "DIRECT",
                              "school": "utility", "manaCost": 22, "healing": 0, "cooldown": 300,
                              "damageReduction": 0.45, "damageReductionTicks": 90,
                              "icon": "wow/spell_holy_divineintervention", "tags": [],
                              "color": "bg-emerald-800", "actionBarBorderClass": "border-emerald-800",
                              "glowType": "spell"},
      },
      tree("mk", {"t00": "Celestial Brew", "t02": "Elusive Brawler", "t04": "Gift of the Ox",
                  "t11": "Blackout Combo", "t13": "Special Delivery", "t20": "Rushing Jade Wind",
                  "t24": "Spirited Crane", "t33": "High Tolerance", "t42": "Bob and Weave",
                  "t44": "Healing Elixir", "t51": "Exploding Keg", "t53": "Shuffle",
                  "t62": "Zen Meditation"},
           [(2, 2, "Breath of Fire", "breath_of_fire", "r1c1"), (3, 1, "Fortifying Brew", "fortifying_brew", "r2c0")]))

# --- Affliction Warlock: dps, locked ----------------------------------------
write("warlock",
      meta("WARLOCK", "Affliction Lock", "DPS",
           "Stacks rot and waits. Not finished yet.",
           "skull", "bg-violet-700", "text-violet-300", "hover:border-violet-500", "warlock",
           "Nightfall", "Your rot occasionally blooms early.",
           "wow/spell_nature_wispsplode", DPS_CURVES,
           ["corruption", "shadow_bolt"],
           ["corruption", "shadow_bolt", "unstable_affliction", "seed_of_corruption"], locked=True),
      {
          "corruption": {"id": "corruption", "name": "Corruption", "type": "HOT",
                         "school": "damage", "manaCost": 22, "healing": 0, "cooldown": 50,
                         "hotDuration": 90, "hotHealingPerTick": 10,
                         "icon": "wow/inv_misc_herb_felblossom", "tags": [],
                         "threatMultiplier": 0.85, "color": "bg-violet-500",
                         "actionBarBorderClass": "border-violet-500", "glowType": "spell"},
          "shadow_bolt": {"id": "shadow_bolt", "name": "Shadow Bolt", "type": "DIRECT",
                          "school": "damage", "manaCost": 20, "healing": 96, "cooldown": 0,
                          "icon": "wow/spell_nature_lightning", "tags": [], "threatMultiplier": 0.9,
                          "color": "bg-purple-500", "actionBarBorderClass": "border-purple-500",
                          "glowType": "spell"},
          "unstable_affliction": {"id": "unstable_affliction", "name": "Unstable Affliction",
                                  "type": "HOT", "school": "damage", "manaCost": 28, "healing": 0,
                                  "cooldown": 70, "hotDuration": 70, "hotHealingPerTick": 14,
                                  "icon": "wow/spell_nature_wispheal", "tags": [],
                                  "threatMultiplier": 0.9, "color": "bg-fuchsia-500",
                                  "actionBarBorderClass": "border-fuchsia-500", "glowType": "spell"},
          "seed_of_corruption": {"id": "seed_of_corruption", "name": "Seed of Corruption",
                                 "type": "AOE", "school": "damage", "manaCost": 34, "healing": 60,
                                 "cooldown": 60, "icon": "wow/spell_nature_wispsplode", "tags": [],
                                 "threatMultiplier": 1.15, "color": "bg-indigo-500",
                                 "actionBarBorderClass": "border-indigo-500", "glowType": "spell"},
      },
      tree("wl", {"t00": "Improved Corruption", "t02": "Suppression", "t04": "Fel Concentration",
                  "t11": "Shadow Mastery", "t13": "Malediction", "t20": "Nightfall",
                  "t24": "Soul Siphon", "t33": "Death's Embrace", "t42": "Contagion",
                  "t44": "Fel Stamina", "t51": "Eradication", "t53": "Everlasting Affliction",
                  "t62": "Haunt"},
           [(2, 2, "Unstable Affliction", "unstable_affliction", "r1c1"),
            (3, 1, "Seed of Corruption", "seed_of_corruption", "r2c0")]))

print("done")
