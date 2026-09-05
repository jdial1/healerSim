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

Editing `src/data/balance.json` therefore retunes **both** apps. Run
`npm run prebuild` in the repo root first so the icons exist on disk — they are
downloaded, not committed.

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
