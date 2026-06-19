import { runDungeonTest } from "./test-dungeons.js";
import { runClassTestCondensed } from "./test-classes.js";
import { runSpellTestCondensed } from "./test-spells.js";
import { runProgressionTest } from "./test-progression.js";
import { runBossSpikesTest } from "./test-boss-spikes.js";
import { runHealingStressTest } from "./test-healing-stress.js";
import { runTalentRoiTest } from "./test-talent-roi.js";
import { runFailStatesTest } from "./test-fail-states.js";
import { testPalette } from "./testColors.js";
const M = testPalette();
async function main() {
  console.log(
    `${M.cyan}AEGIS.test${M.r} ${M.dim}condensed (dungeons + class + spells + progression + boss-spikes + stress + talent-roi + fail-states)${M.r}
`
  );
  await runDungeonTest({ condensed: true });
  console.log(`
${M.yellow}[class]${M.r}`);
  runClassTestCondensed();
  console.log("");
  runSpellTestCondensed();
  console.log(`
${M.yellow}[progression]${M.r}`);
  runProgressionTest();
  console.log(`
${M.yellow}[boss-spikes]${M.r}`);
  runBossSpikesTest();
  console.log(`
${M.yellow}[healing-stress]${M.r}`);
  runHealingStressTest();
  console.log(`
${M.yellow}[talent-roi]${M.r}`);
  runTalentRoiTest();
  console.log(`
${M.yellow}[fail-states]${M.r}`);
  runFailStatesTest();
}
main().catch(console.error);
