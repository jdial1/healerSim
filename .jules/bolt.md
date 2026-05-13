## 2026-05-13 - Icon URL Resolution Memoization
**Learning:** The `getIconUrlCandidates` function is a pure, high-frequency computation (called per-icon per-render) that involves string parsing and array mapping. Without memoization, it scales linearly with the number of icons rendered in the `HealGrid` and `ActionBars` every 100ms tick. Using a module-level `Map` for caching provides a massive (~700x+) throughput increase in micro-benchmarks.
**Action:** Always memoize pure, repetitive string/URL resolution logic that sits in the hot path of the 100ms game loop.

## 2026-05-13 - Environment Guards for Vite Globals
**Learning:** Accessing `import.meta.env.BASE_URL` directly causes crashes in non-Vite environments (e.g., running scripts via `tsx`).
**Action:** Always use optional chaining and provide a fallback (e.g., `import.meta.env?.BASE_URL ?? '/'`) when accessing Vite-specific globals in utility files that might be imported by CLI tools or test runners.
