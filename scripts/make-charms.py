"""Forty-five charms: five a class, each one rewriting a rotation.

Every charm names a real spell of its class, and most carry a cost as well as a
gift -- a charm that is pure upside is one everybody equips and nobody thinks
about, which is the failure mode of every reward this game has had.

The five drop dungeons are the same for every class, spread across the tiers,
so each is a place you go for a reason.
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSES = os.path.join(ROOT, 'android', 'content', 'classes')
OUT = os.path.join(ROOT, 'android', 'content', 'data', 'charms.json')
ICONS = os.path.join(ROOT, 'public', 'icons', 'wow')

FROM = ['deadmines', 'scarlet_monastery', 'sunken_temple', 'stratholme', 'ubrs']

# cls -> five (name, icon, text, effects)
CHARMS = {
    'PRIEST': [
        ("Miner's Candle", "inv_misc_candle_01",
         "Flash Heal lands harder, and costs you for it.",
         {"heal:flash_heal": 18, "cost:flash_heal": -6}),
        ("Whitemane's Rosary", "inv_jewelry_necklace_20",
         "Greater Heal comes round sooner, and lands lighter.",
         {"cooldown:greater_heal": 25, "heal:greater_heal": -12}),
        ("Atal'ai Prayer Bead", "inv_misc_gem_pearl_03",
         "Renew ticks for far more, at a price.",
         {"heal:renew": 35, "cost:renew": -5}),
        ("Plaguebloom Locket", "inv_misc_herb_dreamfoil",
         "Circle of Healing on a short leash, if you can pay for it.",
         {"cooldown:circle_of_healing": 30, "cost:circle_of_healing": -12}),
        ("Drakkisath's Ember", "inv_misc_gem_flamespessarite_02",
         "A far heavier shield, far less often.",
         {"heal:power_word_shield": 40, "cooldown:power_word_shield": -25}),
    ],
    'DRUID': [
        ("Sprouting Acorn", "inv_misc_food_wheat_01",
         "Rejuvenation grows, and so does its cost.",
         {"heal:rejuvenation": 30, "cost:rejuvenation": -4}),
        ("Fang of the Grove", "inv_misc_monsterfang_01",
         "Swiftmend twice as often, for less each time.",
         {"cooldown:swiftmend": 60, "heal:swiftmend": -15}),
        ("Everliving Seed", "inv_misc_herb_sansamroot",
         "Lifebloom blooms bigger.",
         {"heal:lifebloom": 35, "cost:lifebloom": -4}),
        ("Bloom of Decay", "inv_misc_herb_nightmareseed",
         "Wild Growth on a shorter clock, at a heavier cost.",
         {"cooldown:wild_growth": 30, "cost:wild_growth": -14}),
        ("Heartwood Knot", "inv_misc_branch_01",
         "Healing Touch hits harder and comes slower.",
         {"heal:healing_touch": 25, "cooldown:healing_touch": -15}),
    ],
    'PALADIN': [
        ("Martyr's Nail", "inv_misc_bone_humanskull_01",
         "Flash Heal for more, and more mana.",
         {"heal:flash_heal": 20, "cost:flash_heal": -6}),
        ("Mograine's Sigil", "inv_jewelry_ring_16",
         "Holy Light at its heaviest, and its dearest.",
         {"heal:holy_light": 22, "cost:holy_light": -10}),
        ("Sanctified Ash", "inv_misc_ashenpigment",
         "Light of Dawn far more often, and far weaker.",
         {"cooldown:light_of_dawn": 35, "heal:light_of_dawn": -14}),
        ("Reliquary of the Dawn", "inv_box_01",
         "Holy Shock almost on demand, if your mana holds.",
         {"cooldown:holy_shock": 6, "cost:holy_shock": -8}),
        ("Dawnbreaker Shard", "inv_shield_09",
         "Lay on Hands twice a dungeon, for less.",
         {"cooldown:lay_on_hands": 300, "heal:lay_on_hands": -25}),
    ],
    'MAGE': [
        ("Cinder of the Deep", "inv_misc_gem_bloodstone_01",
         "Fireball burns hotter and costs more to throw.",
         {"damage:fireball": 15, "cost:fireball": -6}),
        ("Frostbitten Lens", "inv_misc_gem_sapphire_01",
         "The chill holds far longer; the bolt behind it is softer.",
         {"chillTicks": 12, "damage:frostbolt": -8}),
        ("Serpent's Prism", "inv_misc_gem_opal_01",
         "Arcane Missiles come round sooner, and cost for it.",
         {"cooldown:arcane_missiles": 25, "cost:arcane_missiles": -10}),
        ("Plague-Etched Rune", "inv_misc_rune_01",
         "Living Bomb far deadlier, and far rarer.",
         {"damage:living_bomb": 45, "cooldown:living_bomb": -30}),
        ("Ember of the Flamewaker", "spell_fire_moltenblood",
         "Blizzard on half the clock; each one lands lighter.",
         {"cooldown:blizzard": 45, "damage:blizzard": -12}),
    ],
    'ROGUE': [
        ("Defias Whetstone", "inv_stone_sharpeningstone_01",
         "Sinister Strike cuts deeper for more energy.",
         {"damage:sinister_strike": 16, "cost:sinister_strike": -5}),
        ("Scarlet Garrote Wire", "inv_misc_desecrated_leatherbelt",
         "Rupture bleeds harder, and waits longer.",
         {"damage:rupture": 30, "cooldown:rupture": -20}),
        ("Venom-Slick Vial", "inv_potion_24",
         "Energy floods back; your finisher lands softer.",
         {"energyRegen": 22, "damage:eviscerate": -10}),
        ("Baron's Signet", "inv_jewelry_ring_35",
         "Each combo point is worth far more.",
         {"finisherPerPoint": 14, "cost:eviscerate": -8}),
        ("Blackhand's Cinder", "inv_misc_ammo_bullet_02",
         "Fan of Knives twice as often, for less.",
         {"cooldown:fan_of_knives": 30, "damage:fan_of_knives": -14}),
    ],
    'WARLOCK': [
        ("Soul Splinter", "inv_misc_gem_amethyst_01",
         "Shadow Bolt for more, at a price in mana.",
         {"damage:shadow_bolt": 16, "cost:shadow_bolt": -6}),
        ("Scarlet Heretic's Chain", "inv_misc_rope_01",
         "Corruption festers harder and lingers on cooldown.",
         {"damage:corruption": 32, "cooldown:corruption": -18}),
        ("Atal'ai Hex Idol", "inv_misc_idol_03",
         "Unstable Affliction far more often, and weaker.",
         {"cooldown:unstable_affliction": 30, "damage:unstable_affliction": -12}),
        ("Necrotic Seed", "inv_misc_organ_04",
         "Seed of Corruption grows teeth, and a longer wait.",
         {"damage:seed_of_corruption": 28, "cooldown:seed_of_corruption": -20}),
        ("Emberheart of Blackrock", "inv_misc_gem_ruby_02",
         "Shadowburn all but doubles up, for a share of its bite.",
         {"cooldown:shadowburn": 35, "damage:shadowburn": -12}),
    ],
    'WARRIOR': [
        ("Vanguard's Whetstone", "inv_sword_04",
         "Shield Slam hits harder and asks more rage.",
         {"damage:shield_slam": 18, "cost:shield_slam": -5}),
        ("Mograine's Gauntlet", "inv_gauntlets_04",
         "Rage floods in off every hit; your threat suffers.",
         {"rageFromDamage": 25, "threat": -10}),
        ("Atal'ai Warplate Rivet", "inv_misc_enggizmos_01",
         "Shield Block far more often, and briefer for it.",
         {"cooldown:shield_block": 30, "cost:shield_block": -8}),
        ("Rivendare's Spur", "inv_misc_bone_skull_02",
         "Finish the wounded far faster.",
         {"execute": 35, "damage:heroic_strike": -10}),
        ("Wyrmthalak's Boss", "inv_shield_06",
         "Thunder Clap on a short clock; it lands lighter.",
         {"cooldown:thunder_clap": 25, "damage:thunder_clap": -12}),
    ],
    'DEATHKNIGHT': [
        ("Marrow Sliver", "inv_misc_bone_01",
         "Death Strike heals far more, and costs to land.",
         {"deathStrikeHeal": 20, "cost:death_strike": -6}),
        ("Scarlet Bindings", "inv_belt_16",
         "The shield off a Death Strike doubles down.",
         {"bloodShield": 25, "damage:death_strike": -8}),
        ("Sunken Reliquary", "inv_misc_urn_01",
         "Blood Boil far more often, for less each time.",
         {"cooldown:blood_boil": 25, "damage:blood_boil": -12}),
        ("Baron's Frost Rune", "inv_misc_rune_06",
         "Rune Tap nearly twice a fight.",
         {"cooldown:rune_tap": 50, "heal:rune_tap": -15}),
        ("Drakkisath's Bulwark", "inv_shield_11",
         "Vampiric Blood comes sooner, and asks more.",
         {"cooldown:vampiric_blood": 50, "cost:vampiric_blood": -10}),
    ],
    'MONK': [
        ("Brewer's Stone", "inv_drink_05",
         "Keg Smash lands heavier for the energy.",
         {"damage:keg_smash": 18, "cost:keg_smash": -5}),
        ("Scarlet Ember Brew", "inv_drink_17",
         "Breath of Fire far more often, and thinner.",
         {"cooldown:breath_of_fire": 18, "damage:breath_of_fire": -12}),
        ("Serpent's Draught", "inv_potion_19",
         "Purifying Brew on a short clock; you pay in chi.",
         {"cooldown:purifying_brew": 35, "cost:purifying_brew": -8}),
        ("Plaguebrewer's Tap", "inv_misc_bowl_01",
         "Expel Harm mends far more, and comes slower.",
         {"heal:expel_harm": 30, "cooldown:expel_harm": -20}),
        ("Firebrand Cask", "inv_misc_beer_02",
         "Spinning Crane Kick twice as often, for less.",
         {"cooldown:spinning_crane_kick": 25, "damage:spinning_crane_kick": -14}),
    ],
}

# --- write, validating as we go ----------------------------------------------
spells = {}
for cls in CHARMS:
    d = cls.lower()
    spells[cls] = json.load(io.open(os.path.join(CLASSES, d, 'spells.json'), encoding='utf-8'))

out = []
icons = {}
for cls, items in CHARMS.items():
    assert len(items) == 5, cls
    for i, (name, icon, text, effects) in enumerate(items):
        assert os.path.exists(os.path.join(ICONS, icon + '.png')), (cls, icon)
        assert icon not in icons, (icon, 'already used by', icons.get(icon))
        icons[icon] = name
        for key in effects:
            if ':' in key:
                kind, sid = key.split(':', 1)
                assert kind in ('cooldown', 'cost', 'damage', 'heal'), key
                assert sid in spells[cls], (cls, key, 'no such spell')
                if kind == 'cooldown':
                    assert spells[cls][sid]['cooldown'] > 0, (cls, key, 'spell has no cooldown')
                if kind == 'damage':
                    assert spells[cls][sid].get('school') == 'damage', (cls, key)
                if kind == 'heal':
                    assert spells[cls][sid].get('school', 'heal') == 'heal', (cls, key)
        cid = name.lower().replace("'", '').replace(' ', '_').replace('-', '_')
        out.append({
            "id": cid, "name": name, "cls": cls, "icon": "wow/" + icon,
            "text": text, "from": FROM[i], "effects": effects,
        })

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(out, indent=2, ensure_ascii=False) + '\n')
print('%d charms, %d icons, all unique' % (len(out), len(icons)))
for d in FROM:
    print('  %-18s %d charms' % (d, sum(1 for c in out if c['from'] == d)))
