import { runDungeonTest } from "./test-dungeons.js";
import { runClassTest } from "./test-classes.js";
import { runSpellTestSuite } from "./test-spells.js";
import { runProgressionTest } from "./test-progression.js";
import { runBossSpikesTest } from "./test-boss-spikes.js";
import { runHealingStressTest } from "./test-healing-stress.js";
import { runTalentRoiTest } from "./test-talent-roi.js";
import { runFailStatesTest } from "./test-fail-states.js";
async function main() {
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
