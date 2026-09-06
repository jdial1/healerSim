<div align="center">
<img alt="Overheal gameplay banner" src="https://i.imgur.com/0z2tbTQ.png" style="width: 100%; height: auto;" />
</div>

# Overheal

Mobile-first healing simulator. Pick a class, tune spells, and heal your party
through dungeons.

## Repository status

This repository holds two builds of the game, and they are no longer on the same
road.

| | Path | Status |
|---|---|---|
| **Web** | `src/`, `public/` | **Frozen. Complete, healer-only.** |
| **Android** | `android/` | **Active.** Grows into the full role-based game. |

### The web app is frozen

It is finished as a healer game and is not receiving new features. Treat
`src/`, `src/data/` and `src/classes/` as read-only apart from bug fixes.

Two things depend on that, so breaking the freeze breaks them:

- **`parity/golden.json` is the regression guard for the Android engine.** The
  goldens were generated from the JS engine, and `android/.../ParityTest.kt`
  asserts the Kotlin engine still agrees with them. The web source is the
  reference implementation of healer behaviour; if it moves, the reference moves.
- **The Android build syncs content out of `src/`.** The `syncGameData` Gradle
  task (`android/app/build.gradle.kts`) copies `src/data/*.json` and
  `src/classes/*/` into Android assets, which is what guarantees the content
  Android runs is byte-identical to what the goldens were generated from.

**New tank/DPS class content must not go in `src/classes/`.** The web app builds
a static class registry from that directory and validates class names in
`src/gameStorage.js`, so a fourth class there would break the frozen app. New
classes belong in an Android-owned assets path, merged at load.

### The Android app is where development continues

It is no longer a healer game. Nine classes, three per role:

| Role | Classes |
|---|---|
| Healer | Holy Priest, Resto Druid, Holy Paladin *(unlocks at 25)* |
| DPS | Frost Mage, Assassin Rogue, Affliction Lock *(not built)* |
| Tank | Prot Warrior, Blood DK, Brewmaster *(not built)* |

Two kinds of unavailable, and the cards say which: the Paladin is finished and
gated on a level, the other two are simply unbuilt, so their cards promise no
level to reach.

Built on a threat model, real player damage, active mitigation, and an AI healer
that keeps the party up when you are not the one doing it. Co-op is deliberately
deferred, but the engine is kept as a pure `(state, action, rng) -> state`
reducer with serializable, actor-tagged actions so it stays possible without a
rewrite.

**How the healer game stayed frozen while all that was added.** Two gates, both
run in CI:

- `npm run test:golden` regenerates `parity/golden.json` twice and requires both
  runs to equal the committed bytes. Byte equality, not an epsilon.
- `npm run test:balance` hashes every `balance.json` key except the role blocks,
  so healer tuning cannot move under cover of role work.

**The cross-engine *tick* contract has ended, deliberately.** Adding a global
cooldown — which applies to every class, healers included — changed the Android
tick, and the web app is frozen as the healer game it shipped as. The two
engines now genuinely disagree about the tick, so `TickParityTest` compares
against `android/app/src/test/resources/tick-snapshots.json`, recorded from the
Kotlin engine and committed, rather than against the JS engine's numbers.
Regenerating `golden.json` from Kotlin instead would have turned the reference
into a copy of the thing it checks.

Regenerate those snapshots deliberately, never silently:

```
./gradlew :app:testDebugUnitTest -Daegis.regenerateTickSnapshots=true
```

The other twelve golden sections — stats, spell ranks, xp curves, rng streams —
are unaffected by the GCD and are still checked against the JS engine.

Measured cost of the GCD on the recorded healer scenarios: no change at all to
three of them, and -4.3% effective healing on the fourth, which is the only one
whose rotation casts faster than the cooldown.

Two design choices do the actual work. Enemy damage is
`scripted * aiShare + playerDamage`, and `aiShareWhenHealer` is exactly `1.0`,
so with the player healing the expression is an exact IEEE identity rather than
an approximation. And threat targeting is switched on by the player's *role*
rather than by dungeon content -- opting a dungeon in via JSON would change how
the boss picks victims for a healer too, removing an rng draw and desynchronising
every recorded scenario.

New classes live in `android/content/classes/`, never `src/classes/`: the frozen
web app builds a static registry from that directory and validates class names,
so a fourth class there would break it.

See `android/README.md` and `android/RELEASE.md`.

## Game features

- Class-based healing gameplay with distinct Priest, Druid, and Paladin identity.
- Talent progression and stat scaling that shape mana economy, throughput, and utility.
- Real-time party triage across health bars, buffs, debuffs, and incoming damage pressure.
- Action bar spell management with cooldown, mana, and cast-flow decision making.
- Dungeon run pacing that rewards efficient healing rotations and resource planning.
- Mobile-first UI with responsive layouts tuned for quick, readable combat decisions.

## Run locally

**Prerequisites:** Node.js

1. `npm install`
2. Optional: copy `.env.example` to `.env.local` and set `APP_URL` if you need a fixed public URL.
3. `npm run dev`
