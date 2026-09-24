# Overheal's soul

Profiled against the Game Souls library (`~/game_souls`) using the procedure in
`LLM_SOUL_GUIDE.txt`. This is a design document, not a plan: it records where
the game already stands, what the library says is missing, and the one mechanic
that would kill its tone. Every claim cites something in this repo.

**Philosophy: every seat is judged by what it costs the other four.**

On the surface this is an MMO dungeon in a phone. Beneath it, each of the three
roles is the same simulation read through a different hole: the healer sees the
boss only in what it does to the party, the tank measures itself in damage the
healer never has to chase, and the damage dealer's best rotation is not the
fastest one. The score is not what you did. It is what you wasted -- the game is
named after its own waste metric.

**Verdict: its own soul.** Overheal is the reference game for **Vigil**
(`souls/vigil.txt`), a soul the library did not have. No existing soul reaches
four of six axis matches against it (Containment 3.5, Spire 3.0, Loathing 2.0)
and three residue items are uncovered, which is both halves of the New Soul
condition in `LLM_SOUL_GUIDE.txt` Step 5. It is **not** a Loathing game and
should not be made into one; see "Why not Loathing" below.

The three pillars below are Vigil's signature pillars, written here in terms of
this repo. The soul file states them generally, for any game that seats a player
in a team it cannot command.

## Verb inventory

| Verb | What the player literally does | Kinetic profile |
|---|---|---|
| Target | Tap a party frame, or drag a spell onto one | Instant, cancellable |
| Cast | Press a spell on the bar; some have a cast time | Deliberate; committed once the bar starts |
| Spend | Pick talents, one charm, one consumable, a pace, a keystone level | Menu-driven, out of combat only |

The first two are the game. The third is where the build lives, and it is
entirely pre-run: `Participant.carriedUsed` refuses a second consumable, and a
charm "moves cooldowns, so swapping mid-fight would be a free reset."

## Axis positions

| Axis | Position | Evidence |
|---|---|---|
| Failure | **Costly** | A wipe returns a fraction of the XP (`xp.failureFractionWhenOnePullCleared` 0.2 → 0.5) and spends the consumable, "since you drank it". A wipe never takes a keystone level away. |
| Information | **Total (state) / Taught (rules)** | Frames show exact health and every debuff; boss attacks carry a `tell`; affixes are "named on the queue sheet before you commit". But talent and charm coefficients live in `balance.json`, not in the UI. |
| Authorship | **Player-Authored Build** | Talent tree with a free respec, one charm, one consumable, pace, keystone. `Participant.effect(key)` sums talents and charm through one funnel. |
| Power | **Optimization, with a Custodial edge** | Prestige is efficiency -- `RunStats.hps`, `hpm`, `overhealPct`, `bestTicks`. But the player holds one seat of five and cannot command the other four. |
| Tone | **Answerable Vigilance** | Scanning four things you did not set in motion, calm only while you stay ahead of them, and the one asked about it when it goes wrong. `DungeonOutcomeKind.HEALER_DOWN` is its own outcome. |
| Structure | **Career** | Runs feeding one character who levels 1–48 and never resets. Not Runs (progress persists), not a Rebirth Account (nothing rebirths). |

Both of those positions were missing from the library and were added for this
profile. `axes/tone.txt` had Watchful Calm, but Containment's calm is earned by a
design you built and its reward is permission to look away; this calm is held
while somebody else drives and looking away is never the reward.
`axes/structure.txt` had Runs and Rebirth Account; the levelled career is
neither.

Their absence is also what settles the verdict. No soul holds either position, so
every soul is capped at four axis matches against Overheal and none reaches it.

## Components

| Component | Strength | Tuning |
|---|---|---|
| `scarcity_economy` | **Core** | One hard bottleneck: mana. Topology is a **Drain inside a run, Generator across the career** -- mana only shrinks until the fight ends; XP, charms and the stash only grow. |
| `synergy_engines` | **Core** | Talents and charms share the same effect keys, so anything a talent can do to a spell a charm can. Multiplicative through `Participant.effect`. |
| `difficulty_ladder` | **Core** | Keystones (one affix per level, fixed not rolled, "it runs out at the size of the affix pool"), hard-mode affixes, endless scaling, and three paces priced against XP. |
| `legible_failure` | **Supporting, under-tuned** | Intent is telegraphed (`tell`), state is exact. But `DungeonOutcome` counts `deaths` and `missedKicks` and never names a cause. See the gaps. |
| `audio_information` | **Supporting** | `Feedback.kt`: a cast sounds like what it does, and there is deliberately no sound per heal tick, "at ten ticks a second that is noise". |
| `trusting_the_player` | **Supporting** | No quest arrows, no waypoints. `TutorialOverlay` is one card per page visit, which is an on-ramp rather than hand-holding. |
| `social_safety` | **Supporting** | No chat, no rankings, no typed names, opt-in queue, "the AI fills whatever is empty, so the lobby never says waiting for players". |
| `interface_voice` | **Trace** | The store copy and the settings row both say what leaves the device. Not yet a stated copy rule in the code. |
| `workbench` | **Absent** | The gap that matters most. See below. |

**Relationship conflict, resolved:** `difficulty_ladder` conflicts with
`social_safety` (leaderboards and ranking). Overheal resolves it the right way
already -- prestige is recorded per character in `DungeonRecord` (`bestTicks`,
`clean`, `sharp`) and compared against nobody. Keep it that way.

## Signature pillars (the residue)

Three things the axes and components do not explain. These are the game's own.

### 1. The seat you do not hold

`components/automation.txt` hands the player's *repeated action* to the machine
so the player keeps the decision. Overheal does the opposite: it hands *other
agents' decisions* to the machine, and the player's job is to absorb them. The
tank picks its own defensive; you cannot command it.

**Design rules:**

- **The hole is the job.** Each role exists because of what the other four
  cannot do. A feature that lets the player do somebody else's job -- a healer
  who can taunt, a tank who can command the AI healer -- removes the reason the
  seat is interesting.
- **The AI answers, it never covers.** The party must be competent enough that
  a run is playable and incompetent enough that the seat matters.
- **No handover path.** A human who stops answering becomes `isHuman = false`
  and the AI resumes their damage. A separate "somebody left" path would only
  run when something had already gone wrong, which is the worst kind to have.

### 2. Waste is the score

Most games measure output. This one measures the fraction of your output that
did nothing, and then makes that fraction playable: overheal generates no
threat, and a Priest turns it into a shield
(`divinityOverhealToShieldPerRating`).

**Design rules:**

- **Name the waste, then price it.** Every role gets a metric for effort that
  achieved nothing, and at least one build that buys some of it back.
- **A pure-upside reward is a reward nobody thinks about.** Most charms carry a
  cost for this reason -- "a charm that is pure upside is one everybody wears".
- **Never round the waste away.** `overhealPct` is reported, not hidden. A
  number the player would rather not see is the one worth showing.

### 3. One engine, three information problems

Role is not a button set. It changes what is *observable*. The healer's boss is
inferred from party health; the tank's is read directly off threat.

**Design rules:**

- **Change the window, not just the verbs.** A new role earns its place by
  making the same fight a different reading problem.
- **Each role gets its own signature stat, and the sheet says what it buys.**
- **One reducer, all seats.** `(state, action, rng) -> state` with actor-tagged
  actions, and `GameState.actingAs(unitId)` for whoever is casting. Three roles
  that shared no code would drift into three balance problems.

## Gaps, prioritized

Ranked as `LLM_SOUL_GUIDE.txt` Step 11 requires: tone killers, then structural
conflicts, then component gaps, then pitfalls. Each is traced
*mechanic → dynamic → tone*.

### 1. Tone killer: the AI healer has throughput limits but no judgment limits

This is `pitfalls/covering_party.txt`, and it is the pitfall Vigil is most
exposed to.


`aiHealerHealBelowFraction` is 0.92 -- the AI healer tops up anyone under 92%.
It is limited by mana and heal size (`aiHealerMaxMana`, `aiHealerHeal`), never
by decision. So in a tank or damage run the healer is a resource pool, not a
teammate who can be wrong, and the player's threat play is graded only on
whether that pool held out. **An AI party competent enough that the seat does
not matter is this soul's tone killer.**

*Give the AI healer a reaction delay and a triage order it can get wrong →
players start taking damage personally, because nobody is silently covering for
them → answerable vigilance.*

### 2. Core component absent: the workbench

`components/workbench.txt` says ship the tools players would otherwise build
outside. Loathing's answer is "let the community write the wiki" -- unavailable
here, because a solo offline Android game has no community to write one.
`balance.json` holds several hundred coefficients the player can never see.
That is `pitfalls/hidden_math.txt` and `pitfalls/outside_tool.txt` waiting.

*Put a forecast on the talent screen -- this build's HPS, HPM and time-to-empty
against the selected dungeon's scripted damage → builds get compared in the app
instead of by wiping and guessing → cool focus.*

### 3. `legible_failure` is under-tuned: nothing names a cause

`deaths` and `missedKicks` are counted and thrown at the record. Spire's whole
promise is "every loss is your fault, and you can prove it"; Overheal currently
delivers the first half.

*On a wipe, print a receipt -- who went down first, the three largest hits they
took, and which of your cooldowns were up when it happened → players stop
saying "it spiked" and start saying "I held that nine seconds too long" →
answerable vigilance.*

### 4. Pitfall with evidence: grind disguised as progress

Levels 1–48 are height, not width, and
`partyDamageFromDungeonLevelGap.multiplierPerPartyLevelOverDungeonMax` exists
because over-levelling a hard dungeon is the obvious answer to it.
`xp.overlevelDiminishingBase` already fights this, so the tension is known.

*State in the docs that keystones are the intended ladder and levels are the
on-ramp, and surface `bestTicks`, `clean` and `sharp` outside the records screen
→ the top of the game becomes "the same place, harder, faster, nobody down"
rather than "a higher number" → cool focus.*

### 5. Missing from `difficulty_ladder`: restriction runs

The ladder has rungs (keystones) and an efficiency measure (`bestTicks`) but no
self-imposed friction. `pacing.json` is the precedent: friction already priced
against XP.

*Add queue-sheet toggles -- no consumable, no charm, no potion -- each with its
own XP multiplier → experts choose to make the fight harder instead of waiting
for content → cool focus.*

## Why not Loathing

Overheal scores 2/6 axes against `souls/loathing.txt` (Authorship, Power).
Loathing's two lead pillars are Weaponized Absurdity and Subversive Archetypes,
and both are ruled out by what this game sells: `store/listing.md` states the
strategy outright -- *"the vocabulary only they use: triage, overheal, threat,
taunt, rage, combo points, rotation."* Loathing's joke is load-bearing because
its audience arrives with no expectation to be faithful to. Overheal's theme is
load-bearing for the opposite reason: a thirty-two-node talent tree is legible
without a tutorial only because "Holy Priest" pre-loads the whole schema.

The Loathing rules that do apply here are not Loathing's. They live in
`components/` -- `scarcity_economy`, `difficulty_ladder`, `synergy_engines`,
`trusting_the_player` -- and Spire and Containment use them too.

## Litmus test

Vigil's litmus test (`souls/vigil.txt`), phrased for this game. Run a feature
through it before building it.

| Check | Question | Correct answer |
|---|---|---|
| **The Seat** | Could the player do this alone, or use it to do another seat's job? | **No.** The hole is the job. |
| **The Fallible Team** | Can the AI party be wrong in a way the player can feel and name? | **Yes.** A teammate who only runs out of mana is furniture. |
| **The Waste** | Does this make it possible to spend effort that achieves nothing? | **Yes.** Waste has to be possible before efficiency can be a skill. |
| **The Window** | Does this change what a role can observe, or only which buttons it presses? | **Observe.** Buttons alone are a reskin. |
| **The Grade** | Does the game tell the player how well anybody else played? | **No.** Answerable for your seat, told nothing about theirs. |

Two checks from the earlier draft moved into components rather than the soul:
"after a wipe, can the player name the cause" is `legible_failure`'s litmus, and
"is this reward pure upside" is `scarcity_economy`'s. Both still apply -- they are
just not what makes this game *this* soul.

*"You do not need to see the boss when you can see five health bars, a mana pool
that will not last, and the exact moment you healed somebody who was already
full."*
