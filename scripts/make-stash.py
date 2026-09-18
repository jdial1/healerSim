"""Twenty consumables any class can carry, and what each mode drops.

Each is a spell tagged `consumable`, built only from fields a spell already
has -- healing, damage, shield, wall, mana -- so none needs code of its own.
They rank with level the way class spells do, so a potion found at 12 is still
worth drinking at 50.

Modes lean: fast drops offence, normal drops sustain, slow drops defence, hard
drops the rare ones. Wanting flasks is a reason to play slow.
"""
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'android', 'content', 'data', 'stash.json')
ICONS = os.path.join(ROOT, 'public', 'icons', 'wow')

ONCE = 0  # one use per run is enforced by carriedUsed, not a cooldown


def item(sid, name, icon, *, school='heal', type='DIRECT', healing=0.0, shield=0.0, shieldTicks=None,
         wall=None, wallTicks=None, mana=None, hot=None, hotTick=None, threat=1.0):
    o = {"id": sid, "name": name, "type": type, "school": school, "manaCost": 0,
         "healing": healing, "cooldown": ONCE, "icon": "wow/" + icon, "tags": ["consumable"]}
    if shield:
        o["shield"] = shield
        if shieldTicks:
            o["shieldTicks"] = shieldTicks
    if wall is not None:
        o["damageReduction"] = wall
        o["damageReductionTicks"] = wallTicks
    if mana:
        o["manaRegenBuffDurationTicks"] = mana
    if hot is not None:
        o["hotDuration"] = hot
        o["hotHealingPerTick"] = hotTick
    if threat != 1.0:
        o["threatMultiplier"] = threat
    return o


ITEMS = [
    # --- offence: fast runs ------------------------------------------------------
    item("goblin_fire_bomb", "Goblin Fire Bomb", "inv_misc_bomb_02",
         school='damage', healing=150.0),
    item("frost_grenade", "Frost Grenade", "inv_misc_bomb_03",
         school='damage', type='AOE', healing=85.0),
    item("holy_water", "Stratholme Holy Water", "inv_potion_08",
         school='damage', type='AOE', healing=100.0),
    item("thorium_grenade", "Thorium Grenade", "inv_misc_bomb_08",
         school='damage', healing=190.0, threat=0.5),
    item("oil_of_immolation", "Oil of Immolation", "inv_potion_11",
         school='damage', type='HOT', hot=80, hotTick=6.0),
    # --- sustain: normal runs ----------------------------------------------------
    item("healing_potion", "Healing Potion", "inv_potion_51",
         healing=220.0),
    item("trolls_blood", "Troll's Blood Potion", "inv_potion_36",
         type='HOT', hot=120, hotTick=4.0),
    item("elixir_of_wisdom", "Elixir of Wisdom", "inv_potion_29",
         school='utility', mana=140),
    item("whipper_root", "Whipper Root Tuber", "inv_misc_food_55",
         healing=170.0),
    item("rejuvenation_potion", "Rejuvenation Potion", "inv_potion_47",
         healing=150.0, mana=80),
    # --- defence: slow runs ------------------------------------------------------
    item("flask_of_stoneskin", "Flask of Stoneskin", "inv_potion_48",
         school='utility', wall=0.2, wallTicks=160),
    item("elixir_of_fortitude", "Elixir of Fortitude", "inv_potion_43",
         shield=220.0, shieldTicks=250),
    item("greater_stoneshield", "Greater Stoneshield Potion", "inv_potion_69",
         school='utility', wall=0.35, wallTicks=70),
    item("draught_of_the_warden", "Draught of the Warden", "inv_potion_41",
         shield=320.0, shieldTicks=160),
    item("scroll_of_protection", "Scroll of Protection", "inv_scroll_07",
         school='utility', wall=0.15, wallTicks=260),
    # --- rare: hard runs ---------------------------------------------------------
    item("flask_of_the_titans", "Flask of the Titans", "inv_potion_62",
         shield=520.0, shieldTicks=300),
    item("dragonbreath_chili", "Dragonbreath Chili", "inv_drink_17_rare_icon" if False else "inv_misc_food_49",
         school='damage', type='AOE', healing=180.0),
    item("major_rejuvenation", "Major Rejuvenation Potion", "inv_potion_128",
         healing=420.0, mana=120),
    item("invulnerability_potion", "Limited Invulnerability Potion", "inv_potion_62_gold" if False else "inv_potion_121",
         school='utility', wall=0.6, wallTicks=40),
    item("scroll_of_vengeance", "Scroll of Vengeance", "inv_scroll_03",
         school='damage', healing=260.0, threat=2.0),
]

DROPS = {
    "fast": ["goblin_fire_bomb", "frost_grenade", "holy_water", "thorium_grenade", "oil_of_immolation"],
    "normal": ["healing_potion", "trolls_blood", "elixir_of_wisdom", "whipper_root", "rejuvenation_potion"],
    "slow": ["flask_of_stoneskin", "elixir_of_fortitude", "greater_stoneshield", "draught_of_the_warden",
             "scroll_of_protection"],
    "hard": ["flask_of_the_titans", "dragonbreath_chili", "major_rejuvenation", "invulnerability_potion",
             "scroll_of_vengeance"],
}

# --- validate ------------------------------------------------------------------
# Everything already wearing an icon: spells, talents, charms, the mana potion.
taken = {}
content = os.path.join(ROOT, 'android', 'content')
for dirpath, _, files in os.walk(content):
    for f in files:
        if not f.endswith('.json') or f == 'stash.json':
            continue
        def walk(node, where):
            if isinstance(node, dict):
                icon = node.get('icon')
                if isinstance(icon, str) and icon.startswith('wow/'):
                    taken.setdefault(icon, where)
                for v in node.values():
                    walk(v, where)
            elif isinstance(node, list):
                for v in node:
                    walk(v, where)
        walk(json.load(io.open(os.path.join(dirpath, f), encoding='utf-8')), f)

ids = [i['id'] for i in ITEMS]
assert len(ids) == 20 and len(set(ids)) == 20, ids
seen = set()
for i in ITEMS:
    icon = i['icon']
    assert os.path.exists(os.path.join(ICONS, icon[4:] + '.png')), (i['id'], icon, 'missing')
    assert icon not in seen, (i['id'], icon, 'repeat')
    assert icon not in taken, (i['id'], icon, 'already used in', taken.get(icon))
    seen.add(icon)
for mode, pool in DROPS.items():
    assert all(x in ids for x in pool), mode
assert set(sum(DROPS.values(), [])) == set(ids), 'every item drops somewhere'

io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(
    {"items": {i['id']: i for i in ITEMS}, "drops": DROPS}, indent=2, ensure_ascii=False) + '\n')
print('20 items, all icons present, unique and unshared')
