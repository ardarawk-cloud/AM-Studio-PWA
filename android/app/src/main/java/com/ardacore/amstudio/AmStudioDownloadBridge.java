package com.ardacore.amstudio;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.URLUtil;
import android.widget.Toast;

final class AmStudioDownloadBridge implements DownloadListener {
    private final Context context;
    private final String userAgent;

    AmStudioDownloadBridge(Context context, String userAgent) {
        this.context = context;
        this.userAgent = userAgent;
    }

    @Override
    public void onDownloadStart(String url, String userAgentHeader, String contentDisposition,
                                String mimeType, long contentLength) {
        try {
            Uri uri = Uri.parse(url);
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                Toast.makeText(context, "Download non-HTTPS diblokir.", Toast.LENGTH_SHORT).show();
                return;
            }
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(uri);
            request.setTitle(fileName);
            request.setDescription("AM STUDIO download");
            request.setMimeType(mimeType);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName);
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null && !cookies.isBlank()) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", userAgentHeader == null ? userAgent : userAgentHeader);
            DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(context, "Download dimulai: " + fileName, Toast.LENGTH_SHORT).show();
        } catch (Exception error) {
            Toast.makeText(context, "Download gagal dimulai.", Toast.LENGTH_SHORT).show();
        }
    }
}
