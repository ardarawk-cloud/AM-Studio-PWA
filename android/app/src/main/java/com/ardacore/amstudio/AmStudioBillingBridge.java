package com.ardacore.amstudio;

import android.app.Activity;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.ProductDetailsResponseListener;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesResponseListener;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

final class AmStudioBillingBridge implements PurchasesUpdatedListener {
    private static final String VERIFY_URL = "https://am-studio-pwa.ardarawk.workers.dev/api/subscription/verify";
    private static final String PRODUCT_ID = "am_studio_premium";
    private static final String MONTHLY = "monthly";
    private static final String YEARLY = "yearly";

    private final Activity activity;
    private final WebView webView;
    private final BillingClient billingClient;
    private boolean setupComplete = false;

    AmStudioBillingBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        PendingPurchasesParams pending = PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build();
        billingClient = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases(pending)
                .enableAutoServiceReconnection()
                .build();
        connect();
    }

    private void connect() {
        if (billingClient.isReady()) {
            setupComplete = true;
            refreshInternal("ready");
            return;
        }
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                setupComplete = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                if (setupComplete) {
                    refreshInternal("connected");
                } else {
                    emitError("BILLING_SETUP_FAILED", result.getDebugMessage());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                setupComplete = false;
                emitSimpleState(false, "disconnected");
            }
        });
    }

    private void ensureConnected(Runnable action) {
        activity.runOnUiThread(() -> {
            if (billingClient.isReady()) {
                setupComplete = true;
                action.run();
                return;
            }
            billingClient.startConnection(new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(BillingResult result) {
                    setupComplete = result.getResponseCode() == BillingClient.BillingResponseCode.OK;
                    if (setupComplete) action.run();
                    else emitError("BILLING_SETUP_FAILED", result.getDebugMessage());
                }

                @Override
                public void onBillingServiceDisconnected() {
                    setupComplete = false;
                    emitSimpleState(false, "disconnected");
                }
            });
        });
    }

    @JavascriptInterface
    public void refresh() {
        ensureConnected(() -> refreshInternal("refresh"));
    }

    @JavascriptInterface
    public void restore() {
        ensureConnected(() -> queryPurchases("restore"));
    }

    @JavascriptInterface
    public void subscribe(String basePlanId) {
        String plan = basePlanId == null ? "" : basePlanId.trim().toLowerCase();
        if (!(MONTHLY.equals(plan) || YEARLY.equals(plan))) {
            emitError("INVALID_BASE_PLAN", plan);
            return;
        }
        ensureConnected(() -> queryProductForPurchase(plan));
    }

    private void refreshInternal(String source) {
        queryProducts();
        queryPurchases(source);
    }

    private QueryProductDetailsParams subscriptionQuery() {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(PRODUCT_ID)
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
        return QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();
    }

    private void queryProducts() {
        billingClient.queryProductDetailsAsync(subscriptionQuery(), new ProductDetailsResponseListener() {
            @Override
            public void onProductDetailsResponse(BillingResult result, QueryProductDetailsResult queryResult) {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    emitError("PRODUCT_QUERY_FAILED", result.getDebugMessage());
                    return;
                }
                emitProducts(queryResult.getProductDetailsList());
            }
        });
    }

    private void queryProductForPurchase(String basePlanId) {
        billingClient.queryProductDetailsAsync(subscriptionQuery(), (result, queryResult) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                emitError("PRODUCT_QUERY_FAILED", result.getDebugMessage());
                return;
            }
            for (ProductDetails details : queryResult.getProductDetailsList()) {
                List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                if (offers == null) continue;
                for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                    if (!basePlanId.equalsIgnoreCase(offer.getBasePlanId())) continue;
                    BillingFlowParams.ProductDetailsParams pd = BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(offer.getOfferToken())
                            .build();
                    BillingFlowParams params = BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(Collections.singletonList(pd))
                            .build();
                    BillingResult launch = billingClient.launchBillingFlow(activity, params);
                    if (launch.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        emitError("BILLING_FLOW_FAILED", launch.getDebugMessage());
                    }
                    return;
                }
            }
            emitError("BASE_PLAN_NOT_AVAILABLE", basePlanId);
        });
    }

    private void queryPurchases(String source) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build();
        billingClient.queryPurchasesAsync(params, new PurchasesResponseListener() {
            @Override
            public void onQueryPurchasesResponse(BillingResult result, List<Purchase> purchases) {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    emitError("RESTORE_FAILED", result.getDebugMessage());
                    return;
                }
                List<Purchase> relevant = new ArrayList<>();
                for (Purchase purchase : purchases) {
                    if (purchase.getProducts().contains(PRODUCT_ID)) relevant.add(purchase);
                }
                if (relevant.isEmpty()) {
                    emitSimpleState(false, source);
                    return;
                }
                for (Purchase purchase : relevant) {
                    if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                        verifyPurchase(purchase, source);
                    } else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                        emitPending(source);
                    }
                }
            }
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        int code = result.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) {
            emitSimpleState(false, "canceled");
            return;
        }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null) {
            emitError("PURCHASE_UPDATE_FAILED", result.getDebugMessage());
            return;
        }
        for (Purchase purchase : purchases) {
            if (!purchase.getProducts().contains(PRODUCT_ID)) continue;
            if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                verifyPurchase(purchase, "purchase");
            } else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
                emitPending("purchase");
            }
        }
    }

    private void verifyPurchase(Purchase purchase, String source) {
        final String token = purchase.getPurchaseToken();
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(VERIFY_URL).openConnection();
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(18000);
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setRequestProperty("content-type", "application/json");
                conn.setRequestProperty("accept", "application/json");
                conn.setRequestProperty("user-agent", "AMStudioAndroid/" + BuildConfig.VERSION_NAME + " PlayReader Billing");
                JSONObject payload = new JSONObject();
                payload.put("purchaseToken", token);
                payload.put("productId", PRODUCT_ID);
                byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = conn.getOutputStream()) {
                    out.write(bytes);
                }

                int status = conn.getResponseCode();
                InputStream stream = status >= 200 && status < 400 ? conn.getInputStream() : conn.getErrorStream();
                StringBuilder text = new StringBuilder();
                if (stream != null) {
                    try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = reader.readLine()) != null) text.append(line);
                    }
                }
                JSONObject response = text.length() > 0 ? new JSONObject(text.toString()) : new JSONObject();
                if (status < 200 || status >= 300 || !response.optBoolean("ok", false)) {
                    emitError("VERIFY_FAILED", response.optString("error", "HTTP_" + status));
                    return;
                }
                JSONObject entitlement = response.optJSONObject("entitlement");
                if (entitlement == null) {
                    emitError("VERIFY_FAILED", "ENTITLEMENT_MISSING");
                    return;
                }

                boolean entitled = entitlement.optBoolean("entitled", false);
                if (entitled && !purchase.isAcknowledged()) {
                    activity.runOnUiThread(() -> {
                        AcknowledgePurchaseParams ack = AcknowledgePurchaseParams.newBuilder()
                                .setPurchaseToken(token)
                                .build();
                        billingClient.acknowledgePurchase(ack, ackResult -> {
                            if (ackResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                                entitlement.remove("acknowledgementRequired");
                                try {
                                    entitlement.put("acknowledged", true);
                                    entitlement.put("acknowledgementRequired", false);
                                } catch (Exception ignored) {}
                                emitEntitlement(entitlement, source);
                            } else {
                                emitError("ACKNOWLEDGE_FAILED", ackResult.getDebugMessage());
                            }
                        });
                    });
                    return;
                }
                emitEntitlement(entitlement, source);
            } catch (Exception error) {
                emitError("VERIFY_NETWORK_FAILED", error.getClass().getSimpleName());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }, "am-studio-billing-verify").start();
    }

    private ProductDetails.PricingPhase displayPhase(ProductDetails.SubscriptionOfferDetails offer) {
        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
        if (phases == null || phases.isEmpty()) return null;
        ProductDetails.PricingPhase fallback = phases.get(phases.size() - 1);
        for (int i = phases.size() - 1; i >= 0; i--) {
            ProductDetails.PricingPhase phase = phases.get(i);
            if (phase.getPriceAmountMicros() > 0) return phase;
        }
        return fallback;
    }

    private void emitProducts(List<ProductDetails> detailsList) {
        try {
            JSONArray plans = new JSONArray();
            Set<String> seen = new HashSet<>();
            for (ProductDetails details : detailsList) {
                if (!PRODUCT_ID.equals(details.getProductId())) continue;
                List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                if (offers == null) continue;
                for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                    String basePlanId = offer.getBasePlanId();
                    if (!(MONTHLY.equals(basePlanId) || YEARLY.equals(basePlanId)) || seen.contains(basePlanId)) continue;
                    ProductDetails.PricingPhase phase = displayPhase(offer);
                    if (phase == null) continue;
                    JSONObject plan = new JSONObject();
                    plan.put("basePlanId", basePlanId);
                    plan.put("price", phase.getFormattedPrice());
                    plan.put("billingPeriod", phase.getBillingPeriod());
                    plans.put(plan);
                    seen.add(basePlanId);
                }
            }
            JSONObject detail = new JSONObject();
            detail.put("type", "products");
            detail.put("ready", setupComplete);
            detail.put("productId", PRODUCT_ID);
            detail.put("plans", plans);
            emit(detail);
        } catch (Exception error) {
            emitError("PRODUCT_RENDER_FAILED", error.getClass().getSimpleName());
        }
    }

    private void emitEntitlement(JSONObject entitlement, String source) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("type", "entitlement");
            detail.put("source", source);
            detail.put("active", entitlement.optBoolean("entitled", false));
            detail.put("state", entitlement.optString("state", ""));
            detail.put("expiryTime", entitlement.optString("expiryTime", ""));
            detail.put("basePlanId", entitlement.optString("basePlanId", ""));
            detail.put("autoRenewing", entitlement.optBoolean("autoRenewing", false));
            detail.put("testPurchase", entitlement.optBoolean("testPurchase", false));
            emit(detail);
        } catch (Exception error) {
            emitError("ENTITLEMENT_RENDER_FAILED", error.getClass().getSimpleName());
        }
    }

    private void emitPending(String source) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("type", "entitlement");
            detail.put("source", source);
            detail.put("active", false);
            detail.put("pending", true);
            detail.put("state", "PENDING");
            emit(detail);
        } catch (Exception ignored) {}
    }

    private void emitSimpleState(boolean active, String source) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("type", "entitlement");
            detail.put("source", source);
            detail.put("active", active);
            detail.put("state", active ? "ACTIVE" : "INACTIVE");
            emit(detail);
        } catch (Exception ignored) {}
    }

    private void emitError(String code, String message) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("type", "error");
            detail.put("code", code);
            detail.put("message", message == null ? "" : message);
            emit(detail);
        } catch (Exception ignored) {}
    }

    private void emit(JSONObject detail) {
        final String js = "window.dispatchEvent(new CustomEvent('am-billing-state',{detail:" + detail.toString() + "}));";
        webView.post(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    void destroy() {
        if (billingClient.isReady()) billingClient.endConnection();
    }
}
