import { runDungeonTest } from './check-dungeons';
import { runClassTest } from './check-classes';
import { runSpellTestSuite } from './check-spells';
import { runFailStatesTest as runProgressionTest } from './audit-progression';
import { runBossSpikesTest } from './sim-boss-spikes';
import { runHealingStressTest } from './sim-stress-test';
import { runTalentRoiTest } from './audit-talents';
import { runFailStatesTest } from './audit-progression';

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
