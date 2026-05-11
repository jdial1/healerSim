## 2025-05-15 - Memoized Icon URL Candidates
**Learning:** `getIconUrlCandidates` is called frequently in high-density UI lists (like the combat grid or buff displays). Caching its results prevents repeated string template processing and array allocations.
**Action:** Use a module-level `Map` to memoize the results of expensive pure functions in the render path.
