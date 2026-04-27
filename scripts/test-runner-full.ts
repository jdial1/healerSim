import { runDungeonTest } from './test-dungeons.ts';
import { runClassTest } from './test-classes.ts';
import { runSpellTestSuite } from './test-spells.ts';
import { runProgressionTest } from './test-progression.ts';
import { runBossSpikesTest } from './test-boss-spikes.ts';
import { runHealingStressTest } from './test-healing-stress.ts';
import { runTalentRoiTest } from './test-talent-roi.ts';
import { runFailStatesTest } from './test-fail-states.ts';

async function main(): Promise<void> {
  await runDungeonTest({ condensed: false });
  runClassTest();
  runSpellTestSuite();
  runProgressionTest();
  runBossSpikesTest();
  runHealingStressTest();
  runTalentRoiTest();
  runFailStatesTest();
}

main().catch(console.error);
