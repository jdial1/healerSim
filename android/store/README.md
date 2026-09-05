# Play Console assets

## Screenshots

`screenshots/` — six phone screenshots captured from the Android release
build at 1080×2424 (Pixel 9). Play requires 2–8, each side 320–3840 px; these
qualify. They replace the old `public/screenshots/`, which are the **web** app
at 500×950 — the wrong app and below Play's preferred size.

Tablet screenshots are not included. Their absence triggers a large-screen
quality flag in the Console, but does not block the release.

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
| Data safety | No data collected, no data shared | True: no permissions, no networking code, one save file in `filesDir`. **This stops being true the moment any analytics or crash SDK is added.** |
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
