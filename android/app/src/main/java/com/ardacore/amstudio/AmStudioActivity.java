package com.ardacore.amstudio;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

public class AmStudioActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 5101;
    private static final String HOME_URL = "https://am-studio-pwa.ardarawk.workers.dev/?native=android";

    private WebView webView;
    private LinearLayout errorPanel;
    private ValueCallback<Uri[]> filePathCallback;
    private String lastInternalUrl = HOME_URL;
    private boolean loadFailed;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        buildUi();
        configureWebView();
        webView.loadUrl(resolveInitialUrl(getIntent()));
    }

    private String resolveInitialUrl(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (!AmStudioNavigationPolicy.isInternal(data)) return HOME_URL;
        return data.buildUpon().appendQueryParameter("native", "android").build().toString();
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(5, 5, 7));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 5, 7));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(28), dp(28), dp(28));
        errorPanel.setBackgroundColor(Color.rgb(5, 5, 7));
        errorPanel.setVisibility(View.GONE);

        TextView title = new TextView(this);
        title.setText("AM STUDIO tidak dapat terhubung");
        title.setTextColor(Color.WHITE);
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView detail = new TextView(this);
        detail.setText("Periksa koneksi internet lalu coba lagi. Library AM STUDIO tidak dihapus.");
        detail.setTextColor(Color.rgb(148, 163, 184));
        detail.setTextSize(14);
        detail.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams detailParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        detailParams.topMargin = dp(10);
        errorPanel.addView(detail, detailParams);

        Button retry = new Button(this);
        retry.setText("COBA LAGI");
        retry.setOnClickListener(v -> retryLastPage());
        LinearLayout.LayoutParams retryParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
        retryParams.topMargin = dp(20);
        retryParams.gravity = Gravity.CENTER_HORIZONTAL;
        errorPanel.addView(retry, retryParams);

        root.addView(errorPanel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " AMStudioAndroid/0.1.0");

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debuggable);
        webView.setWebViewClient(new AmStudioWebViewClient());
        webView.setWebChromeClient(new AmStudioChromeClient());
        webView.setDownloadListener(new AmStudioDownloadBridge(this, settings.getUserAgentString()));
    }

    private void applyPublicNativeMode(WebView view) {
        String script = "(()=>{const hide=()=>['am-admin-launch','am-page-control-launch','am-admin-panel','am-page-control'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.setProperty('display','none','important')});hide();if(!window.__amNativeReaderObserver){window.__amNativeReaderObserver=new MutationObserver(hide);window.__amNativeReaderObserver.observe(document.documentElement,{childList:true,subtree:true});}document.documentElement.dataset.amNative='android';})();";
        view.evaluateJavascript(script, null);
    }

    private void retryLastPage() {
        hideError();
        webView.loadUrl(lastInternalUrl);
    }

    private void showError() {
        loadFailed = true;
        errorPanel.setVisibility(View.VISIBLE);
    }

    private void hideError() {
        loadFailed = false;
        errorPanel.setVisibility(View.GONE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private final class AmStudioWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (AmStudioNavigationPolicy.isInternal(uri)) return false;
            return AmStudioNavigationPolicy.openExternal(AmStudioActivity.this, uri);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            Uri uri = Uri.parse(url);
            if (AmStudioNavigationPolicy.isInternal(uri)) return false;
            return AmStudioNavigationPolicy.openExternal(AmStudioActivity.this, uri);
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            Uri uri = Uri.parse(url);
            if (AmStudioNavigationPolicy.isInternal(uri)) lastInternalUrl = url;
            hideError();
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (!loadFailed) errorPanel.setVisibility(View.GONE);
            applyPublicNativeMode(view);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) showError();
        }

        @Override
        public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
            if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
        }
    }

    private final class AmStudioChromeClient extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;
            try {
                startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                return true;
            } catch (Exception error) {
                filePathCallback = null;
                Toast.makeText(AmStudioActivity.this, "File picker tidak tersedia.", Toast.LENGTH_SHORT).show();
                return false;
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(result);
        filePathCallback = null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (webView != null) webView.loadUrl(resolveInitialUrl(intent));
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.removeAllViews();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
