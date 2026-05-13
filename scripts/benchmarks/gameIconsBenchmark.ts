
import { getIconUrlCandidates } from '../../src/gameIcons';

const icons = [
  'wow/inv_misc_questionmark',
  'wow/spell_holy_flashheal',
  'lorc/angel-outfit',
  'delapouite/regrowth',
  'skoll/rejuvenation'
];

function benchmark() {
  const iterations = 1000000;
  console.log(`Running benchmark with ${iterations} iterations...`);

  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    for (const icon of icons) {
      getIconUrlCandidates(icon);
    }
  }
  const end = performance.now();

  const totalIcons = iterations * icons.length;
  const duration = end - start;
  const opsPerSec = (totalIcons / duration) * 1000;

  console.log(`Total time: ${duration.toFixed(2)}ms`);
  console.log(`Ops/sec: ${opsPerSec.toLocaleString()}`);
}

benchmark();
