# Play Console assets

## Screenshots

Ten captioned images in `screenshots/`, six portrait 1080x1920 and four
landscape 1920x1080. `01-title.png` is the title card; the rest carry a short
line each.

**Why they are composed rather than raw captures.** The device captures are
1080x2424, an aspect ratio of 2.24:1. Play accepts each side between 320 and
3840 px but will not take a ratio more extreme than 2:1, so a raw phone capture
from this emulator is not uploadable. Each image places the full screenshot on
a branded ground at 9:16 or 16:9, which is both compliant and the usual store
format anyway.

The device shot is *contained*, never cropped — an earlier pass cropped to fill
and cut off the party names and the action bar, which would have advertised a
UI the app does not have.

Rebuild them with the compositor after any UI change; the captions and sources
are listed at the bottom of that script. The previous set went stale within a
day when the frame layout changed, so treat them as build output, not assets.

## Still to make

**Feature graphic — 1024×500 PNG or JPEG, required.** No source exists in this
repo, and it cannot be cropped from `public/game_icon-512.png`: that is a square
icon, and the splash art behind it is a portrait composition. It needs to be
authored.

**App icon — 512×512, done.** `public/game_icon-512.png` is already the exact
size Play wants.

## Console answers this app should give

| Field | Answer | Why |
|---|---|---|
| Privacy policy | `https://jdial1.github.io/healerSim/privacy.html` | Required even with no data collection. Published from `public/privacy.html`. |
| Data safety | See [`data-safety.md`](data-safety.md) | **No longer "no data collected"** since the opt-in public queue. That page has the per-type answers, the Firebase sources, and the blockers that must close before submission. |
| Ads | None | |
| App access | All functionality available without special access | No login. |
| Target audience | 13+ | Avoids Families policy and its extra requirements. |
| Content rating | IARC questionnaire — fantasy combat, no blood or gore | Answer honestly; a wrong rating is a policy violation. |

## Decide before the first upload — both are permanent

- **`applicationId` is `com.jdial.aegis`.** It cannot be changed after
  publishing without shipping a different app that existing users do not
  upgrade to.
- ~~The listing name "Aegis" collides with established apps.~~ **Settled: the
  app is now "Overheal: Healer Sim"**, applied across both apps. See
  `listing.md`. The package id stays `com.jdial.aegis` and does not need to
  match.
