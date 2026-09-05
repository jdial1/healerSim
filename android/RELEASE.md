# Releasing Aegis

## What the build guarantees

Three failures used to be silent and are now build errors:

| Guard | Catches |
|---|---|
| `requireReleaseSigning` | A release build with no keystore. It used to emit an **unsigned** AAB that Play rejects at upload. |
| `verifyGameAssets` | A checkout that never ran `npm run prebuild`. Icons are downloaded, not committed, and `IconLoader` falls back to a placeholder — so the build succeeded and the app merely looked broken. |
| `verifyMinifiedSaveContract` | R8 renaming an enum constant. `SaveStore` writes the class as `cls.name` and reads it back with `PlayerClass.valueOf`; if R8 renames `PRIEST`, `load()` throws, falls back to an empty `Roster`, and **every player silently loses their character**. Verified: removing the keep rule in `app/proguard-rules.pro` makes R8 rename all of them. The break is invisible on a fresh install and appears only on the second launch. |

The last of these needs no secrets — it runs on `:app:minifyReleaseWithR8` — so
it is part of the normal PR build, not just the release one.

## Versioning

`versionCode` and `versionName` are never edited by hand.

- `versionCode` comes from `AEGIS_VERSION_CODE`, which CI sets to
  `1000 + github.run_number`. It must be strictly monotonic and can never be
  reused: Play rejects a repeat upload outright, including a re-upload after a
  failed review, and `run_number` increments on re-runs too.
  Bump the `1000` base if the release workflow file is ever renamed or
  recreated, since that resets `run_number`.
- `versionName` comes from `AEGIS_VERSION_NAME`, set from the git tag with the
  leading `v` stripped (`v1.0.0` → `1.0.0`). The splash screen renders it.
- Local builds get `versionCode = 1` and the `versionName` literal in
  `app/build.gradle.kts`. That is deliberate: a hand-built artifact is not
  uploadable, so nothing can bypass CI.

## Signing

You generate and hold the keystore. Nothing in this repo creates one.

```bash
keytool -genkeypair -v -keystore upload.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias upload
```

Then either copy `keystore.properties.example` to `keystore.properties` and fill
it in (local), or set the four `AEGIS_*` environment variables (CI).

For GitHub Actions, add these as repository secrets:

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 upload.jks` — no line wrapping, or the decode fails cryptically |
| `KEYSTORE_PASSWORD` | store password |
| `KEY_ALIAS` | `upload` |
| `KEY_PASSWORD` | key password |

Back the keystore and its passwords up to a password manager **and** somewhere
offline before the first upload. Enrol in Play App Signing at first upload:
Google then holds the app signing key, and this becomes only the upload key —
the one key that can be reset if it is ever lost.

## Cutting a release

```bash
git tag v1.0.0 && git push origin v1.0.0
```

The `Release` workflow builds a signed AAB and uploads it, together with
`mapping.txt`, as a run artifact. Download both, upload the AAB to the Play
**internal testing** track first, and let review pass there before promoting.

Keep every `mapping.txt`. Android Vitals crash stacks for a version are
unreadable without the mapping from that exact build, and it is the only crash
reporting this app has — deliberately, since adding Crashlytics would mean an
`INTERNET` permission and a Data Safety answer that is no longer
"no data collected".
