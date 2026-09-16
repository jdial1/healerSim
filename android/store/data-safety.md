# Play Console: Data safety answers

What to enter in **App content → Data safety**, and why. Re-check this page
whenever a dependency, a Firestore/RTDB document shape, or the multiplayer
flow changes — it describes the app as of the commit that last touched it.

Sources: the app's own code (`android/app/src/main/kotlin/com/jdial/aegis/mp/`),
and Firebase's per-SDK disclosure page,
<https://firebase.google.com/docs/android/play-data-disclosure>, read
2026-09-16. Firebase's own statements are quoted below rather than paraphrased.

## The one fact everything hangs on

**Single player collects nothing.** No Firebase code runs unless the player
turns on *Settings → Multiplayer* and opens a dungeon lobby: the SDK's startup
provider is removed from the manifest and the backend is built lazily
(`ViewModelQueueTest.singlePlayerNeverBuildsTheBackend`, verified in airplane
mode). But Play's form describes the app, not the default path, so every answer
below covers what happens once a player opts in.

## Answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — Firebase: "Firebase encrypts the data in transit using HTTPS." |
| Do you provide a way for users to request that their data is deleted? | **Yes** — *Settings → Multiplayer → Delete my multiplayer data*. Deletes the anonymous account, the queue entry, rooms the player hosted, and their profile from rooms they were in (`Multiplayer.forgetMe`, tested in `ViewModelQueueTest`). |
| Data deletion badge ("deleted within 90 days")? | **No.** Rooms whose players all vanished are only removed when one of them queues again. Claim it only once a server-side clean-up guarantees it. |

### Data types to declare

All of the following are **collected, not shared**, **optional** (the player
has to opt in), and **processed ephemerally: No**.

| Play data type | What it is here | Purpose to tick | Why |
|---|---|---|---|
| **Personal info → User IDs** | The Firebase Anonymous Auth uid. No name, email or password — but it is a persistent account id, and Firestore/RTDB attach it to every request. | App functionality | Identifies a player in the queue and in a room. |
| **App activity → In-app actions** | Queue entries (role, dungeon, join time), the room (who is in it, which slot), and the relayed fight: casts requested and the state of the encounter. | App functionality | This *is* the multiplayer feature. |
| **App activity → Other user-generated content** | The join profile: class, level, talent ranks, action-bar order. | App functionality | The host has to simulate every player's real character. |
| **Device or other IDs** | IP addresses (and user agents) recorded by Firebase. | Fraud prevention, security, and compliance | See the decision below. |

**IP addresses: decided, conservatively.** Firebase Authentication collects "IP
addresses … to provide added security and prevent abuse during sign-up and
authentication", and Realtime Database collects IP addresses and user agents
"to enable the profiler tool". Play's help (read 2026-09-16) says to "disclose
your collection, use and sharing of IP addresses based on their particular
usage", naming location as the case where "that data type should be declared".
Nothing here derives location from an IP, so **Approximate location is not
declared**. Play names no type for IP-for-security, so it is declared under
**Device or other IDs** with the security purpose. That mapping is a judgement,
not Play's wording: over-declaring is harmless, under-declaring is a policy
risk. Revisit if Play's text changes.

**Not collected:** location, contacts, photos, files, messages (there is no
chat), financial info, health, device identifiers beyond the Firebase ones
above, crash logs, diagnostics, analytics. Re-check if Crashlytics, Analytics or
any ads SDK is ever added — each changes this page.

**Why "not shared".** Play excludes transfers "based on a specific
user-initiated action" that the user reasonably expects. Other players seeing
your class and your fight is exactly what joining a public group is. Firebase
itself is a service provider, not a third-party recipient.

## Blockers before any of this can be submitted

Resolved: the deletion path, room clean-up at the end of a run and when a
host leaves an empty room, members clearing out hour-old rooms, and the
IP-address decision.

1. **Rooms nobody returns to.** If every player's game dies mid-run and none of
   them ever queues again, the room stays. Closing that needs a scheduled job on
   the server (a Cloud Function, which needs the paid Blaze plan). The privacy
   page says this as it is.
2. **The `GOOGLE_SERVICES_JSON` secret** has to be set in the `production`
   environment before CI can build a release (see `RELEASE.md`). Without it
   the build fails rather than shipping with multiplayer off.

Also resolved: the real project. `overheal-mp` exists, both rule sets are
deployed, and anonymous sign-in is the only provider.
`firebase/smoke-prod.mjs` passed against it, and a real device ran the whole
flow there: queue, room, hosted fight, host casts, leaving, and deleting its
data.
