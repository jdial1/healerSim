# Checkpoints

Archived builds kept at points worth being able to return to.

## `overheal-roles-2.0-debug-signed.apk`

The role-based game: nine classes across three roles, three per role with the
third of each new role not yet built. Threat model, player damage, active
mitigation, an AI healer and an editable spellbook.

| | |
|---|---|
| Variant | `debug` |
| Size | 13 MB |
| sha256 | `eb6874e58d3944ae9e839315a6fa805295e83c0f7ec3d794f1d75faa3e9eca90` |
| Verified | golden byte-identical, balance guard, 77 Kotlin tests, `minifyReleaseWithR8` save contract, `npm test` / `npm run tests` / web build |

Debug-signed, exactly as the 1.0 checkpoint below is, and for the same reason —
see the warning there before installing or distributing it.

## `overheal-healer-1.0-checkpoint-debug-signed.apk`

The healer-only game, frozen at the point the repository split: web app complete
and frozen, Android about to grow tank and DPS roles.

| | |
|---|---|
| Commit | the tag `healer-1.0-checkpoint` |
| Variant | `debug` |
| Size | 13 MB |
| sha256 | `6780b1dfad6e96850261ee07cd67d288a81bb93bcfb0b0f56c01ebf2df9468a5` |
| Verified | `npm test`, `npm run build`, 18 Android unit tests (parity included), all green |

### Read the name before you install this

It is **debug-signed**, with the standard public Android debug key. That key is
public and universally known, so this signature proves nothing about origin.

It is therefore:

- fine to sideload for review or archival,
- **not** a Play-uploadable artifact,
- **not** R8-minified, so it is ~3.5× the size of a release build and does not
  represent shipping performance or code shape.

A release-signed checkpoint needs the upload keystore, which is deliberately not
in this repository (`android/.gitignore` excludes `keystore.properties`, `*.jks`
and `*.keystore`) and is not something this tooling should generate. To produce
one, configure signing per `android/RELEASE.md` and run `:app:assembleRelease` —
the `requireReleaseSigning` guard will refuse rather than emit an unsigned build.

### On committing binaries here

Git cannot delta-compress an APK, so each one committed adds its full size to the
repository permanently. One checkpoint is a reasonable trade for being able to
`git checkout` a tag and have the exact build beside the exact source. A habit of
committing every build is not — prefer a tag plus a GitHub Release asset, which
is what `.github/workflows/release.yml` already does for the AAB.
