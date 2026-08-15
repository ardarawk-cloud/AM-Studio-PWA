# AM STUDIO — Google Play Release Checklist

## Distribution separation
- Owner Beta package: `com.ardacore.amstudio.v2`.
- Google Play public package: `com.ardacore.amstudio`.
- Play build sets `AM_STUDIO_PLAY_MODE=true`.
- Play build must hide/block Admin, upload, page control, production staging, and other owner-only tools.
- Play Reader must use public catalog/assets only.

## Android technical gate
- compileSdk: 36.
- targetSdk: 36.
- minSdk: 26.
- Release build must be non-debuggable.
- Cleartext traffic disabled.
- WebView debugging disabled in release.
- No unnecessary sensitive permissions.
- Build Android App Bundle (`.aab`) for Play upload.
- Every Play upload must use a monotonically increasing versionCode.

## Signing
- Generate one dedicated AM STUDIO Google Play upload keystore.
- Never commit keystore/passwords to Git.
- Store signing material only as protected GitHub Actions secrets or an equivalent secure secret store.
- Enroll the Play app in Play App Signing.
- Keep a secure offline backup of the upload key and recovery information.
- CI must fail rather than silently produce a Play candidate without the protected upload key.

Required repository secrets:
- `AM_STUDIO_ANDROID_KEYSTORE_B64`
- `AM_STUDIO_ANDROID_KEYSTORE_PASSWORD`
- `AM_STUDIO_ANDROID_KEY_ALIAS`
- `AM_STUDIO_ANDROID_KEY_PASSWORD`

## Privacy / App content
- Public privacy policy is live at `/privacy-policy.html`.
- Privacy policy is reachable from inside the Play Reader.
- Complete the Play Console Data safety form using a final production audit.
- Complete the IARC content-rating questionnaire based on all content accessible in the submitted build.
- AM STUDIO is not to be declared as a child-directed app unless product strategy and content change substantially.
- Complete Ads declaration, App access, Target audience, Content rating, and all other required App content forms.

## Content-readiness gate
- `public/play-release.json` must remain `playReady:false` until Arda explicitly approves Play submission.
- Public reader must not expose draft/recovery/QC-pending content as released content.
- Every visible episode must have final reader assets and be `CANON_FINAL + QC_PASS`.
- Remove or hide development-only series/cards from the Play Reader.
- Test every visible episode from first page through final page.
- Confirm no broken images, placeholder-only reader pages, or dead navigation paths.

## Minimum-functionality / quality gate
- Reader must provide meaningful original AM STUDIO content, not merely an empty shell or placeholder catalog.
- Search, Library, Collection, progress, reader navigation, and downloads (where offered) must function reliably.
- Test cold start, slow connection, offline/error screen, back navigation, rotation/resume, and external links.
- Review the build on at least one Android 14+ device and one additional supported Android version when possible.

## Store assets
- Play app icon: 512 x 512 PNG.
- Feature graphic: 1024 x 500 JPEG or 24-bit PNG without alpha.
- Minimum 2 phone screenshots; prepare at least 4 strong portrait screenshots from the actual Play Reader.
- Recommended screenshots: Home, Library/Search, Series/Episodes, Reader, Collection.
- Do not show Admin/production screens in public store graphics.
- Store graphics must avoid graphic violence or otherwise unsuitable promotional imagery even if in-app content receives a mature rating.

## Release sequence
1. Internal test.
2. Closed test if required for the developer account.
3. Resolve crashes, broken links, privacy/data-safety discrepancies, and content-rating issues.
4. Arda changes `ownerReleaseApproval` and `playReady` to true only after final review.
5. Run `AM STUDIO Play Store Candidate` workflow.
6. Upload the signed AAB to Play Console.
7. Complete review declarations and staged rollout.

## Hard rule
A successful Android build is not the same as Play approval. Do not label a release `PLAY_READY` until technical, content, privacy, store-listing, signing, and owner-approval gates are all complete.
