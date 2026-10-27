# AM STUDIO Comics Enterprise — Addendum L

Owner directive: 26 October 2026. This extends the existing Comics system; no new website, domain, or payment-gateway account was created.

## Product and pricing

- Operator: PT Nadmo Studio Indonesia; existing legal entity retained.
- One product: `am-studio-comics-member` / AM STUDIO Comics Member.
- Monthly: IDR 9,900 for one calendar month.
- Annual: IDR 99,000 for 12 calendar months. Savings against 12 monthly purchases: IDR 19,800, equivalent to two monthly payments. It is not a 14-month term.
- The administrator can change prices and calendar-month periods in `/admin/billing`. Already-created invoices retain their snapshots.
- QRIS only; manual renewal each period; no recurring bank debit.

## Existing infrastructure

- Repository: `ardarawk-cloud/AM-Studio-PWA`, branch `main`.
- Production Worker: `am-studio-pwa`; domain `https://comics.nadmo.id/`.
- Existing private R2 `am-studio-comics` retained, including all existing objects.
- R2 audit: r2.dev public access disabled; no bucket custom domains.
- Comics had no D1 or account database binding. The other available databases serve separate businesses. A D1 database was therefore added inside this same Comics system: `am-studio-comics-membership`, UUID `ba50fde4-ef67-4bb9-8446-630976c40f82`, binding `MEMBERSHIP_DB`.
- No existing customer or comic records were deleted or migrated away.
- Preserve the existing Play reader/content firewall. The membership runtime wraps it.
- The similarly named Pages project serves Brush by Yuda from `brush-by-yuda/`; do not deploy Comics there or change its domain.

## Merchant audit and current payment gate

The owner selected their supplied QRIS image. Decoded merchant details:

- Printed name: ACM Store - Art; QR payload merchant name: ACM Store.
- NMID: ID1026544770625.
- Issuer account identifier: ID.CO.SHOPEE.WWW; issuer code 93600918, ShopeePay.
- EMV initiation method 11: static QR; IDR; Denpasar; terminal A01.

The image establishes a QR merchant reference. It does not establish an approved API integration, production credentials, merchant legal-entity linkage, current merchant activity, fees, or settlement details. Do not assert these are verified.

Comics has no ShopeePay credentials. An existing Roamink Worker has iPaymu secret names, but that is neither evidence of approved Comics production access nor authority to reuse its account. No DOKU integration was present in Comics bindings. The selected payment path remains the owner's ShopeePay merchant; no additional account was opened.

`billing_settings.checkout_enabled=0`, `api_mode=DISABLED`, `legal_entity_status=UNVERIFIED`. No invoices, real charges or paid entitlements are created while the provider gate is closed. Do not show the static merchant sticker as if it were a provider-created invoice QR.

Before opening checkout, obtain the authorized API integration for this existing merchant and verify its legal entity, identifiers, approved products, sandbox/production status, fees and settlement account. Configure server-only Cloudflare Secrets: `SHOPEEPAY_CLIENT_ID`, `SHOPEEPAY_CLIENT_SECRET`, `SHOPEEPAY_PRIVATE_KEY`, `SHOPEEPAY_PUBLIC_KEY`, `SHOPEEPAY_MERCHANT_ID`, `SHOPEEPAY_STORE_ID`, `SHOPEEPAY_BASE_URL`, `SHOPEEPAY_CALLBACK_URL`, `SHOPEEPAY_MODE` and the matching explicit verification flag. Production must match `BILLING_ENVIRONMENT=PRODUCTION`. Sandbox must use an isolated environment/database. Never put keys in the frontend, screenshots, localStorage, or a commit.

Callback path: `/api/billing/shopeepay/v1.0/qr/qr-mpm-notify`. Register its full production URL with ShopeePay. Its full URL participates in RSA signature validation. Webhook signature, timestamp, invoice, transaction ID, nominal, currency, merchant and store must match. The server queries the provider before activation. HTTP success alone does not imply payment success.

Provider references:
- https://product.shopeepay.co.id/integration/api/merchant-presented-mode
- https://product.shopeepay.co.id/integration/api/notify-transaction-status
- https://product.shopeepay.co.id/integration/get-started/go

## Data and access

Tables include users, membership_plans, membership_prices, subscriptions, invoices, payments, payment_events, member_entitlements, reading_progress, favorites, sessions, auth_limits, comic_access, audit_logs and in-app renewal notifications.

Passwords use salted scrypt; session tokens are random, stored hashed, and sent only in Secure/HttpOnly/SameSite host cookies. Mutations require same origin and CSRF except authenticated backend publisher calls and signed provider callbacks. Authentication and invoice/status checks have database-backed rate limits. Registration never accepts an admin role. Admin sessions use the existing Comics administrator secret.

The unique payment per invoice and database trigger apply payment, extension, catalog entitlement and audit atomically. Concurrent renewals extend the current end date. Calendar arithmetic clamps month-end dates and preserves UTC timestamps. ACTIVE / EXPIRING / EXPIRED are computed from actual validity; expiry is enforced on every asset request, independently of cron. In-app reminders appear in the member dashboard; no email, push or automatic debit is claimed.

Owner update, 27 October 2026: episodes 1–9 are fully free; episode 10 onward requires catalog membership unless an audited FREE exception exists. This boundary lives in `catalog_access_settings` and is editable in `/admin/billing`. The complete R2 audit found 96 existing objects across 12 Comic IDs and no episode 10 or later; no existing published page is newly locked by this change. Covers, metadata and previews remain available. Protected page requests require a currently active account and membership at the server, including direct `/media/comics/…` and legacy `/comics/…` routes. Query-string owner/beta modes do not bypass membership. Premium responses and account APIs use no-store caching; the updated service worker caches only public static assets.

## Publisher contract

Billing is catalog-wide and does not require a separate subscription per title. The 27 October recovery of the owner's ACC OS X archive established the original thirteen profiles; adding the existing HPG and Wukong projects gives fifteen publishing passports. All twelve existing website IDs remain unchanged. See `public/publisher-registry.json` and `docs/UNIVERSAL_COMICS_PUBLISHER_v1.md` for the explicit destinations and provenance. A registered profile is not a claim that an episode has been produced or published.

The Universal Publisher uses private approved manifests, original-file SHA-256 verification, resumable uploads, per-episode locks and stored receipts. An incomplete package is hidden from the public reader and direct asset routes. The global preview boundary automatically protects new episode 10+ before its first object is available, without changing billing code or republishing older episodes. The existing owner uploader and administrator access-policy APIs remain available for audited FREE exceptions and explicit page previews beyond the global free boundary.

Only flows with recorded verification may be reported as working. All fifteen destinations are validated locally; this does not establish that all fifteen production conversations have already uploaded approved episodes. Original-file recovery can still block an individual release. See the publisher recovery ledger for Royal Gambler.

## Finance and legal pages

Admin reports show successful payments, gross revenue, recorded fees, refunds, calculated net, received/pending/unknown settlements, active/expired members, UTC monthly totals and failures. Unknown fees remain unknown; net is unavailable until fees are complete. Tax treatment is not assumed. Sandbox records are excluded from production revenue. Reconciliation edits require an audit reason and do not initiate refunds or transfers. CSV export is admin-only.

Pages: `/membership`, `/register`, `/login`, `/checkout`, `/payment-status`, `/member`, `/member/history`, `/admin/billing`, `/membership/terms`, `/membership/privacy`, `/membership/refund`. Legacy privacy URLs serve the current account privacy policy.

## Validation and remaining gates

84 local tests passed on 27 October 2026. They use actual SQLite constraints/triggers/transactions, the real publishing/catalog runtime with an R2 fixture, and a provider transport test double with real RSA callback-signature verification. Covered cases include the episode 9/10 boundary, active/expired/other accounts, audited cutoff changes, all fifteen passports, partial uploads, source hashes, retries, duplicate/concurrent publication and finance/renewal behavior. These are not provider sandbox payment tests. The compiled membership foundation was also exercised in the local Workers runtime against D1 for pricing, registration, secure session and login.

Provider sandbox tests: NOT RUN — authorized merchant API credentials unavailable.

Production payment tests: NOT RUN — merchant/API production approval not verified, and real-money approval has not been requested or supplied. No money moved. Automatic payment activation must not be reported as live or SUCCESS.

The remaining gate is the existing ShopeePay merchant API integration and verified business/settlement linkage, followed by authorized provider sandbox tests. Keep checkout disabled until this is completed.
