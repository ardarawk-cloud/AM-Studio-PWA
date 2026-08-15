# AM STUDIO — Google Play Data Safety Draft

Status: DRAFT / NOT SUBMISSION-LOCKED.

This file documents the current public Play Reader design. Re-audit the actual production build, Worker routes, Cloudflare settings, and every third-party SDK immediately before submitting the Data safety form.

## Public reader architecture
- Public Play application ID: `com.ardacore.amstudio`.
- Owner/beta application ID remains separate: `com.ardacore.amstudio.v2`.
- Play build is reader-only.
- Admin, production upload, Canon Brain controls, and private staging are blocked in the Play build.
- Public reader currently has no user account creation or login.

## Data stored locally on device
- Favourite series / My Collection.
- Reading progress.
- WebView/app storage needed to provide the reader experience.

Current reader code stores favourites and reading progress locally and does not intentionally sync those values to a user account.

## Network processing
The app loads catalog metadata, pages, images, and other reader assets over HTTPS from AM STUDIO infrastructure. Standard request metadata can be processed by the hosting/security infrastructure, including network address, user-agent, request time, and security information.

Before Play submission, determine the correct Google Play Data safety treatment for infrastructure/security logs based on actual retention and service-provider configuration. Do not mark a data type as collected or not collected based only on this draft.

## Permissions / sensitive device data
Current public Android manifest intentionally requires only Internet permission.

The public Play build is not intended to access:
- precise or approximate device location;
- contacts;
- SMS or call logs;
- microphone;
- camera;
- broad photo/media library permission;
- advertising ID.

The beta/owner build contains a user-triggered file chooser for production upload. Play mode blocks this chooser and does not expose production upload UI.

## Advertising
Current public reader design has no third-party advertising network and does not intentionally use the advertising ID.

## Accounts
Current Play Reader has no public account system. Google Play account-deletion requirements should be re-evaluated if account creation/login is introduced later.

## Downloads
When a user explicitly starts a supported download, Android DownloadManager stores the file in the app-specific external downloads area. This is initiated by the user.

## Third parties / infrastructure
AM STUDIO currently uses Cloudflare infrastructure for app delivery, Worker execution, storage, and network protection. Review all active bindings/services before submission.

## Mandatory final audit
1. Inspect the final signed Play AAB and manifest permissions.
2. Inspect all production network endpoints and third-party SDKs.
3. Confirm whether Cloudflare analytics/logging is active and its retention.
4. Confirm there are no ad, analytics, crash-reporting, tracking, or authentication SDKs not represented here.
5. Confirm favourites/progress remain local-only.
6. Confirm Play build cannot reach Admin/upload/production controls.
7. Make the Play Console Data safety answers match `public/privacy-policy.html` and actual runtime behavior exactly.
