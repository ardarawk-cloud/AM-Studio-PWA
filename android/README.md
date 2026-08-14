# AM STUDIO Android

Official hybrid Android shell for AM STUDIO.

## Architecture
- Web core remains hosted by the AM STUDIO Cloudflare Worker.
- Android provides the native application shell, file picker, secure download bridge, navigation isolation, retry/error handling, launcher icon, splash screen, and deep-link entry.
- The web/PWA source remains the primary product core and can deploy independently from the APK.

## Application identity
- Package: `com.ardacore.amstudio`
- App label: `AM STUDIO`
- Production host: `am-studio-pwa.ardarawk.workers.dev`
- Native marker: `?native=android`

## Security defaults
- HTTPS-only transport.
- In-app navigation restricted to the AM STUDIO production host.
- External links delegated to Android.
- Mixed content blocked.
- Direct WebView file access disabled.
- WebView debugging disabled in release builds.

## CI
`android-validation.yml` builds debug and unsigned release variants. Production signing is intentionally separate and requires AM STUDIO-specific GitHub Actions secrets.

## Production signing secrets
- `AM_STUDIO_ANDROID_KEYSTORE_B64`
- `AM_STUDIO_ANDROID_KEYSTORE_PASSWORD`
- `AM_STUDIO_ANDROID_KEY_ALIAS`
- `AM_STUDIO_ANDROID_KEY_PASSWORD`

Never commit the production keystore or passwords.
