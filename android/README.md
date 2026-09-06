# Aegis — Android

Native Kotlin/Compose port of the web app in the repository root.

## Content is not duplicated

All game content (dungeons, spells, talents, balance constants) is read from the
web app's JSON at build time by the `syncGameData` task in `app/build.gradle.kts`,
which copies into `app/build/generated/gameAssets`:

| From (repo root) | To (assets) |
|---|---|
| `src/data/*.json` | `data/` |
| `src/classes/*/{class,spells,talents}.json` | `classes/` |
| `public/icons/**` | `icons/` |

Editing `src/data/balance.json` therefore retunes **both** apps. Everything the
sync copies is tracked, so no setup step is needed — the Android build does not
require Node. To pull fresh artwork from upstream, run `npm run icons:refresh`
deliberately and review the diff; it is not wired into any build, so a release
binary never depends on a CDN.

## The player is a map, not a field

`GameState` used to carry the player's class, level, talents, mana, cooldowns,
buffs and pending-damage accumulators directly, which asserted that exactly one
player exists. Those fields live on `Participant` now, keyed by party unit id,
and **single player is a map of one** — there is no separate solo path, so the
multi-player path cannot rot while nobody is looking.

Two things make the refactor survivable:

- **`GameState` still answers `state.mana`, `state.level`, `state.talents`** and
  the rest, as computed properties over `localUnitId`. Every read site compiled
  unchanged; only writes moved, and deleting the constructor parameters is what
  found them.
- **`GameState.actingAs(unitId)`** points `localUnitId` at whoever is casting for
  the duration of a cast. The cast pipeline and the class hooks read the caster
  through those same accessors at several dozen sites, so this addresses all of
  them at once instead of threading an actor parameter through each and hoping
  nobody forgets one. `Engine.castAs` always hands the seat back.

`parity/golden.json` is still byte-identical, which is the evidence that the
map-of-one produces the numbers the JS engine did.

Still single-player-shaped, deliberately: `generateParty` builds one human in
slot 5; passive and HoT healing (`resolvePlayerSystems`) resolves for this
client's participant only; and `UnitDebuff` records the ability that applied a
DoT but not who cast it, so enemy DoT threat is credited to the local slot.

## Building

```
./gradlew :app:assembleDebug
```

Requires a JDK 17 (AGP 9 rejects the JDK 25 that is first on PATH on this host).
Either build from Android Studio, which uses its bundled runtime, or set:

```
export JAVA_HOME="$HOME/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2"
```

### Windows daemon workaround

This host cannot connect to AF_UNIX sockets under `%LOCALAPPDATA%\Temp`, so
since JDK 21 `Selector.open()` fails and the Gradle daemon dies with "Unable to
establish loopback connection". The fix lives in the machine-level
`~/.gradle/gradle.properties` (not here, because the path is machine-specific):

```
org.gradle.jvmargs=... -Djdk.net.unixdomain.tmpdir=C:/Users/<you>/.gradle/tmp
```

## Attribution

Icons under `assets/icons/game-icons` are from game-icons.net, CC BY 3.0.
Icons under `assets/icons/wow` are Blizzard artwork — acceptable for local and
sideloaded builds, but must be replaced before any public store release.
