# AM STUDIO Growth & Monetization Readiness — 2026-08-16

Status: PRE-RELEASE PRODUCT HARDENING. Google Play release approval remains owner-gated.

## Product positioning

Current public positioning for Growth Build v1:

**AM STUDIO — Stories • Comics • Universes**

Future positioning after policy/backend readiness:

**AM STUDIO — Stories • Comics • Universes • Creators**

The app is not marketed as a generic channel directory. Social content is the trailer; AM STUDIO is the canonical reading destination.

## Screen audit and Growth Build v1 actions

| Surface | Before | Growth Build v1 |
|---|---|---|
| First launch | No product onboarding | First-run value onboarding with free-start CTA |
| Home | QC/private-beta language | Consumer positioning, featured universe, value strip |
| Discovery | Flat universe grid | Featured public-ready release + existing library/search |
| Return loop | Progress existed but was passive | Continue Reading module driven by local progress |
| Collection | Functional but low-context | Consumer copy + local storage disclosure |
| Series | Internal release/QC language | Official release language + organic share CTA |
| Reader | Reading only | Official branding + organic share CTA |
| Campaign funnel | No explicit campaign routing | `series`, `episode`, `campaign`, UTM and `ref` deep-link plumbing |
| Referral/share | No native share path | Safe Android share-sheet bridge for first-party AM STUDIO links |
| Release retention | No release comparison | Local-only new-release detection between visits |
| Metrics architecture | No growth event model | Local-only capped event journal; no network analytics or device ID |

## Monetization gates

### Rewarded ads — GATED, NOT LIVE

Do not add an ad SDK to the Play build until all of the following are ready:

1. AdMob app and rewarded ad-unit IDs are owned by Arda Core Corporation.
2. Reward entitlement is defined (for example bonus chapter, bonus story, collectible, or temporary unlock) and cannot unlock non-approved canon assets.
3. Consent/privacy flow is audited for target countries.
4. Privacy Policy and Google Play Data Safety are updated before release.
5. Development/testing uses Google-provided test ads only.
6. Public UX is opt-in and the reward is disclosed before the ad.

Google's current rewarded-ad documentation requires test ads during development and describes rewarded ads as an opt-in exchange for an in-app reward.

Official reference: https://developers.google.com/admob/android/next-gen/rewarded

### AM STUDIO+ subscription — GATED, NOT LIVE

Planned entitlement categories may include no ads, early access, exclusive chapters, HD wallpapers, bonus stories, premium character assets, and member status, but none are to be displayed as purchasable until configured and verified.

Before enabling subscription UI:

1. Create the actual subscription/base plans/offers in Google Play Console.
2. Lock owner-approved product IDs and pricing strategy.
3. Integrate Google Play Billing using the current supported library. As of this audit, Android Developers documents Play Billing Library `9.1.0` in the integration guide.
4. Verify purchases on a secure backend before granting entitlements.
5. Implement purchase acknowledgement and entitlement restoration.
6. Implement RTDN/backend lifecycle handling for subscription state changes.
7. Update Privacy/Data Safety/store listing before release.

Official references:
- https://developer.android.com/google/play/billing/integrate
- https://developer.android.com/google/play/billing/backend

### One-time digital products — GATED, NOT LIVE

Candidate product classes:
- Comic Pack
- Wallpaper Pack
- Full Season Unlock
- Collector Pack

Do not hard-code prices in the app. Query localized Play product details from the Billing API after real SKUs exist. Entitlements must be verified and persisted server-side.

Official reference: https://developer.android.com/google/play/billing/one-time-products

### Creator Platform / Creator Economy — FUTURE PHASE

No public creator upload entry is enabled in Growth Build v1.

Before user-visible UGC is allowed, AM STUDIO requires at minimum:
- account/authentication architecture;
- Terms of Use/user policy acceptance before upload;
- content rules and prohibited-content definitions;
- effective ongoing moderation;
- in-app reporting;
- blocking where applicable;
- creator ownership/licensing terms;
- payout/platform-fee model;
- abuse, copyright, and appeals operations.

Official Google Play UGC reference: https://support.google.com/googleplay/android-developer/answer/9876937

## Data/analytics decision for Growth Build v1

Growth Build v1 deliberately does **not** add Firebase Analytics, an advertising ID, or a network analytics endpoint. Campaign context and a capped growth-event journal are stored locally only. This keeps the current Data Safety footprint minimal while the funnel UX is validated.

Before MAU/retention/paid-conversion dashboards are enabled, choose the analytics stack and update Privacy/Data Safety based on the exact SDK/backend behavior.

## Marketing links supported by Growth Build v1

Example installed/web-reader campaign route:

`https://am-studio-pwa.ardarawk.workers.dev/?series=amu&episode=1&utm_source=facebook&utm_medium=reel&utm_campaign=amu_ep001`

Supported parameters:
- `series`
- `episode`
- `campaign`
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `ref`

If the requested series/episode is not public-ready under the Play firewall, the growth layer must not bypass the release gate.

## Release rule

Growth and monetization features are subordinate to the AM STUDIO Canon Firewall and Play firewall. No marketing, ad reward, subscription entitlement, microtransaction, referral, or creator feature may expose draft, partial-recovery, unapproved, or owner-only content.
