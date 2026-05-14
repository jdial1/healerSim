## 2025-05-15 - Icon URL Memoization
**Learning:** The `getIconUrlCandidates` function is a pure computation that was being called frequently during render cycles, especially for the HealGrid and ActionBars. Memoizing it with a simple Map cache significantly reduces string manipulation and array allocation overhead.
**Action:** Use module-level caches for pure, high-frequency utility functions that derive data from static strings or constants.
