import { getIconUrlCandidates } from '../src/gameIcons';

const TEST_ICONS = [
  'wow/spell_holy_renew',
  'wow/spell_holy_flashheal',
  'delapouite/heart-beats',
  'lorc/skull-mask',
  'wow/inv_misc_questionmark',
  'unknown/icon'
];

function benchmark() {
  const iterations = 100000;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    for (const icon of TEST_ICONS) {
      getIconUrlCandidates(icon);
    }
  }

  const end = performance.now();
  const duration = end - start;
  const opsPerSec = (iterations * TEST_ICONS.length) / (duration / 1000);

  console.log(`Duration for ${iterations * TEST_ICONS.length} calls: ${duration.toFixed(2)}ms`);
  console.log(`Throughput: ${opsPerSec.toFixed(2)} ops/sec`);
}

console.log('Running benchmark...');
benchmark();
