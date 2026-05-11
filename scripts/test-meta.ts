import { runDungeonTest } from './check-dungeons';
import { runClassTestCondensed } from './check-classes';
import { runSpellTestCondensed } from './check-spells';
import { runFailStatesTest as runProgressionTest } from './audit-progression';
import { runBossSpikesTest } from './sim-boss-spikes';
import { runHealingStressTest } from './sim-stress-test';
import { runTalentRoiTest } from './audit-talents';
import { runFailStatesTest } from './audit-progression';
import { testPalette } from './testColors';

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
  runFailStatesTest();
  console.log(`\n${M.yellow}[boss-spikes]${M.r}`);
  runBossSpikesTest();
  console.log(`\n${M.yellow}[healing-stress]${M.r}`);
  runHealingStressTest();
  console.log(`\n${M.yellow}[talent-roi]${M.r}`);
  runTalentRoiTest();
  console.log(`\n${M.yellow}[fail-states]${M.r}`);
}

main().catch(console.error);
