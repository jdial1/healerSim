// Asserts parity/golden.json is exactly what the JS engine produces right now.
//
// Two different failures land here, and the message says which:
//
//   1. The engine changed. The committed golden no longer describes it, so the
//      Android parity tests are checking Kotlin against a stale reference.
//   2. The generator is nondeterministic. Then the golden describes nothing at
//      all, and a green ParityTest means only "Kotlin matched one past roll".
//
// (2) was true until the tick's seeded rng was threaded through
// generateRandomParty: a run that ended rebuilt the party from Math.random
// *inside* the tick, so no two generations agreed. Byte equality, not 1e-6, is
// the point -- the Kotlin comparison already tolerates 1e-6 and would not
// notice drift smaller than that accumulating.
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const golden = fileURLToPath(new URL("../parity/golden.json", import.meta.url));
const generator = fileURLToPath(new URL("../parity/generate-golden.mjs", import.meta.url));
const backup = `${golden}.frozen-check-backup`;

// The generator writes in place, so keep the committed bytes safe and always
// put them back -- including when a regeneration throws.
copyFileSync(golden, backup);
const committed = readFileSync(backup);
let runs = [];
try {
  for (let i = 0; i < 2; i += 1) {
    execFileSync(process.execPath, [generator], { stdio: "ignore" });
    runs.push(readFileSync(golden));
  }
} finally {
  writeFileSync(golden, committed);
  rmSync(backup, { force: true });
}

if (!runs[0].equals(runs[1])) {
  console.error(
    "FAIL: parity/golden.json is not reproducible.\n" +
    "Two consecutive generations differ, so the file is a record of one past\n" +
    "dice roll rather than a specification. Find the unseeded randomness in the\n" +
    "JS engine before trusting any parity result."
  );
  process.exit(1);
}
if (!committed.equals(runs[0])) {
  console.error(
    "FAIL: parity/golden.json is stale.\n" +
    "It reproduces consistently, but not to the committed bytes -- the JS engine\n" +
    "changed. If that change was intended, regenerate and commit:\n" +
    "  node parity/generate-golden.mjs\n" +
    "and re-run the Android suite, because Kotlin must match the new reference."
  );
  process.exit(1);
}
console.log("golden.json: reproducible and matches the committed bytes");
