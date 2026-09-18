# Tuning map

Every gameplay number lives in these files. Edit, rebuild, done: no Kotlin.

| Knob | File | Key |
|---|---|---|
| Threat: heal threat, crit heal threat, tank multiplier, overtake, AI taunt | balance.json | `threat` |
| AI healer mana, regen, heal size; AI damage shares | balance.json | `roles` |
| Class damage scale, ramp, mana pool; rage/energy/combo/chill | balance.json | `classes` |
| Rule numbers (tank idle window, mana potions per run, execute, talent procs) | balance.json | `rules` |
| Global cooldown, crit, stats, XP, level gap, boss, trash, endless | balance.json | `combat`, `playerStats`, `xp`, `boss`, `trash`, `endless`, `partyDps` |
| Unheld-target damage, healer-run reliefs, unkicked/frenzy damage, AI kick and dispel timing, group XP | encounters.json | top level |
| Add damage and healer share | encounters.json | `addRules` |
| Hard mode (health, damage, XP, enrage, keystoneStep) | encounters.json | `hard` |
| Affixes and their multipliers | encounters.json | `affixes` |
| Bosses, attacks, phases, adds | encounters.json | `bosses`, `mechanics` |
| Pace, breather length | pacing.json | |
| Charms | charms.json | |
| Consumables and drops | stash.json, consumables.json | |
| Spells and talents, per class | ../classes/*/ | spells.json, talents.json |
