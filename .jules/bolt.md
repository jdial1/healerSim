## 2025-05-14 - [Game Tick Rendering Pressure]
**Learning:** High-frequency game ticks (100ms) cause massive re-render pressure on UI components like `GameIcon` even when props haven't changed, due to parent state updates.
**Action:** Use `React.memo` for low-level UI components and implement global caches for expensive string/array transformations (like icon URL generation) to avoid redundant allocations every 100ms.
