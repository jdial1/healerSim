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

## Multiplayer: the queue

Optional and opt-in. Single player never opens a socket.

The design splits deliberately into a part that is decided and a part that is
enforced:

- **`mp/Matchmaking.kt` decides who plays with whom.** Pure: no Firebase, no
  Android, no clock. Every client runs the same function over the same queue
  snapshot and therefore agrees on the group, the slots and the host without
  coordinating. The room id is derived from the members, so only the host needs
  to create the document and everyone else waits for that exact id.
- **`firebase/firestore.rules` enforces identity.** A client that lies about
  matchmaking gets itself a worse game; a client that could delete other
  people's queue entries or forge their casts would be everyone else's problem.
  Those are the cases the rules cover and the cases `rules.test.mjs` pins.
- **`mp/FirebaseBackend.kt` is the thin part between them** — reads documents,
  writes documents, drops anything that does not parse. `mp/Wire.kt` treats every
  document as untrusted input, because every one of them was written by a
  stranger's client, and returns null rather than throwing.

**A group never fails to form.** Past the deadline the room starts with whoever
turned up and the AI fills the rest, so a queue nobody else is in still produces
a dungeon. That is the same code path single player already takes.

### The relay

One client simulates. The host drains what everyone asked to do, advances the
engine it already had, and publishes a frame; guests apply frames and never call
the engine at all, so there is no drift to reconcile — there is one timeline and
it is the host's. `MultiplayerSession` is a pair of steps the caller drives
rather than a loop, so a test and the app's tick loop step it the same way.

**Realtime Database, not Firestore, for a reason that is not cost.** Firestore's
sustained write limit is about one per second per document and the relay
publishes at 3–4 Hz, so a frame-rate document there would be throttled by
design. Firestore keeps what changes at human speed — the queue and the room.

**The frame is 1,405 bytes, against 17,839 for a full `GameState`.** Measured,
not estimated: 14,753 of those bytes were the talent tree, because every
`TalentRank` embeds its whole `Talent`. Talents do not change during a run and
every client holds the same tree in assets, so they travel once at join. That
projects to **0.081 GB per room-hour** at 4 Hz with four readers, against the
plan's 0.17 GB budget. `SnapshotTest` asserts both numbers.

**A relayed crit roll is thrown away.** `critRoll` reaches the engine as action
data because the web app rolled it client-side, and `validate` only compares it
against crit chance — so a guest sending `0.0` would crit every cast forever.
`Engine.castAs` redraws it for any actor that is not the local one, and
`WireAction` does not carry the field at all, so there is nothing to be tempted
to trust. None of this stops the *host* cheating; that is the accepted trade of
a host-authoritative v1.

### Reaching it from the app

Off by default, in Settings → Multiplayer, and the row says what leaves the
device rather than making you find the privacy policy. With it off the game
never opens a socket.

The lobby starts queueing the moment it opens, which is what lets it show real
people arriving instead of an animation; backing out deletes the queue entry,
because a stale one keeps everyone else holding a seat for somebody who has
gone. **Entering is never blocked on strangers** — the AI fills whatever is
empty, so the lobby never says "waiting for players".

The rule the wiring is built around: **"the queue is broken" must never mean
"you cannot play".** Switched off, unconfigured, nobody there, network down, a
publish that fails mid-fight — every one of those falls through to the run you
would have had anyway, and `aQueueThatCannotBeReachedStillLetsYouPlay` points
the client at a dead port to prove it.

A debug build with no `google-services.json` falls back to a local emulator
suite, which is how the multiplayer UI is reachable without owning a Firebase
project. Release builds do not: there, no configuration means multiplayer is
unavailable and the settings row says so.

### Surviving the host being a phone

A host is somebody's phone, so it will be backgrounded, throttled and killed.

**Heartbeats decide who hosts.** Each client stamps its own liveness with the
*server's* clock (`ServerValue.TIMESTAMP`, required by the rules — a client that
could post a future timestamp would keep a dead room alive forever). `electHost`
is pure and deterministic, so every client reaches the same answer from the same
heartbeats without negotiating, and ties break on lowest uid. A claim is refused
by the rules unless the sitting host has genuinely gone quiet, so a client that
gets the election wrong cannot act on it.

"Now" is the client's *own* heartbeat, written and read straight back. Comparing
server-stamped values against `System.currentTimeMillis()` would measure the skew
between two machines rather than elapsed time, and a phone an hour fast would
declare the host dead immediately.

**There is no handover code path.** A player who stops answering is marked
`isHuman = false`, and `aiDamageShare` recomputes to include their slot again —
the AI simply resumes doing their damage. A separate "somebody left" path would
be one that only runs when something has already gone wrong, which is the worst
kind to have. The arithmetic is `1.0 - Σ(1 - share)` specifically so that a lone
healer still yields exactly `1.0` and the enemy-damage expression stays the
bit-identical identity `golden.json` was recorded against.

**Backgrounding stands the host down.** Heartbeats are written by the tick loop,
so `onEnterBackground` stopping the loop stops the heartbeat and the room
migrates within `HEARTBEAT_TIMEOUT_MS`. That is a deliberate choice of "migrate
promptly" over "keep hosting in the background", which would need a foreground
service and a permanent notification. The honest cost: the room stalls for up to
that timeout before somebody else picks it up.

**Talents travel once, in a join profile.** The frame carries none — that is what
keeps it at 1.4 KB — but a migrated host has to simulate players it never met, so
`WireProfile` publishes class, level and talent *ranks* on joining. The receiver
rebuilds the spell loadout from the tree it holds itself rather than trusting a
list, the same trick `SaveStore.restore` uses, so a forged profile can only
misrepresent its own author.

### Running it without a Firebase project

Everything below runs against the local emulator suite. No Google account, no
project, no `google-services.json`:

```
cd firebase && npm install
npm run test:rules            # security rules, ~10s, needs no device
```

For the client half, with a device or AVD attached:

```
cd firebase && npm run emulators                            # leave running
adb reverse tcp:9099 tcp:9099 && adb reverse tcp:8080 tcp:8080 && adb reverse tcp:9000 tcp:9000
cd android && ./gradlew :app:connectedDebugAndroidTest
```

One trap worth knowing: the Realtime Database namespace must be
`<projectId>-default-rtdb`, not the project id. Get it wrong and the emulator
does **not** error — it serves the unknown namespace with default open rules, so
every security test passes for the wrong reason. That is how a guest was briefly
able to forge the broadcast frame here, and
`aGuestCannotForgeTheFrameEveryoneElseRendersFrom` is the test that caught it.

`adb reverse` rather than the usual `10.0.2.2`: an app process could not reach
the host through the emulator NAT on this setup even though `adb shell` could,
and a forwarded port removes the NAT from the path. Cleartext to `127.0.0.1` is
permitted by `src/debug/res/xml/network_security_config.xml`, which is in
`src/debug` and is **not** merged into a release build — verified by reading the
merged release manifest, not assumed.

`google-services.json` is gitignored and absent. The `google-services` plugin is
applied only when the file exists, so a fresh clone builds; multiplayer is then
simply unavailable rather than crashing, which is what
`FirebaseBackend.createOrNull` returning null means.

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
