# AM STUDIO Comics — Admin AI × existing NADMO Payment Bridge

Status: **integration adapter implemented, bridge connection unverified** (2026-11-27). Do not describe merchant auto-activation as LIVE before a real DANA merchant-notification end-to-end test.

## Existing project integration
- Existing Android NADMO Payment Bridge remains the notification collector. **Do not create a second collector or bridge.**
- AM STUDIO Comics Worker `am-studio-pwa` receives a signed merchant event at:
  `POST https://comics.nadmo.id/api/billing/nadmo-bridge/event`
- The event is a bridge-to-comics adapter callback, not a new payment gateway.
- AI inspects customer-supplied screenshot via Workers AI `@cf/moondream/moondream3.1-9B-A2B`. Original screenshot bytes are not stored by this application.
- AI screenshot status `AI_CONSISTENT_NOT_VERIFIED` **does not** activate membership by itself.
- Activation occurs when *both* AI review is consistent and a signed merchant event exactly matches the claimed transaction reference, amount, merchant NMID, invoice lifetime, and payment time (±15 min to customer claim).
- Existing D1 paid-membership trigger grants access, preserving time remaining.
- Bridge not connected, incomplete image, mismatched amount, wrong merchant, unknown package, invalid timestamp, duplicate event: **no automatic activation**.

## Required Cloudflare secrets / bindings (never commit values)
- `NADMO_PAYMENT_BRIDGE_SECRET`: strong random secret shared only with the existing bridge (HMAC-SHA256).
- `NADMO_BRIDGE_DEVICE_ID`: specifically provisioned Android merchant device ID.
- `NADMO_BRIDGE_PACKAGE`: verified actual merchant notification package name as emitted by the existing bridge.
- `AI`: already configured Workers AI binding in Wrangler.

## Bridge callback request contract
Headers:
- `content-type: application/json`
- `x-nadmo-bridge-timestamp: <RFC3339 UTC timestamp>`
- `x-nadmo-bridge-signature: <64-character hex HMAC_SHA256(secret, timestamp + '.' + raw_JSON_body)>`

JSON example (identifiers are placeholders only):
```json
{
  "event_id": "evt-unique-123456",
  "transaction_reference": "merchant-payment-id",
  "amount_idr": 9900,
  "paid_at": "2026-11-27T07:00:00.000Z",
  "merchant_nmid": "ID1026631571449",
  "payment_status": "SUCCESS",
  "device_id": "enrolled-device-id",
  "package_name": "verified-merchant-app-package"
}
```
If the existing bridge uses a different payload, adapt its connector **without** duplicating the Android collector. Do not forge events for launch.

## Verification checklist
1. Apply migrations `0004_ai_receipt_reviews.sql` and `0005_nadmo_bridge_events.sql` (the Worker also creates missing tables idempotently for compatibility).
2. Connect the existing bridge with the three secrets and a validated notification package.
3. Check `GET /api/membership/health`: `ai_admin_receipt=true`, `bridge_connection=CONFIGURED`.
4. Run an actual Rp9.900 test payment; confirm DANA Bisnis merchant notification and transaction reference.
5. Upload a real matching payment screenshot from the paying account; verify `MATCHED`, one payment, one entitlement, correct membership dates.
6. Test forged signature, wrong amount, wrong NMID, duplicate transaction, screenshot reuse, and unmatched reference; verify fail closed.
7. Before real merchant notification tests succeed, keep status as *AI review ready; auto-activation not proven*, not *fully automatic*.
