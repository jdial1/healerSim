// A seeded xorshift128 PRNG, duplicated bit-for-bit in the Kotlin port's Rng.kt.
//
// The two engines cannot share Math.random / kotlin.random.Random — they are
// different algorithms — so parity scenarios drive both sides through this.
// Every operation is forced to 32-bit signed integer semantics (Math.imul, |0,
// >>>) so it matches Kotlin's Int arithmetic exactly.

const step = (s) => (Math.imul(s, 1664525) + 1013904223) | 0;

function mix(v) {
  let h = v | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b | 0);
  h ^= h >>> 16;
  return h | 0;
}

export class Rng {
  constructor(seed) {
    let s = seed === 0 ? 0x9e3779b9 | 0 : seed | 0;
    this.x = mix(s); s = step(s);
    this.y = mix(s); s = step(s);
    this.z = mix(s); s = step(s);
    this.w = mix(step(s));
    if (((this.x | this.y | this.z | this.w) | 0) === 0) this.x = 1;
  }

  nextBits() {
    const t = (this.x ^ (this.x << 11)) | 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = ((this.w ^ (this.w >>> 19)) ^ (t ^ (t >>> 8))) | 0;
    return this.w;
  }

  /** Uniform in [0, 1), matching Math.random's contract. */
  next() {
    return (this.nextBits() >>> 0) / 4294967296;
  }

  /** Bound to a plain function for APIs that expect a `random` callback. */
  fn() {
    return () => this.next();
  }

  nextInt(min, max) {
    if (max <= min) return min;
    return min + Math.min(Math.floor(this.next() * (max - min + 1)), max - min);
  }

  pick(items) {
    return items[Math.min(Math.floor(this.next() * items.length), items.length - 1)];
  }
}
