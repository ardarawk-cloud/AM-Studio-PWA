package com.ardacore.amstudio;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;

final class AmStudioNavigationPolicy {
    static final String FRONTEND_HOST = "am-studio-pwa.ardarawk.workers.dev";

    private AmStudioNavigationPolicy() {}

    static boolean isInternal(Uri uri) {
        if (uri == null) return false;
        return "https".equalsIgnoreCase(uri.getScheme())
                && FRONTEND_HOST.equalsIgnoreCase(uri.getHost());
    }

    static boolean openExternal(Context context, Uri uri) {
        if (uri == null) return true;
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
