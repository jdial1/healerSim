# Attribution

Third-party assets bundled with Aegis, and the terms they are used under.
The same list is shown to players at `/credits.html` in the web app and in the
in-game Credits dialog on Android.

## Interface icons — CC BY 3.0

106 icons from [game-icons.net](https://game-icons.net/), used under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):

| Author | Icons | Link |
|---|---|---|
| Lorc | 80 | https://lorcblog.blogspot.com/ |
| Delapouite | 26 | https://delapouite.com/ |

Some icons have been recoloured; changes were made. CC BY requires this
attribution to be given wherever the work is distributed, which is why it is
surfaced in-app and not only in this file.

Files live in `public/icons/game-icons/<author>/`. `npm run icons:refresh`
regenerates them from upstream; it is not part of any build.

## Typeface — SIL OFL 1.1

Cinzel by Natanael Gama, under the
[SIL Open Font License 1.1](https://openfontlicense.org/).

## Sound effects — CC0 (Android)

Seven sounds from [Kenney](https://kenney.nl/)'s audio packs, released under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). CC0 needs no
credit; it is given anyway, in-app and here. Chosen to stay fantasy-flavoured:
nothing from the Sci-fi or Digital packs.

| File in `android/app/src/main/res/raw/` | Kenney pack | Original file |
|---|---|---|
| `sfx_cast.ogg` | RPG Audio | `cloth4.ogg` |
| `sfx_refused.ogg` | RPG Audio | `metalLatch.ogg` |
| `sfx_crit.ogg` | Impact Sounds | `impactBell_heavy_004.ogg` |
| `sfx_danger.ogg` | Impact Sounds | `impactPunch_medium_000.ogg` |
| `sfx_death.ogg` | Impact Sounds | `impactSoft_heavy_001.ogg` |
| `sfx_clear.ogg` | Music Jingles | `jingles_PIZZI01.ogg` |
| `sfx_wipe.ogg` | Music Jingles | `jingles_HIT15.ogg` |

To swap a sound, replace the file under the same name; `ui/Feedback.kt` maps
cues to these names.

## Ability icons — Blizzard Entertainment

`public/icons/wow/` contains World of Warcraft artwork. World of Warcraft and
Blizzard Entertainment are trademarks or registered trademarks of Blizzard
Entertainment, Inc.

Aegis is an unofficial fan project, not affiliated with, endorsed by, or
sponsored by Blizzard Entertainment, Inc. These icons are used without a
licence from the rightsholder; that is a deliberate decision by the project
owner, recorded here so it is not mistaken for an oversight.

## The game

Game code, content and design by Justin Dial.
