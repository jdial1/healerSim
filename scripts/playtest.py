"""Play the game many times and report what happened, so tuning is not guesswork.

Runs the Kotlin bot in android/app/src/test (PlaytestHarness), which plays like
a competent player -- kicks what it can, switches to adds, dispels, uses its
defensive -- and prints one JSON line per run. This aggregates those lines.

    python scripts/playtest.py                                   # the usual sweep
    python scripts/playtest.py --classes MAGE --levels 12 --runs 20
    python scripts/playtest.py --hard --levels 3,8,12
    python scripts/playtest.py --by dungeon                       # group differently

Tuning a number, one value at a time (the content file is restored afterwards):

    python scripts/playtest.py --sweep hard.damageMultiplier=1.2,1.6,2.0
    python scripts/playtest.py --sweep addRules.bombFuseTicks=60,100,140 --runs 10

Every value it prints comes from the engine the app runs; nothing here models
the game itself.
"""
import argparse
import json
import os
import shutil
import statistics
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID = os.path.join(ROOT, 'android')
CONTENT = os.path.join(ANDROID, 'content', 'encounters.json')


def run_harness(classes, levels, runs, hard, pace, idle=False):
    """Plays the runs in one JVM and returns them as dicts."""
    cmd = [
        os.path.join(ANDROID, 'gradlew.bat' if os.name == 'nt' else 'gradlew'),
        ':app:testDebugUnitTest', '--tests', '*PlaytestHarness*',
        '-Dplaytest=1',
        f'-Dplaytest.classes={classes}',
        f'-Dplaytest.levels={levels}',
        f'-Dplaytest.runs={runs}',
        f'-Dplaytest.hard={"true" if hard else "false"}',
        f'-Dplaytest.pace={pace}',
        f'-Dplaytest.idle={"true" if idle else "false"}',
        # Gradle caches a task whose inputs have not changed; the properties are
        # not inputs, so a second sweep value would replay the first one's run.
        '--rerun-tasks',
    ]
    proc = subprocess.run(cmd, cwd=ANDROID, capture_output=True, text=True)
    out = proc.stdout + proc.stderr
    if 'PLAYTEST-BEGIN' not in out:
        sys.exit('the harness did not run:\n' + out[-4000:])
    body = out.split('PLAYTEST-BEGIN', 1)[1].split('PLAYTEST-END', 1)[0]
    return [json.loads(line) for line in body.splitlines() if line.strip().startswith('{')]


def summarise(rows, by):
    """One line per group: how it went, and how close it was."""
    groups = {}
    for r in rows:
        key = tuple(r[k] for k in by)
        groups.setdefault(key, []).append(r)

    print('  '.join(f'{k.upper():<10}' for k in by), end='  ')
    print(
        f'{"RUNS":>4} {"CLEAR":>6} {"TIME":>7} {"DEATHS":>7} {"MISSED":>7} {"LOWEST":>7} {"AIMANA":>7} {"XP":>6}'
        f'{"RES":>6} {"CAPPED":>7} {"MANA":>6} {"STUCK":>6}'
    )
    for key in sorted(groups):
        g = groups[key]
        cleared = [r for r in g if r['outcome'] == 'SUCCESS']
        rate = len(cleared) / len(g) * 100
        time = statistics.mean(r['ticks'] for r in cleared) / 10 if cleared else 0
        print('  '.join(f'{str(v):<10}' for v in key), end='  ')
        print(
            f'{len(g):>4} {rate:>5.0f}% {time:>6.1f}s '
            f'{statistics.mean(r["deaths"] for r in g):>7.2f} '
            f'{statistics.mean(r["missedKicks"] for r in g):>7.2f} '
            f'{statistics.mean(r["lowestHealthPct"] for r in g):>6.0f}% '
            f'{statistics.mean(r["aiHealerLowPct"] for r in g):>6.0f}% '
            f'{statistics.mean(r["xp"] for r in g):>6.0f}'
            f'{statistics.mean(r.get("resAvgPct", 0) for r in g):>5.0f}% '
            f'{statistics.mean(r.get("resCapPct", 0) for r in g):>6.0f}% '
            f'{statistics.mean(r.get("manaAvgPct", 0) for r in g):>5.0f}% '
            f'{statistics.mean(r.get("starvedPct", 0) for r in g):>5.0f}%'
        )


def set_value(path, value):
    """Sets one dotted key in encounters.json, e.g. hard.damageMultiplier."""
    with open(CONTENT, encoding='utf-8') as f:
        content = json.load(f)
    node = content
    parts = path.split('.')
    for p in parts[:-1]:
        node = node[p]
    node[parts[-1]] = json.loads(value)
    with open(CONTENT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(content, f, indent=2, ensure_ascii=False)
        f.write('\n')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--classes', default='PRIEST,MAGE,WARRIOR')
    ap.add_argument('--levels', default='3,8,12,20,34,47')
    ap.add_argument('--runs', type=int, default=5)
    ap.add_argument('--pace', default='normal')
    ap.add_argument('--hard', action='store_true', help='play the cleared-it-already version')
    ap.add_argument('--idle', action='store_true', help='the player does nothing: does the seat matter?')
    ap.add_argument('--by', default='cls,level', help='what to group the report by')
    ap.add_argument('--sweep', help='KEY=v1,v2,... in encounters.json, one report per value')
    ap.add_argument('--json', help='write the raw runs here as well')
    args = ap.parse_args()

    by = args.by.split(',')
    rows = []
    if args.sweep:
        key, values = args.sweep.split('=', 1)
        backup = CONTENT + '.playtest.bak'
        shutil.copy(CONTENT, backup)
        try:
            for value in values.split(','):
                set_value(key, value)
                print(f'\n=== {key} = {value} ===')
                batch = run_harness(args.classes, args.levels, args.runs, args.hard, args.pace, args.idle)
                for r in batch:
                    r[key] = value
                summarise(batch, by)
                rows += batch
        finally:
            shutil.move(backup, CONTENT)
    else:
        rows = run_harness(args.classes, args.levels, args.runs, args.hard, args.pace, args.idle)
        summarise(rows, by)

    if args.json:
        with open(args.json, 'w', encoding='utf-8') as f:
            json.dump(rows, f, indent=2)
        print(f'\nwrote {len(rows)} runs to {args.json}')


if __name__ == '__main__':
    main()
