## 2025-05-14 - [Icon Candidate Caching]
**Learning:** High-frequency components like `GameIcon` (rendered for each party member and action bar slot) can benefit significantly from caching string-manipulation results that don't change during combat. Although string concat is fast, doing it 100+ times every 100ms adds up.
**Action:** Use a simple global object for caching pure string-based logic that is frequently called in the render path.
