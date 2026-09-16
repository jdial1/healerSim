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
| Do you provide a way for users to request that their data is deleted? | **Not yet — see blockers.** Do not answer Yes until it exists. |

### Data types to declare

All of the following are **collected, not shared**, **optional** (the player
has to opt in), and **processed ephemerally: No**.

| Play data type | What it is here | Purpose to tick | Why |
|---|---|---|---|
| **Personal info → User IDs** | The Firebase Anonymous Auth uid. No name, email or password — but it is a persistent account id, and Firestore/RTDB attach it to every request. | App functionality | Identifies a player in the queue and in a room. |
| **App activity → In-app actions** | Queue entries (role, dungeon, join time), the room (who is in it, which slot), and the relayed fight: casts requested and the state of the encounter. | App functionality | This *is* the multiplayer feature. |
| **App activity → Other user-generated content** | The join profile: class, level, talent ranks, action-bar order. | App functionality | The host has to simulate every player's real character. |

**IP address and user agent — decide, don't skip.** Firebase Authentication
collects "IP addresses … to provide added security and prevent abuse during
sign-up and authentication" and "User agent strings", and Realtime Database
collects IP addresses and user agents "to enable the profiler tool". Play does
not list IP address as a standalone type; follow Play's current help text for
SDK-collected IP addresses at the time of submission, and if in doubt declare
**Location → Approximate location** only if the IP is used to derive location
(nothing in this app does). Record whichever answer is given here.

**Not collected:** location, contacts, photos, files, messages (there is no
chat), financial info, health, device identifiers beyond the Firebase ones
above, crash logs, diagnostics, analytics. Re-check if Crashlytics, Analytics or
any ads SDK is ever added — each changes this page.

**Why "not shared".** Play excludes transfers "based on a specific
user-initiated action" that the user reasonably expects. Other players seeing
your class and your fight is exactly what joining a public group is. Firebase
itself is a service provider, not a third-party recipient.

## Blockers before any of this can be submitted

1. **A deletion path.** Play's account-deletion policy applies to apps that let
   users create an account. Whether a silent anonymous Firebase account counts
   is worth settling against Play's current policy text before submission; the
   safe answer is to provide one regardless, because the form asks. Today
   there is none: the anonymous account and everything tied to it persist.
   Minimum: an in-app "Forget me" that deletes the Firebase anonymous user, plus a
   web address or email on the privacy page for players who uninstalled first.
2. **Room retention.** Firestore room documents and RTDB room nodes — including
   join profiles — are never deleted. Queue entries are handled (removed on
   leaving, on the group forming, and swept by the next client a minute after an
   app is killed); rooms are not. Needs host-side deletion at the end of a run
   and a scheduled cleanup for rooms whose players all vanished.
3. **The IP-address decision above**, written down here.
4. **A real Firebase project.** Everything so far is verified against the local
   emulator suite. Deploy `firebase/firestore.rules` and
   `firebase/database.rules.json` before the first build that points at it —
   a project in test mode accepts every write, which is the failure these rules
   exist to prevent.
