"""What each tank and DPS talent does.

The generators (GENERATOR.py, mage/GENERATOR.py) built every tree from one
template: the same four stats at rising percentages, so half a tree was "+x%
power". This rewrites each talent's effect in place and keeps its id, icon,
grid position and max rank, so saved talent points still mean something.

Rules, checked below:
  - each tree keeps at most one talent per plain stat (power, crit, haste,
    resource, signature stat);
  - no two talents in a tree do the same thing;
  - every effect key is one the engine reads (Talent.effects, RoleHooks).

Run after either generator:  python TALENTS.py
"""
import io, json, os

ROOT = os.path.dirname(os.path.abspath(__file__))

# Stat talents: (description, statBonus). Effect talents: (description, effects).
def stat(desc, **bonus):
    return {"description": desc, "statBonus": bonus, "effects": {}}


def fx(desc, **effects):
    # Spell-scoped keys are written damage__frostbolt -> damage:frostbolt.
    return {"description": desc, "statBonus": {},
            "effects": {k.replace("__", ":"): v for k, v in effects.items()}}


TREES = {
    "mage": {
        "m_r0c0": fx("Frostbolt deals 5% more damage per rank.", damage__frostbolt=5),
        "m_r0c2": stat("Increases critical strike chance by 1% per rank.", critChance=1),
        "m_r0c4": stat("Increases maximum mana by 3% per rank.", manaPool=3),
        "m_r1c1": stat("Increases spell damage by 3% per rank.", healingBoost=3),
        "m_r1c3": fx("Frostbolt's chill lasts 1.5 seconds longer per rank.", chillTicks=15),
        "m_r2c0": stat("Increases haste by 3% per rank.", haste=3),
        "m_r2c4": fx("Frostbolt costs 2 less mana per rank.", cost__frostbolt=2),
        "m_r3c1": fx("Fireball deals 8% more damage per rank.", damage__fireball=8),
        "m_r3c3": fx("Shatter grants a further 8% critical strike chance per rank.", shatterCrit=8),
        "m_r4c2": fx("Deals 8% more damage per rank to an enemy below 35% health.", execute=8),
        "m_r4c4": fx("Arcane Missiles deals 10% more damage per rank.", damage__arcane_missiles=10),
        "m_r5c1": fx("Counterspell's cooldown is 3 seconds shorter per rank.", cooldown__counterspell=30),
        "m_r5c3": fx("Deals 6% more damage per rank to a chilled enemy.", chilledDamage=6),
        "m_r6c2": fx("Living Bomb deals 25% more damage, and its cooldown is 3 seconds shorter.",
                     damage__living_bomb=25, cooldown__living_bomb=30),
    },
    "warrior": {
        "w_r0c0": fx("Taking damage builds 10% more rage per rank.", rageFromDamage=10),
        "w_r0c2": stat("Increases Vengeance by 2 per rank: a higher rage cap and more threat.", uniqueStat=2),
        "w_r0c4": stat("Increases critical strike chance by 1% per rank.", critChance=1),
        "w_r1c1": fx("Shield Slam costs 5 less rage per rank.", cost__shield_slam=5),
        "w_r1c3": fx("Shield Wall's cooldown is 3 seconds shorter per rank.", cooldown__shield_wall=30),
        "w_r2c2": fx("Generates 6% more threat per rank.", threat=6),
        "w_r2c4": fx("Mana-paid attacks build 2 more rage per rank.", rageOnCast=2),
        "w_r3c3": fx("Taunt's cooldown is 1.5 seconds shorter per rank.", cooldown__taunt=15),
        "w_r4c0": stat("Increases damage by 5% per rank.", healingBoost=5),
        "w_r4c2": stat("Increases maximum mana by 5% per rank.", manaPool=5),
        "w_r4c4": stat("Increases haste by 4% per rank.", haste=4),
        "w_r5c1": fx("Revenge deals 10% more damage per rank.", damage__revenge=10),
        "w_r5c3": fx("Deals 8% more damage per rank to an enemy below 35% health.", execute=8),
        "w_r6c2": fx("Shield Slam deals 25% more damage.", damage__shield_slam=25),
    },
    "rogue": {
        "rg_r0c0": fx("Rupture deals 8% more damage per rank.", damage__rupture=8),
        "rg_r0c2": stat("Increases critical strike chance by 1% per rank.", critChance=1),
        "rg_r0c4": fx("Eviscerate refunds 5 energy per rank.", finisherRefund=5),
        "rg_r1c1": stat("Increases damage by 3% per rank.", healingBoost=3),
        "rg_r1c3": fx("Sinister Strike deals 8% more damage per rank.", damage__sinister_strike=8),
        "rg_r2c0": fx("Fan of Knives deals 10% more damage per rank.", damage__fan_of_knives=10),
        "rg_r2c4": fx("Sinister Strike costs 3 less energy per rank.", cost__sinister_strike=3),
        "rg_r3c3": fx("Each combo point adds 10% more to Eviscerate per rank.", finisherPerPoint=0.05),
        "rg_r4c2": fx("Deals 8% more damage per rank to an enemy below 35% health.", execute=8),
        "rg_r4c4": fx("Kick's cooldown is 3 seconds shorter per rank.", cooldown__kick=30),
        "rg_r5c1": fx("Energy refills 10% faster per rank.", energyRegen=10),
        "rg_r5c3": stat("Increases haste by 4% per rank.", haste=4),
        "rg_r6c2": fx("Eviscerate deals 15% more damage, and its cooldown is 2 seconds shorter.",
                      damage__eviscerate=15, cooldown__eviscerate=20),
    },
    "deathknight": {
        "dk_r0c0": fx("Blood Shield absorbs 10% more per rank.", bloodShield=10),
        "dk_r0c2": stat("Increases critical strike chance by 1% per rank.", critChance=1),
        "dk_r0c4": stat("Increases maximum mana by 3% per rank.", manaPool=3),
        "dk_r1c1": fx("Death Strike heals for a further 5% of recent damage per rank.", deathStrikeHeal=5),
        "dk_r1c3": fx("Generates 6% more threat per rank.", threat=6),
        "dk_r2c0": stat("Increases haste by 3% per rank.", haste=3),
        "dk_r2c4": fx("Death Strike costs 2 less mana per rank.", cost__death_strike=2),
        "dk_r3c3": fx("Heart Strike deals 10% more damage per rank.", damage__heart_strike=10),
        "dk_r4c2": stat("Increases damage by 5% per rank.", healingBoost=5),
        "dk_r4c4": stat("Increases Blood Shield rating by 2 per rank.", uniqueStat=2),
        "dk_r5c1": fx("Icebound Fortitude's cooldown is 5 seconds shorter per rank.", cooldown__icebound_fortitude=50),
        "dk_r5c3": fx("Heart Strike's cooldown is 1 second shorter per rank.", cooldown__heart_strike=10),
        "dk_r6c2": fx("Death Strike deals 25% more damage.", damage__death_strike=25),
    },
}

# Keys read outside the spell-scoped ones (RoleHooks.kt, CastPipeline.kt).
KEYS = {"execute", "threat", "chillTicks", "shatterCrit", "chilledDamage", "rageFromDamage",
        "rageOnCast", "finisherPerPoint", "finisherRefund", "energyRegen", "deathStrikeHeal",
        "bloodShield"}
SCOPED = {"damage", "cooldown", "cost"}


def main():
    for cls, rewrite in TREES.items():
        path = os.path.join(ROOT, cls, "talents.json")
        talents = json.load(io.open(path, encoding="utf-8"))
        ids = {t["id"] for t in talents}
        assert set(rewrite) <= ids, (cls, set(rewrite) - ids)
        # The Warrior's Devastate sits at r4c0; the generated trees have their
        # plain-power talent at r4c2. Either way every non-unlock talent is covered.
        missing = {t["id"] for t in talents if "spellId" not in t} - set(rewrite)
        assert not missing, (cls, missing)

        spells = set(json.load(io.open(os.path.join(ROOT, cls, "spells.json"), encoding="utf-8")))
        spells |= {x for x in json.load(io.open(os.path.join(ROOT, "..", "utility_spells.json"), encoding="utf-8"))["spells"]}
        seen = set()
        for new in rewrite.values():
            sig = tuple(sorted(new["statBonus"])) + tuple(sorted(new["effects"]))
            assert sig not in seen, (cls, "repeat", sig)
            seen.add(sig)
            for k in new["effects"]:
                kind, _, spell = k.partition(":")
                assert (kind in SCOPED and spell in spells) or k in KEYS, (cls, "unknown key", k)

        for t in talents:
            if t["id"] in rewrite:
                t.update(rewrite[t["id"]])
                if not t["effects"]:
                    del t["effects"]
        io.open(path, "w", encoding="utf-8", newline="\n").write(json.dumps(talents, indent=2) + "\n")
        print("rewrote", cls, len(rewrite), "talents")


if __name__ == "__main__":
    main()
