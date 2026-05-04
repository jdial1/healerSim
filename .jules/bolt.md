# Bolt's Journal - Aegis Performance

## 2025-05-04 - High-Frequency UI Optimization
**Learning:** In a game with a high-frequency tick rate (100ms), UI components that appear static (like buff/debuff icons) are actually being re-rendered and re-evaluated constantly. Even small overheads in icon path resolution and component rendering accumulate across many units and icons.
**Action:** Use `React.memo` for leaf components in the game grid to prevent unnecessary DOM updates when props are stable. Implement global caching for pure utility functions (like `getIconUrlCandidates`) that perform string manipulation or object allocation on every render.
