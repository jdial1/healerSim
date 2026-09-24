# Ideas the Vigil soul suggests

A brainstorm, not a plan. Nothing here is recommended, ranked, or costed --
these are the features that follow from `SOUL.md` and `souls/vigil.txt`, written
so each can be judged on its own.

Every entry is traced *mechanic → dynamic → tone*, per `LLM_SOUL_GUIDE.txt` Step
10: the mechanic is concrete and buildable, the dynamic is what players would do
differently, the tone is the feeling that behaviour produces. **If the middle
column is weak, the idea is weak** -- that is what the column is for. Judge them
there first.

"Serves" names the pillar, component, or pitfall each one answers.

---

## Pillar 1: The seat you do not hold

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 1 | Give the AI healer a reaction delay and a triage priority order it can get wrong (`aiHealerReactionTicks`, `aiHealerPriority` in `balance.json`), alongside the throughput limits it already has | Players in tank and DPS seats start feeling which drops were theirs to prevent, instead of being graded on whether a mana pool held out | Answerable vigilance | `covering_party` |
| 2 | Give each name in `npc_pools.json` one habit: a tank who taunts a beat late, a rogue who opens before the pull settles | Players read the roster on the queue sheet and pick a consumable to cover that specific flaw, so the pre-run choice has a target | Answerable vigilance | Pillar 1, `scarcity_economy` |
| 3 | A "seat report" on the result screen: what your seat absorbed -- damage the tank ate that you never had to chase, casts you kicked -- and nothing at all about how well anyone else played | Players judge themselves against the size of the hole rather than against a total | Answerable vigilance | Pillar 1, The Grade |
| 4 | A four-person run: one fewer AI seat, more reward | The hole gets visibly bigger and every role feels which of its jobs was load-bearing | Answerable vigilance | `difficulty_ladder` |
| 5 | Bounded intent pings: the AI tank marks its next pull, a DPS flags a big cooldown. No text, a fixed vocabulary | Players pre-position mana and cooldowns for a pull they can now see coming | Answerable vigilance | Pillar 1, `social_safety` |
| 6 | Audit `utility_spells.json` so no class permanently gains another seat's job; where a class must cover, put it on a long cooldown and make it visibly worse than the real thing | Players stop converging on whichever class needs nobody, and a group stays a set of holes | Answerable vigilance | `solo_wizard` |
| 7 | An AI competence setting that is explicitly *not* a difficulty slider -- it changes what the teammates get wrong, never how much damage the boss does | Players tune how much of the fight is theirs to answer, rather than tuning the numbers | Answerable vigilance | `covering_party`, `unfair_rungs` |

## Pillar 2: Waste is the score

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 8 | A waste metric per seat, beside the existing `overhealPct`: threat built past what holding required, damage dealt while over the threat line | Every role gets a number to optimize, so the tank and DPS seats acquire the game the healer already has | Cool focus | Pillar 2 |
| 9 | One waste-buy-back archetype per role, in the mould of the Priest's `divinityOverhealToShieldPerRating`: surplus threat into a defensive, held-back damage into a burst window | Builds form around the waste rather than around raw output, and the shameful number becomes a resource | Cool focus | Pillar 2, `synergy_engines` |
| 10 | Add efficiency to `DungeonRecord`: best healing-per-mana, lowest waste, alongside `bestTicks`, `bestDps`, `bestHps` | The record screen stops rewarding volume, and a player who waited posts better numbers than one who fired everything | Cool focus | Pillar 2, `difficulty_ladder` |
| 11 | Put waste on the result screen as a headline, not a detail | Players compare two builds that both survived, which is the only way to tell them apart | Answerable vigilance | Pillar 2, `proof_nobody_sees` |
| 12 | A third clear mark beside `clean` and `sharp`: finished above a mana threshold, or below a waste threshold | Prestige gets an axis that is neither speed nor survival, so a slow careful clear is worth chasing | Cool focus | `difficulty_ladder` |

## Pillar 3: One fight, several windows

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 13 | A boss mechanic whose tell is only visible from one seat: a party debuff pattern the healer can read, a stance change only the tank sees | The seat that can see it has to act on it, and in single player the AI cannot, so it is unambiguously your job | Answerable vigilance | Pillar 3 |
| 14 | Extend the role-aware threat bar in `CombatScreen.kt` with an equivalent instrument for the healer -- incoming damage over the next few ticks, per frame | The healer's primary reading stops being current health and becomes the derivative, which is what triage actually is | Answerable vigilance | Pillar 3, `legible_failure` |
| 15 | A live signature-stat forecast on the character sheet: what the next point of the stat buys, at this level, in this build | Build decisions move out of guesswork without the game giving advice | Cool focus | Pillar 3, `trusting_the_player` |
| 16 | A per-seat dungeon record, so the same place is cleared three times from three windows | Players push through the other two windows to finish a place, and discover the fight they thought they knew | Answerable vigilance | Pillar 3, Career |

## The workbench (the absent Core component)

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 17 | A forecast on the talent screen: this build's throughput, efficiency and time-to-empty against the selected dungeon's scripted damage, run headless through the reducer the way `scripts/playtest.py` already does | Builds get compared in the app instead of by wiping and guessing | Cool focus | `workbench`, `hidden_math` |
| 18 | A dry-run sandbox: one pull, no rewards, instant restart, any dungeon and keystone | An expert tests a charm swap in thirty seconds instead of committing a run to it | Cool focus | `workbench` |
| 19 | Builds as a share code -- talents, charm, consumable -- with no account and no server | Builds travel as text between people who already talk to each other | Cool focus | `workbench`, `social_safety` |
| 20 | A readable view of the coefficients the sheet currently hides in `balance.json` | The browser tab beside the game stops being necessary, which matters because there is no community to write that wiki | Cool focus | `outside_tool`, `hidden_math` |

## Legible failure (the under-tuned Core component)

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 21 | The wipe receipt: who fell first, the three largest hits they took, and which of your own cooldowns were up when it happened | Players stop saying "it spiked" and start saying "I held that nine seconds too long" | Answerable vigilance | `legible_failure`, The Blame |
| 22 | Name the missed kicks that `missedKicks` already counts: which cast, at what point in the fight | The `sharp` mark becomes something a player can work toward rather than a result they are handed | Answerable vigilance | `legible_failure` |
| 23 | A replay of the ten seconds before the first death, from the state the engine already produces | Players learn the tell by watching it, not by dying to it again | Answerable vigilance | `legible_failure` |

## The ladder and the Career

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 24 | Restriction toggles on the queue sheet, priced in XP the way `pacing.json` prices the three paces: no consumable, no charm, no potion | Experts add friction on purpose instead of waiting for new content | Cool focus | `difficulty_ladder`, `empty_top` |
| 25 | Past some level, XP buys kit breadth -- utility slots, a sixth spell -- rather than raw stats | Over-levelling stops being the correct answer to a hard dungeon, and the keystone becomes the real ladder | Cool focus | `grind_disguised_as_progress`, Career + a levelled account |
| 26 | Surface keystone level and the clear marks on the dungeon card itself | The top of the game reads as "the same place, harder, nobody down" rather than "a higher number" | Cool focus | `difficulty_ladder`, `empty_top` |
| 27 | Rank endless mode by efficiency per wave, not waves alone | The endless run becomes a resource curve to hold rather than a health-bar treadmill | Cool focus | Pillar 2, `stagnant_mid_game` |

## Multiplayer, within the soul

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 28 | Decide explicitly that the relay never carries per-player performance, the way it already carries only `runXpAwards` | Nobody can be blamed for a wipe, so a public queue stays playable with strangers | Answerable vigilance | `social_safety`, The Grade |

---

# Round two

Round one was derived from draft pillars. Vigil is a written soul now
(`souls/vigil.txt`), so this round is derived from its **named rules** and from
the components it claims, which is a stricter test: each idea below cites the
rule it serves by name.

**Shipped since round one:** 1 (partly -- the AI healer has a reaction delay and
triages by raw health), 10 (`bestHpm`), 21 (partly -- the first faller is named,
not yet the three largest hits), 22, 28. The party-frame lens work (tank's row
inverts to threat, DPS splits, healer unchanged) was not in round one and lands
squarely on **Change the Window, Not Just the Verbs**.

**Satisfied already, nothing to build:** *No Handover Path* (a silent teammate
becomes `isHuman = false` and the AI resumes their damage), *One Simulation,
Every Seat* (`GameState.actingAs`), and the workbench's *Refactoring Is Free*
(the free respec).

## "Competent Enough to Play With, Fallible Enough to Matter"

The AI healer now has judgment limits. The AI **tank** and **DPS** still have
none -- `aiTauntCooldownTicks` is a throughput limit, not a judgment one -- so a
healer is still playing beside two fuel tanks.

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 29 | Give the AI tank a reaction delay before it taunts, and a chance to taunt the wrong add when several are up | A healer feels the boss turn and stay turned for a beat, and starts holding a cooldown for it instead of spending on chip damage | Answerable vigilance | `covering_party` |
| 30 | Let an AI damage dealer occasionally push past the pull line and wear a hit | Spike damage on a non-tank acquires an author the healer can see coming, rather than arriving as noise | Answerable vigilance | `covering_party`, Pillar 1 |
| 31 | In the wipe receipt, state teammate *events* -- "taunt came 1.4s after the boss turned" -- as facts, never as a rating | Players learn the shape of the hole they were filling | Answerable vigilance | `legible_failure` — **but read against *Never Grade the Others*.** An event is not a quality, and this is the closest any idea here comes to that line. Judge it carefully. |

## "The Hole Is the Job"

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 32 | Where a class covers another seat's job, show the reduced effect on the button itself, not only in the tooltip | Players read a cover ability as a stopgap rather than a second job | Answerable vigilance | `solo_wizard` |
| 33 | A test asserting no class's granted utilities cover more than one other seat's job (`utility_spells.json` is the single source) | Convergence on the self-sufficient class fails the build instead of being found in playtesting | Answerable vigilance | `solo_wizard` |

## "Name the Waste, Then Price It"

The rule says *every* seat gets a waste metric. Only the healer has one, which
is why #12 from round one is still blocked: a third clear mark keyed on
`overhealPct` would be free for tanks and DPS.

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 34 | Tank waste: threat built past the pull line while already holding, accumulated from the `threat` already on `Unit` | A tank stops globalling threat it cannot use and starts spending those beats on mitigation | Cool focus | Pillar 2 |
| 35 | DPS waste: damage dealt while above the pull line -- output that bought risk and nothing else | The fastest rotation stops being the best one, in a number rather than in a wipe | Cool focus | Pillar 2 |
| 36 | One waste-buy-back per role: surplus threat into a defensive charge, held-back damage into a burst window | Builds form around the waste, and the shameful number becomes an archetype | Cool focus | *At Least One Build Buys the Waste Back* |
| 37 | Decide what `bestDps` and `bestHps` are for -- they are recorded and displayed nowhere -- and either convert them to per-resource equivalents or delete them | The record stops holding volume metrics nobody sees | Cool focus | *Efficiency, Not Volume*, `proof_nobody_sees` |
| 38 | Rank endless by efficiency per wave, not waves alone | The endless run becomes a resource curve to hold rather than a health-bar treadmill | Cool focus | Pillar 2, `stagnant_mid_game` |

## "Change the Window, Not Just the Verbs"

The lens work changed *how* each seat reads the party. Nothing yet changes what
the **encounter** shows each seat.

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 39 | A boss cast whose tell is legible from one seat only: a party debuff pattern the healer can read, a stance change only the tank sees | The seat that can see it must act, and in single player the AI cannot, so it is unambiguously yours | Answerable vigilance | Pillar 3 |
| 40 | The healer's missing instrument: incoming damage over the next few ticks, per frame | The healer's primary reading becomes the derivative, which is what triage is | Answerable vigilance | Pillar 3, `legible_failure` |
| 41 | A live forecast of what the next point of the signature stat buys, on the character sheet | Build decisions leave guesswork without the game giving advice | Cool focus | *Each Seat Owns One Number* |

## The workbench, by its own rules

Still absent, and the component's rules are sharper than round one's version of
this.

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 42 | A lab beside the floor: one pull, no rewards, instant restart, any dungeon and keystone -- loading the same `balance.json` the run does | An expert tests a charm swap in thirty seconds instead of committing a run | Cool focus | *A Lab Beside the Floor*; `lab_that_lies` is the risk if the lab ever relaxes a cap |
| 43 | Build codes that carry their claim: talents, charm and consumable *plus* the HPM and clear time they earned | A posted build arrives with its measurement attached and means the same thing in the reader's game | Cool focus | *Designs Travel as Text, With Their Context* |
| 44 | Your own clears as a histogram of time and HPM against your own history -- no stars, no advice | Players judge a build against their own record, which is the only comparison this soul allows | Cool focus | *Measure, Don't Grade*, `social_safety` |
| 45 | A readable view of the coefficients `balance.json` currently hides | The browser tab beside the game stops being necessary, and there is no community here to write that wiki | Cool focus | `outside_tool`, `hidden_math` |

## interface_voice, currently only a Trace

Vigil claims this component; the game holds it by habit rather than by rule.
`RunHighlights` is documented as being "for the outcome screen to shout about,"
which is the component's *Never Congratulate a Number* in as many words.

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 46 | Convert the outcome screen's shouts into statements: the mark is the fact, not a celebration of it | A number stops being something players perform for | Cool focus | *Never Congratulate a Number* |
| 47 | Audit the result screen for anything the party frames already said during the run | Redundant lines stop training players to skip the screen that carries the receipt | Cool focus | *Say It Once* |
| 48 | Audit `Vital.critical`: it currently carries the ghost-damage band, the incoming-cast outline and closing threat | Red means danger everywhere, so it keeps meaning danger anywhere | Cool focus | *Warning Colours Mean Danger* |

## audio_information, per Vigil's own tuning note

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 49 | Duck the ambience as the party's lowest health falls, so a bad moment sounds different before it looks different | Players hear the run turning while their eyes are on one frame | Answerable vigilance | *The Mix Follows the State* |
| 50 | Mark a let-through kickable cast by dropping a sound layer, never by adding a buzzer | The game stays unmuted, which keeps its cheapest information channel | Answerable vigilance | *Mistakes Remove Sound; They Don't Add It*, `buzzer` |

## The cost the soul names

| # | Mechanic | → Dynamic | → Tone | Serves |
|---|---|---|---|---|
| 51 | Extend `scripts/playtest.py` to sweep all three seats per dungeon and report where the same fight diverges | A mechanic change is checked from every window before it ships, instead of the least-played seat rotting quietly | Cool focus | *Balancing One Fight Three Times* |

---

## Ideas the soul rules out

Worth writing down, because they are the ones that will keep getting suggested.
Each fails a named check.

| Idea | Fails | Why |
|---|---|---|
| A damage or healing meter that ranks the party | **The Grade** | Answerable for your seat, told nothing about theirs. This is the rule WoW's meters broke, and the culture that followed is the evidence. |
| Making the AI party better as a difficulty *reduction* | **The Fallible Team** | A team competent enough that the seat stops mattering is this soul's tone killer. |
| Letting the healer taunt, or the tank command the AI healer | **The Seat** | A tool that does another seat's job removes the reason the seat was interesting. |
| Chat | `social_safety` | No levers, and no surface to moderate. Need may be visible, never sent. |
| Daily login rewards, energy, timers | `monetization_creep` | The career is a Generator across runs; a clock is not a bottleneck, it is a wall. |
| An auto-cast or assist that picks targets | `automation`, "Never Automate the Decision" | Targeting *is* the decision. Automating it deletes the game. |
| A cross-player leaderboard for `bestTicks` | `social_safety` vs `difficulty_ladder` | The soul resolves this conflict by keeping the ladder and dropping the comparison. |
| A crit or proc roll that can make a cast *fail* | **The Dice** (`legible_failure`) | Reward rolls are allowed, target rolls are allowed; a roll that decides whether your own action worked is not. |
