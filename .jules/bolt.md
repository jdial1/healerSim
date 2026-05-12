## 2026-05-12 - Icon URL Candidates Caching
**Learning:** The `getIconUrlCandidates` function was performing redundant string parsing and array allocations on every call, even for the same `iconPath`. Memoizing these results in a module-level `Map` significantly improved throughput (~20x speedup).
**Action:** Use memoization for pure functions that are called frequently in the render path, especially those involving string manipulation or complex object creation.

## 2026-05-12 - Environment Compatibility for Utility Scripts
**Learning:** Accessing `import.meta.env` directly in utility files can cause `TypeError` when running scripts outside of a Vite environment (e.g., via `tsx`).
**Action:** Always guard `import.meta.env` access (e.g., `import.meta.env?.BASE_URL ?? '/'`) in shared modules to ensure compatibility with both browser and CLI environments.
