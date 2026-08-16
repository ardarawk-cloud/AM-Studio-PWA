import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const growth=fs.readFileSync(new URL('../public/growth-reader.js',import.meta.url),'utf8');
const config=JSON.parse(fs.readFileSync(new URL('../public/growth-config.json',import.meta.url),'utf8'));
const firewall=fs.readFileSync(new URL('../src/play-firewall-runtime.js',import.meta.url),'utf8');
const nav=fs.readFileSync(new URL('../android/app/src/main/java/com/ardacore/amstudio/AmStudioNavigationPolicy.java',import.meta.url),'utf8');
const privacy=fs.readFileSync(new URL('../public/privacy-policy.html',import.meta.url),'utf8');

test('Growth Build uses consumer positioning and first-run acquisition hooks',()=>{
  assert.equal(config.product.positioning,'Stories • Comics • Universes');
  assert.equal(config.growth.onboarding,true);
  assert.equal(config.growth.featuredRelease,true);
  assert.equal(config.growth.continueReading,true);
  assert.equal(config.growth.organicShare,true);
  assert.equal(config.growth.campaignDeepLinks,true);
  assert.match(growth,/Stories\. Comics\.<br>Universes\./);
  assert.match(growth,/MULAI BACA GRATIS/);
  assert.match(growth,/FEATURED UNIVERSE/);
  assert.match(growth,/CONTINUE READING/);
});

test('Marketing links remain inside the public Play firewall',()=>{
  assert.match(growth,/u\.searchParams\.set\('channel','play'\)/);
  for(const key of ['series','episode','campaign','utm_source','utm_medium','utm_campaign','ref']){
    assert.ok(config.growth.campaignParameters.includes(key),`missing campaign parameter ${key}`);
  }
  assert.match(growth,/deep_link_blocked/);
  assert.match(growth,/NOT_PUBLIC_READY/);
});

test('Growth Build injects only after the Play firewall and never enables owner tools',()=>{
  assert.match(firewall,/am-growth-reader-server/);
  assert.match(firewall,/growth-reader\.js\?v=1/);
  assert.match(firewall,/x-am-play-firewall/);
  assert.doesNotMatch(growth,/admin-panel\.js|page-control\.js|private-production\.js/);
});

test('Monetization and Creator Economy remain gated until real infrastructure exists',()=>{
  assert.equal(config.monetization.rewardedAds.publicEntry,false);
  assert.equal(config.monetization.premiumSubscription.publicEntry,false);
  assert.equal(config.monetization.oneTimeProducts.publicEntry,false);
  assert.equal(config.monetization.creatorPlatform.publicEntry,false);
  assert.equal(config.data.networkAnalytics,false);
  assert.equal(config.data.advertisingIdUsed,false);
  assert.doesNotMatch(growth,/ca-app-pub-|BillingClient|firebase|advertisingId/i);
});

test('Organic sharing is native-safe and restricted to AM STUDIO first-party URLs',()=>{
  assert.match(growth,/amstudio-action:\/\/share/);
  assert.match(nav,/ACTION_SCHEME = "amstudio-action"/);
  assert.match(nav,/"share"\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
  assert.match(nav,/if \(!isInternal\(shareUri\)\)/);
  assert.match(nav,/Intent\.ACTION_SEND/);
});

test('Local growth attribution is disclosed and no network analytics is claimed',()=>{
  assert.match(privacy,/atribusi kampanye lokal/i);
  assert.match(privacy,/tidak mengirimkan favorit, progres, event growth lokal, atau atribusi kampanye lokal tersebut ke server analytics/i);
});
