# Play Store listing copy

Target player: someone who healed 5-mans with HealBot, VuhDo, Grid+Clique or
Cell — the person who spent the dungeon looking at frames, not at the boss.

**Those product names, and Blizzard's, are deliberately absent from the copy
below.** Store metadata is the most heavily scanned surface on Play, and
third-party trademarks in a title, subtitle or description are a routine cause
of takedowns and account strikes — a much higher-risk placement than a bundled
asset. The copy hooks the same audience by using the vocabulary only healers
have (triage, overheal, HoT upkeep, mana efficiency), which also matches how
these players actually describe what they miss.

---

## App name (max 30 characters)

**Chosen: `Overheal: Healer Sim`** (20 characters) — applied across both apps.

"Overheal" is a word nobody outside the role knows or cares about. A healer
reads it instantly and knows the game is for them; everyone else scrolls past,
which is the correct filter for a game this specific. It also avoids the
collision with Aegis Authenticator and the several other apps called Aegis.

Where the name now lives:

| Surface | Value |
|---|---|
| Play listing / launcher | `Overheal` (`app_name` in `strings.xml`) |
| Android splash wordmark | `OVERHEAL` (`Screens.kt`) |
| Web title and splash | `Overheal` / `OVERHEAL` |
| PWA manifest | name `Overheal: Healer Sim`, short_name `Overheal` |

Two identifiers deliberately keep the old name, because both are permanent and
neither is user-facing:

- `applicationId` — `com.jdial.aegis`. Fixed after first publish; the store name
  does not have to match it.
- PWA manifest `id` — `aegis`. Changing it makes every installed copy a
  different app rather than an update.

Internal `Theme.Aegis` style names are untouched; they are resource ids.

## Short description (max 80 characters)

```
Keep the party alive. Raid-frame healing, mana triage, no tank to hide behind.
```
(78 characters)

Alternates:

```
You are the healer. Five bars, one job, and never quite enough mana.
```
```
Frame-watching, HoT-clipping, triage healing. The role, without the raid night.
```

## Full description (max 4000 characters)

```
You are the healer. Not the tank, not the DPS meter — the one person whose
mistake gets someone killed.

Overheal is a healing simulator built around the part of a dungeon that healers
actually play: five health bars, a mana pool that will not last, and a boss
whose damage you can only see through what it does to your party.

WHAT YOU ACTUALLY DO

Tap a frame to target. Cast to heal. Watch the bar you did not pick.

Every spell is a decision you will recognise. The fast heal that keeps someone
alive and empties your mana. The slow one you never quite have time for. The
heal-over-time you refresh too early and waste. The cooldown you save so long
that the tank dies with it still up.

The party fights on its own. Three trash pulls, then a boss. Nobody gets a
second chance because you were reading the boss health bar.

THE NUMBERS THAT MATTER

Every run ends with the stat line healers argue about: healing done, HPS,
healing per mana, and overheal percent. Big numbers are easy. Big numbers with
low overheal and mana left at the end are the actual craft.

THREE HEALERS, THREE PROBLEMS

- Holy Priest — direct healing and absorbs. High burst, high cost. You will
  run dry.
- Restoration Druid — six spells, all of them heal-over-time upkeep. You are
  always casting on someone who is not hurt yet.
- Holy Paladin — three spells, one target, enormous single-target throughput.
  Unlocks at level 25.

Each has a full talent tree of 29 to 32 nodes, with free respec whenever you
want to try the other build.

CONTENT

- 16 dungeons across levels 1 to 48, each with its own boss and mechanics
- An endless mode that scales past the level cap
- Three paces per run: fast for less XP, slow for double — the difficulty dial
  is also the reward dial
- Two mana potions per dungeon, and you will want a third

BUILT FOR A PHONE, NOT PORTED TO ONE

Frames are thumb-sized and fixed height, so a debuff appearing never moves the
target you were about to tap. Health colour is a hard signal, not a gradient.
The action bar reorders by drag, so your muscle memory is yours.

Works fully offline. No account, no ads, no timers, no energy, nothing to buy.
No permissions and no networking code at all — your progress lives on your
device and goes nowhere.

If you have ever kept a group alive while three people stood in fire and
nobody said thank you, this is that, in your pocket.
```

(About 2,100 characters — well inside the limit, with room to add a feature or
a testimonial line later.)

## Keyword notes

Play indexes the title and description. The terms this audience searches are
role and mechanic words, not brand names: *healer, healing, raid frames, party,
dungeon, RPG, simulator, MMO healer, support role, heal over time, mana*.
Several are already load-bearing in the copy above. Do not stuff the
description with a keyword list — Play demotes for it, and it reads as spam to
exactly the player you want.

## Follow-ups if the name changes

1. `applicationId` stays `com.jdial.aegis` — it is permanent after publish and
   does not have to match the store name. No code change, but worth knowing the
   Play Console will show the old id forever.
2. The splash screen renders "AEGIS" from `SplashScreen.kt`, and the web app
   uses the same wordmark. Both should be updated to match whatever name you
   pick, or the store listing and the first screen disagree.
