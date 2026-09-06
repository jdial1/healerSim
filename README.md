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

Planned: playable tank and DPS roles alongside the existing three healer classes,
each with their own kit and talent tree, a threat model, real player damage, and
role-specific combat frames. Co-op is deliberately deferred, but the engine is
kept as a pure `(state, action, rng) -> state` reducer with serializable actions
so it stays possible without a rewrite.

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
