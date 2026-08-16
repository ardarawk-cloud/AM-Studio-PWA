package com.ardacore.amstudio;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

final class AmStudioNavigationPolicy {
    static final String FRONTEND_HOST = "am-studio-pwa.ardarawk.workers.dev";
    private static final String ACTION_SCHEME = "amstudio-action";

    private AmStudioNavigationPolicy() {}

    static boolean isInternal(Uri uri) {
        if (uri == null) return false;
        return "https".equalsIgnoreCase(uri.getScheme())
                && FRONTEND_HOST.equalsIgnoreCase(uri.getHost());
    }

    private static boolean handleNativeAction(Context context, Uri uri) {
        if (uri == null || !ACTION_SCHEME.equalsIgnoreCase(uri.getScheme())) return false;
        if (!"share".equalsIgnoreCase(uri.getHost())) {
            Toast.makeText(context, "Aksi AM STUDIO tidak dikenali.", Toast.LENGTH_SHORT).show();
            return true;
        }

        String text = uri.getQueryParameter("text");
        String url = uri.getQueryParameter("url");
        text = text == null ? "AM STUDIO" : text.trim();
        url = url == null ? "" : url.trim();
        if (text.length() > 600) text = text.substring(0, 600);
        if (url.length() > 2000) url = url.substring(0, 2000);

        Uri shareUri;
        try {
            shareUri = Uri.parse(url);
        } catch (Exception error) {
            Toast.makeText(context, "Link AM STUDIO tidak valid.", Toast.LENGTH_SHORT).show();
            return true;
        }
        if (!isInternal(shareUri)) {
            Toast.makeText(context, "Link share diblokir oleh AM STUDIO.", Toast.LENGTH_SHORT).show();
            return true;
        }

        Intent share = new Intent(Intent.ACTION_SEND);
        share.setType("text/plain");
        share.putExtra(Intent.EXTRA_TEXT, text + "\n" + shareUri.toString());
        try {
            context.startActivity(Intent.createChooser(share, "Bagikan AM STUDIO"));
        } catch (Exception error) {
            Toast.makeText(context, "Tidak ada aplikasi untuk membagikan tautan.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    static boolean openExternal(Context context, Uri uri) {
        if (uri == null) return true;
        if (handleNativeAction(context, uri)) return true;

        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!(scheme.equals("https") || scheme.equals("http") || scheme.equals("mailto") || scheme.equals("tel"))) {
            Toast.makeText(context, "Tautan diblokir oleh AM STUDIO.", Toast.LENGTH_SHORT).show();
            return true;
        }
        try {
            context.startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception error) {
            Toast.makeText(context, "Tidak ada aplikasi untuk membuka tautan ini.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }
}
