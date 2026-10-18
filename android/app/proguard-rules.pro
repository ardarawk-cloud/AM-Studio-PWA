# AM STUDIO Android shell uses platform Android APIs only.
# Keep this explicit so release minification remains predictable.

# Keep the first-party billing bridge exposed to the trusted AM STUDIO WebView.
-keep class com.ardacore.amstudio.AmStudioBillingBridge { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
