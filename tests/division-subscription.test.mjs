import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const gradle=fs.readFileSync(new URL('../android/app/build.gradle',import.meta.url),'utf8');
const activity=fs.readFileSync(new URL('../android/app/src/main/java/com/ardacore/amstudio/AmStudioActivity.java',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../android/app/src/main/java/com/ardacore/amstudio/AmStudioBillingBridge.java',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/subscription-runtime.js',import.meta.url),'utf8');
const firewall=fs.readFileSync(new URL('../src/play-firewall-runtime.js',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../public/subscription-ui.js',import.meta.url),'utf8');
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');

test('Play Billing 9.1.0 is wired only into the Android Play shell',()=>{
  assert.match(gradle,/com\.android\.billingclient:billing:9\.1\.0/);
  assert.match(activity,/BuildConfig\.PLAY_STORE_MODE/);
  assert.match(activity,/addJavascriptInterface\(billingBridge, "AmStudioBilling"\)/);
  assert.match(bridge,/BillingClient\.newBuilder/);
  assert.match(bridge,/queryProductDetailsAsync/);
  assert.match(bridge,/queryPurchasesAsync/);
  assert.match(bridge,/acknowledgePurchase/);
});

test('subscription verification uses Google Android Publisher API and R2 entitlement records',()=>{
  assert.match(runtime,/purchases\/subscriptionsv2\/tokens/);
  assert.match(runtime,/GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL/);
  assert.match(runtime,/GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY/);
  assert.match(runtime,/subscriptions\/\$\{hash\}\.json/);
  assert.match(runtime,/SUBSCRIPTION_STATE_IN_GRACE_PERIOD/);
  assert.match(runtime,/GOOGLE_PLAY_RTDN_SECRET/);
});

test('Premium product and base plans are locked to AM STUDIO identifiers',()=>{
  assert.match(wrangler,/am_studio_premium/);
  assert.match(wrangler,/"monthly"/);
  assert.match(wrangler,/"yearly"/);
  assert.match(bridge,/am_studio_premium/);
});

test('subscription UI is injected through Play firewall and stays concise',()=>{
  assert.match(firewall,/subscription-ui\.js\?v=1/);
  assert.match(ui,/Premium/);
  assert.match(ui,/Pulihkan pembelian/);
  assert.match(ui,/subscribe\(btn\.dataset\.amSubscribe\)/);
});
