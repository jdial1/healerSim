# Play Store listing copy

**Positioning: a role-based party game.** Pick a job — heal, tank or deal the
damage — and play a five-person dungeon run in which the other four are AI, or
other people if you opt into the public queue. The healer game is still the
deepest of the three, and the copy says so, but it is no longer the whole
pitch. (Decided 2026-09-16, replacing the healer-only copy.)

Target player: someone who ran 5-mans in an MMO and has a favourite role.
Healers are still the sharpest hook — nobody else sells them this game — but
tanks and damage dealers now have real mechanics of their own, and the listing
can promise that.

**Third-party names, Blizzard's included, stay out of the copy.** Store
metadata is the most heavily scanned surface on Play, and trademarks in a title
or description are a routine cause of takedowns. The copy reaches the audience
with the vocabulary only they use: triage, overheal, threat, taunt, rage,
combo points, rotation.

---

## App name (max 30 characters)

**`Overheal: Tank, Heal, DPS`** (25 characters)

Keeps the brand the app, its splash and the web version already carry, and
puts the three roles in the one place Play weighs most. "DPS" is jargon, and
that is the point: the people who know it are the audience.

Alternates:

- `Overheal: Dungeon Party RPG` (27)
- `Overheal: Pick Your Role` (24)

The launcher label stays `Overheal` (`app_name`). `applicationId` stays
`com.jdial.aegis` — permanent after publish, and it never has to match.

The splash screen's subtitle reads *Tank · Heal · DPS*, matching the listing.
The web version keeps *The Healer's Oath*: it only has the healers.

## Short description (max 80 characters)

```
Heal, tank or deal damage. A five-person dungeon party, and every role is yours.
```
(80 characters)

Alternates:

```
Pick a role, join the party, clear the dungeon. Healer, tank or damage dealer.
```
```
Keep them alive, hold the boss, or burn it down. Party dungeons in your pocket.
```

## Full description (max 4000 characters)

```
Every dungeon party needs three jobs done. Pick yours.

Overheal is a party RPG built around roles. Five people go in: a tank, three
damage dealers and a healer. You are one of them. The rest of the group fights
beside you — AI, or real players if you turn on the public queue — and you can
watch them do it, lined up against the enemy at the top of the screen.

HEAL — KEEP THEM ALIVE

Five health bars, a mana pool that will not last, and a boss you only see
through what it does to your party. Tap a frame, cast, and watch the bar you
did not pick. The fast heal that empties your mana. The heal-over-time you
refresh too early. The cooldown you saved so long that the tank died with it
still up.

- Holy Priest — direct heals and absorbs. High burst, high cost.
- Restoration Druid — heal-over-time upkeep on people who are not hurt yet.
- Holy Paladin — enormous single-target healing. Unlocks at level 25.

TANK — HOLD ITS ATTENTION

Every hit you take matters, because it is one your healer does not have to
chase. Build threat, taunt the boss back when it turns on someone else, and
pick the moment for your defensive.

- Protection Warrior — taking and dealing damage builds rage; Shield Slam
  spends it. Vengeance raises your rage cap and your threat.
- Blood Death Knight — Death Strike heals you for the damage you just took,
  and hardens part of it into a shield.

DAMAGE — BURN IT DOWN

Pull ahead of the tank and the boss comes for you, so the fastest rotation is
not always the best one.

- Frost Mage — Frostbolt chills the enemy; your next spell against it is far
  more likely to crit.
- Assassination Rogue — strikes build combo points, two on a crit, and
  Eviscerate spends them all.

Every class has a signature stat that drives its mechanic, and the character
sheet tells you what yours is buying.

CONTENT

- Seven classes across three roles, each with a full talent tree and a free
  respec whenever you want to try the other build
- 16 dungeons across levels 1 to 48, each with its own boss and mechanics
- An endless mode that keeps scaling past the level cap
- Three paces per run: fast for less XP, slow for double

PLAY WITH OTHERS, OR DON'T

The public queue is optional and off until you turn it on. When it is on, you
queue for a role and whoever turns up plays the other seats; the AI takes any
seat that is empty, so nobody waits. There is no chat.

Single player never connects to anything. No sign-up, no ads, no timers, no
energy, nothing to buy. Your progress lives on your device.

BUILT FOR A PHONE

Frames are thumb-sized and fixed height, so a debuff appearing never moves the
target you were about to tap. Drag a spell onto a frame to target and heal in
one gesture. Sound and vibration tell you a heal went off, or that somebody
just dropped into danger, without looking.

Pick a role. The party is waiting.
```

(About 3,000 characters.)

## Screenshots

Ten, built by `make-screenshots.py`; see `README.md`. In order they show the
title, the role choice, one fight from each role, and what each class's
signature stat buys — so the first five already carry the positioning.

| # | Caption | What it shows |
|---|---|---|
| 01 | Overheal — Tank · Heal · DPS | Title card |
| 02 | Pick your role | Class select, grouped by role |
| 03 | Keep them alive | Holy Priest mid-boss |
| 04 | Hold the line | Protection Warrior holding threat, rage full |
| 05 | Build, then spend | Rogue with energy and combo points |
| 06 | A mechanic per class | Character sheet: what Vengeance buys |
| 07 | Drag a spell onto a frame | Landscape healer |
| 08 | Hold its attention | Landscape tank |
| 09 | Spend the point | Talents, landscape |
| 10 | Sixteen dungeons deep | Dungeons, landscape |

## Keyword notes

Play indexes the title and the description. This audience searches role and
mechanic words, not brand names: *healer, tank, DPS, party, dungeon, RPG,
roles, raid frames, threat, MMO, offline RPG*. Most are already load-bearing
above. Do not add a keyword list — Play demotes it, and it reads as spam to
exactly the players this is for.
