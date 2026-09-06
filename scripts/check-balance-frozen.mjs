// Asserts the healer-era tuning in src/data/balance.json has not moved.
//
// Role work adds new top-level keys (threat, roles). Everything else describes
// a game that is finished and shipped, and the parity corpus was generated
// against those exact numbers. A drive-by tweak to, say, partyDps while tuning
// threat would silently re-balance the healer game and invalidate the goldens
// for a reason nobody would think to look for.
//
// So: hash every key except the role blocks. Changing a healer number is still
// allowed -- it just has to be deliberate enough to update the hash here, which
// puts it in the diff where a reviewer will see it.
//
// It has moved once, deliberately: adding combat.shared.globalCooldownTicks.
// The global cooldown applies to every class including the healers, which is a
// real change to the shipped healer game and is why the cross-engine tick
// contract ended at the same time -- see TickParityTest.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROLE_KEYS = new Set(["threat", "roles"]);
const EXPECTED = "b70356ed7b4036665b59214f3a403b9612664c362f1ff6a265adff08505c71e7";

const path = fileURLToPath(new URL("../src/data/balance.json", import.meta.url));
const all = JSON.parse(readFileSync(path, "utf8"));
const frozen = Object.fromEntries(
  Object.entries(all).filter(([k]) => !ROLE_KEYS.has(k))
);

// Key order must not matter, so sort before hashing. Note this is deliberately
// JSON.stringify's number formatting, not any other language's: 1.0 serialises
// as "1" here, so EXPECTED must be produced by this script and no other.
const canonical = JSON.stringify(sortDeep(frozen));
const actual = createHash("sha256").update(canonical).digest("hex");

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
  }
  return v;
}

if (actual !== EXPECTED) {
  console.error(
    "FAIL: the healer-era keys in src/data/balance.json changed.\n" +
    `  expected ${EXPECTED}\n` +
    `  actual   ${actual}\n\n` +
    "Role tuning belongs under the new top-level keys (threat, roles), which are\n" +
    "excluded from this hash. If you did mean to re-balance the healer game,\n" +
    "update EXPECTED here in the same commit, and regenerate parity/golden.json --\n" +
    "it was generated against the old numbers."
  );
  process.exit(1);
}
console.log(`balance.json: healer-era keys unchanged (${Object.keys(frozen).length} blocks)`);
