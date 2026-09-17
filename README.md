<div align="center">
<img alt="Overheal gameplay banner" src="https://i.imgur.com/0z2tbTQ.png" style="width: 100%; height: auto;" />
</div>

# Overheal

Mobile-first dungeon game. Pick one of nine classes across three roles, spend
talents, and keep a party alive — or hold the boss, or kill it.

This repository is the Android app. It began as a port of a React healer sim,
and for a long time the web app was kept frozen beside it as a reference the
Kotlin engine was checked against. That has ended: the web app was never
shipping again, and keeping it meant every engine change had to be proved not
to disturb a recorded corpus of its output. It is deleted, along with the
parity harness, the balance lock and the content seams that existed only to
work around it. It is all in the history if it is ever wanted back.

| Path | What |
|---|---|
| `android/` | The game. Kotlin, Compose, one Gradle module. |
| `android/content/` | **Every piece of game content**, in one tree. |
| `public/icons/` | Artwork the build packages into the APK. |
| `public/privacy.html` | The privacy policy Play links to. Published via Pages. |
| `firebase/` | Firestore rules and their tests. |
| `scripts/` | Icon tooling and the playtest harness. |

## The classes

| Role | Classes |
|---|---|
| Healer | Holy Priest, Resto Druid, Holy Paladin *(unlocks at 25)* |
| DPS | Frost Mage, Assassin Rogue, Affliction Lock *(not built)* |
| Tank | Prot Warrior, Blood DK, Brewmaster *(not built)* |

Two kinds of unavailable, and the cards say which: the Paladin is finished and
gated on a level, the other two are simply unbuilt, so their cards promise no
level to reach.

Built on a threat model, real player damage, active mitigation, and an AI party
that covers whatever seats a person is not in. Co-op is deferred, but the
engine is a pure `(state, action, rng) -> state` reducer with serializable,
actor-tagged actions, so it stays possible without a rewrite.

## Content lives in one place

Everything the game is made of is JSON under `android/content/`, copied into
assets by the `syncGameData` Gradle task:

| | |
|---|---|
| `content/data/*.json` | balance, dungeons, encounters, auras, mechanics, pacing |
| `content/classes/<class>/` | `class.json`, `spells.json`, `talents.json` |

`content/classes/TALENTS.py` and `GENERATOR.py` write the trees; they are run by
hand, not by the build.

## Building

```
cd android && ./gradlew :app:assembleDebug
```

`./gradlew :app:testDebugUnitTest` runs the suite (~290 tests). Node is needed
only for the icon scripts, and they have no dependencies — there is nothing to
`npm install`.

See `android/README.md` and `android/RELEASE.md`.
