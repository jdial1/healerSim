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

## Sound effects (Android)

Nineteen sounds, from three libraries. Chosen to stay fantasy-flavoured: nothing
from the Sci-fi or Digital packs. Kenney has no magic in any of its ten audio
packs, which is why the spell sounds come from elsewhere.

Every file was cut to length, made mono, faded and re-encoded to Vorbis, so
none is the original bytes; the script that does it is in the commit that
added them.

### CC0 1.0 — [Kenney](https://kenney.nl/) and [artisticdude](https://opengameart.org/content/rpg-sound-pack)

[CC0](https://creativecommons.org/publicdomain/zero/1.0/) needs no credit; it
is given anyway, in-app and here.

| File in `android/app/src/main/res/raw/` | Pack | Original file |
|---|---|---|
| `sfx_cast.ogg` | Kenney RPG Audio | `cloth4.ogg` |
| `sfx_refused.ogg` | Kenney RPG Audio | `metalLatch.ogg` |
| `sfx_crit.ogg` | Kenney Impact Sounds | `impactBell_heavy_004.ogg` |
| `sfx_danger.ogg` | Kenney Impact Sounds | `impactPunch_medium_000.ogg` |
| `sfx_death.ogg` | Kenney Impact Sounds | `impactSoft_heavy_001.ogg` |
| `sfx_clear.ogg` | Kenney Music Jingles | `jingles_PIZZI01.ogg` |
| `sfx_wipe.ogg` | Kenney Music Jingles | `jingles_HIT15.ogg` |
| `sfx_hot.ogg` | Kenney Interface Sounds | `pluck_002.ogg` |
| `sfx_dispel.ogg` | Kenney Interface Sounds | `glass_002.ogg` |
| `sfx_pull.ogg` | Kenney Impact Sounds | `impactWood_heavy_001.ogg` |
| `sfx_enemy_down.ogg` | Kenney Impact Sounds | `impactSoft_medium_003.ogg` |
| `sfx_spell.ogg` | RPG Sound Pack (artisticdude) | `battle/magic1.wav` |
| `sfx_swing.ogg` | RPG Sound Pack (artisticdude) | `battle/swing.wav` |
| `sfx_defensive.ogg` | RPG Sound Pack (artisticdude) | `inventory/armor-light.wav` |

### CC BY 3.0 — Little Robot Sound Factory

The spell sounds, from the
[Fantasy Sound Effects Library](https://opengameart.org/content/fantasy-sound-effects-library)
by [Little Robot Sound Factory](https://www.littlerobotsoundfactory.com/),
under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Attribution is
required, and is given in-app as well as here. The files were shortened and
re-encoded; changes were made.

| File in `android/app/src/main/res/raw/` | Original file |
|---|---|
| `sfx_heal.ogg` | `Spell_01.wav` |
| `sfx_heal_group.ogg` | `Spell_03.wav` |
| `sfx_shield.ogg` | `Spell_02.wav` |
| `sfx_select.ogg` | `Menu_Select_00.wav` |
| `sfx_phase.ogg` | `Dragon_Growl_00.wav` |

To swap a sound, replace the file under the same name; `ui/Feedback.kt` maps
cues to these names, and `castCue` picks one from what a spell does rather than
from its id.

## Battle sprites — CC0 (Android)

The party and enemies in the battle window are 16×16 tiles from Kenney's
[Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon),
[Tiny Farm](https://kenney.nl/assets/tiny-farm),
[Tiny Ski](https://kenney.nl/assets/tiny-ski) and
[Tiny Battle](https://kenney.nl/assets/tiny-battle) packs, under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Tiny Town was
downloaded too, but it holds only buildings and scenery, so nothing from it
ships.

| Files in `android/app/src/main/res/drawable-nodpi/` | Pack | Original tiles |
|---|---|---|
| `spr_wizard`, `spr_peasant`, `spr_brawler`, `spr_viking`, `spr_rogue` | Tiny Dungeon | `tile_0084`–`tile_0088` |
| `spr_knight_helm`, `spr_knight_visor`, `spr_fighter`, `spr_sorceress`, `spr_sage` | Tiny Dungeon | `tile_0096`–`tile_0100` |
| `spr_slime`, `spr_cyclops`, `spr_crab`, `spr_monk`, `spr_ranger` | Tiny Dungeon | `tile_0108`–`tile_0112` |
| `spr_ghost`, `spr_lizard` | Tiny Dungeon | `tile_0121`, `tile_0124` |
| `spr_farmhand`, `spr_rancher` | Tiny Farm | `tile_0108`, `tile_0109` |
| `spr_tree`, `spr_snowman`, `spr_yeti`, `spr_yeti_dark`, `spr_rock` | Tiny Ski | `tile_0018`, `tile_0069`, `tile_0078`, `tile_0080`, `tile_0081` |
| `spr_tank`, `spr_mech` | Tiny Battle | `tile_0097`, `tile_0102` |
| `spr_soldier_grey`, `spr_soldier_green`, `spr_soldier_red`, `spr_soldier_orange` | Tiny Battle | `tile_0106`, `tile_0124`, `tile_0160`, `tile_0178` |

`ui/BattleView.kt` maps classes, and every enemy and boss by name, to these
files; some enemies reuse a tile under a colour tint.

## Ability icons — Blizzard Entertainment

`public/icons/wow/` contains World of Warcraft artwork. World of Warcraft and
Blizzard Entertainment are trademarks or registered trademarks of Blizzard
Entertainment, Inc.

The 23,474 icons are the game's `Interface/ICONS` folder as mirrored by
[Gethe/wow-ui-textures](https://github.com/Gethe/wow-ui-textures) (`live`
branch, commit `d23deaf`, WoW 9.2.7). Filenames were lowercased with spaces
removed, 14 spaced duplicates of existing names were dropped, and every file
was recompressed losslessly with Zopfli, so pixels are unchanged.

Aegis is an unofficial fan project, not affiliated with, endorsed by, or
sponsored by Blizzard Entertainment, Inc. These icons are used without a
licence from the rightsholder; that is a deliberate decision by the project
owner, recorded here so it is not mistaken for an oversight.

## The game

Game code, content and design by Justin Dial.
