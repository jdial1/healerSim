import { runDungeonTest } from './test-dungeons.ts';
import { runClassTestCondensed } from './test-classes.ts';
import { runSpellTestCondensed } from './test-spells.ts';
import { runProgressionTest } from './test-progression.ts';
import { runBossSpikesTest } from './test-boss-spikes.ts';
import { runHealingStressTest } from './test-healing-stress.ts';
import { runTalentRoiTest } from './test-talent-roi.ts';
import { runFailStatesTest } from './test-fail-states.ts';
import { testPalette } from './testColors.ts';

const M = testPalette();

async function main(): Promise<void> {
  console.log(
    `${M.cyan}AEGIS.test${M.r} ${M.dim}condensed (dungeons + class + spells + progression + boss-spikes + stress + talent-roi + fail-states)${M.r}\n`,
  );
  await runDungeonTest({ condensed: true });
  console.log(`\n${M.yellow}[class]${M.r}`);
  runClassTestCondensed();
  console.log('');
  runSpellTestCondensed();
  console.log(`\n${M.yellow}[progression]${M.r}`);
  runProgressionTest();
  console.log(`\n${M.yellow}[boss-spikes]${M.r}`);
  runBossSpikesTest();
  console.log(`\n${M.yellow}[healing-stress]${M.r}`);
  runHealingStressTest();
  console.log(`\n${M.yellow}[talent-roi]${M.r}`);
  runTalentRoiTest();
  console.log(`\n${M.yellow}[fail-states]${M.r}`);
  runFailStatesTest();
}

main().catch(console.error);
