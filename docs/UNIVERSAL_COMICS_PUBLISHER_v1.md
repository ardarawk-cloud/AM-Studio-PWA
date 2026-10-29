# Universal Comics Publisher v1 — AM STUDIO

This extends the existing `am-studio-pwa` Worker, `am-studio-comics` R2 bucket and `MEMBERSHIP_DB`. No second website, merchant, payment account or publishing bucket is needed.

## Owner rule: 27 October 2026

Every published page in episodes 1–9 is a free preview. Episode 10 and later requires an active catalog membership, unless the administrator explicitly approves a free episode exception. The boundary is stored in `catalog_access_settings` and editable in `/admin/billing` with an audit reason. An episode within the global preview cannot be made premium individually.

The complete existing R2 comic inventory was inspected before applying the rule: 96 objects across 12 existing Comic IDs; the highest existing episode number was 3. Nine pages of HPG episode 1 are pages, not nine episodes. No existing episode 10 or later was found. Existing original bytes and numbering remain unchanged.

ShopeePay checkout remains disabled while merchant/API approval and provider testing are outstanding. Publisher registration or publication never creates a payment, subscription or membership entitlement.

## Canonical destinations

| Production profile | Channel | Comic ID |
| --- | --- | --- |
| 13 Pintu Neraka | ch-13-pintu | 13 |
| Arda Moron Universe | ch-amu | amu |
| Sun Gokong — Perjalanan | ch-sun-gokong-journey | sg-journey |
| Sun Gokong — Pertempuran | ch-sun-gokong-battle | sg-battle |
| Royal Gambler | ch-royal-gambler | royal-gambler |
| The Legendary Decks | ch-legendary-decks | ld |
| Han You | ch-han-you | hy |
| Han Kera | ch-han-kera | hk |
| Arda Comics / Animasi FB | ch-personal-comic | arda-personal-fb |
| Legenda Ling Tian | ch-ling-tian | lt |
| Animasi Konoha | ch-konoha | animasi-konoha |
| Warung Republik | ch-warung-republik | wr |
| Arda Family | ch-arda-family | arda-family |
| Wukong: Rebooted | ch-wukong-rebooted | wukong-rebooted |
| Hikayat Pohon Ganja | ch-hikayat-pohon-ganja | hikayat-pohon-ganja |

The original thirteen production profiles and their SR-201…SR-213 codes were recovered from the owner's ACC OS X Build 214 archive. HPG and Wukong are the additional existing projects in the current owner directive. All twelve currently used website IDs remain unchanged. The previously excluded personal-comic ID `arda-personal-fb` is retained; `animasi-konoha` and `wukong-rebooted` are registered as additional website destinations. No historical SR code is fabricated for HPG/Wukong.

The old archive linked Royal Gambler to Blackjack; the current owner instruction and website maintain `royal-gambler` and `ld` separately. This registry does not overwrite either story, character bible or current state.

`GET /api/publisher/registry` gives the current destination registry.
`GET /publisher/passports/{comic_id}.json` gives the isolated publishing passport and references to existing Division context where available.

Registration of a passport is routing readiness, not a claim that its episode assets, story production or cross-conversation workflow have all been tested. Missing episode art is not generated or replaced by this system.

## Publishing from a production conversation

1. Load the current destination passport. Resolve aliases to its canonical Comic ID. Validate the channel ID; never publish a Royal Gambler asset into `ld` or an AMU asset under a new slug.
2. Load that conversation's approved canon and current state. Inspect the exact original cover/page files and their page numbers. Reject missing, ambiguous or conflicting versions. Do not regenerate, crop, recompress, reorder or relabel art to make a package appear complete.
3. Compute each original file's SHA-256, byte size and actual MIME type. Prepare an immutable manifest with a UUID, explicit owner approval, QC result and approval reference.
4. Use the owner's authenticated Cloudflare connector to write the approved manifest to the existing private R2 key `system/publisher/inbox/{uuid}.json`. Do not ask for or expose the existing Worker administrator secret.
5. Run `python3 scripts/publish-comic.py upload --plan /absolute/upload-plan.json --receipt /absolute/receipt.json` from the production conversation. It sends original binary bytes directly to `POST /api/publisher/uploads/{uuid}/{asset_index}` with `Origin: https://comics.nadmo.id`, `X-AM-Comic-ID`, and `X-AM-Channel-ID`; a file chooser is not required. The server accepts only the exact size, SHA-256 and image type already approved in the private manifest. Existing bytes may be reused only at their own canonical destination when explicitly marked `reuse_existing`. The owner browser at `/publisher/status?id={uuid}` remains an optional manual path.
6. Process the package. The server copies at most four assets per call, verifies every byte hash, writes episode metadata, checks the public catalog/reader overlay, and persists a receipt. Retries resume at the last verified asset.
7. Open the receipt's actual public URL and verify the intended cover or episode. Report success only for the assets and flows actually verified. A cover-only release does not claim an episode has been published.

The public processing/upload endpoints cannot create approvals or choose arbitrary R2 paths. Approval manifests exist only under a private system prefix that the normal comic upload API cannot write. Public uploads must match an approved immutable file digest, and same-origin checks and database rate limits apply. Sensitive provider credentials are not involved.

## Manifest example

The digest and size below are placeholders and must be replaced with measurements from the approved original file. This example itself cannot pass validation.

~~~json
{
  "version": 1,
  "id": "UUID",
  "type": "EPISODE",
  "comic_id": "royal-gambler",
  "channel_id": "ch-royal-gambler",
  "episode": 1,
  "title": "Approved episode title",
  "page_count": 1,
  "pages": [
    {"number": 1, "content_type": "image/png", "size": 0, "sha256": "MEASURED_SHA256"}
  ],
  "owner_approved": true,
  "canon_state": "CANON_FINAL",
  "qc": "QC_PASS",
  "approval_reference": "Reference to the owner's approval and inspected canonical files",
  "reason": "Publish this approved original episode to its own comic"
}
~~~

A cover-only release uses `type: COVER`, `episode: 0`, `page_count: 0`, `pages: []`, and a `cover` object with the same file descriptor fields.

## Atomic visibility and verification

`publisher_releases` holds the immutable manifest hash, lease, processing cursor, status and receipt. `publisher_locks` isolates each comic/episode from competing releases. An unfinished or failed episode is hidden from both the public registry and direct page URLs. It remains blocked while a failed package is repaired. Competing manifests cannot silently replace a published release or existing image bytes.

Every successfully published release has one stable audit entry. Repeated processing returns its stored receipt. Public metadata never labels a partially copied episode as published.

The manual owner uploader remains available at `/owner-upload.html`, now using the same database-backed global preview policy and registered catalog destinations. It is distinct from the private approved-manifest workflow above.

## Verification

Local tests exercise actual SQLite transactions, the production runtime's publishing/catalog layers and an in-memory R2 fixture. Cases include episode 9/10, active/expired/other accounts, administrator policy changes, wrong file hashes, missing sources, partial visibility, channel mismatch, resuming uploads, conflicting manifests, repeated/concurrent processing and original-byte preservation.

These tests are independent of provider sandbox testing. QRIS activation remains unverified until the approved ShopeePay integration is tested.

## Conversation client v1.1 — 29 October 2026

`GET /api/publisher/health` checks the database-backed publisher and advertises the transport. Each current passport includes `agent_upload` with endpoint methods and the exact target headers. Upload and process calls reject a supplied target pair that differs from the approved release, including when returning an already-published receipt. Manifests must include an explicit valid channel. Uploads reject a manifest changed after processing began.

The installed personal skill `am-studio-publisher` supplies the reusable conversation workflow and the same Python client. It is not a background automation: an upload/publish instruction in a production conversation invokes it using that conversation's approved canon and original files. The authenticated Cloudflare connection approves the exact manifest, and the client uploads bytes without obtaining or exposing an administrator key.

Prepare a new package using `python3 scripts/publish-comic.py prepare --spec /absolute/spec.json --out /absolute/new-release-directory`. The spec contains canonical `comic_id`, `channel_id`, `type` (`COVER` or `EPISODE`), `episode`, `title`, `owner_approved`, `canon_state`, `qc`, `approval_reference`, `reason`, optional `cover` (local path), and `pages` (approved ordered local paths). No field establishing approval is assumed. The client emits `manifest.json` and `upload-plan.json`; write the exact manifest to its private inbox key with the authenticated Cloudflare connector before uploading.

For an existing approved inbox job, use `prepare --spec sources.json --existing-manifest original-manifest.json --out new-local-directory`, where `sources.json` contains `files` in manifest order (cover first, then numbered pages). Use `null` only for an explicitly approved `reuse_existing` asset. Keep the same UUID and do not rewrite its existing private manifest. Rerunning `upload` resumes the same release; a published receipt is verified without uploading again.

The client detects actual MIME bytes even when the filename extension is wrong, preserves originals, validates all sources before any write, and verifies public hashes and catalog/reader presence. Membership-protected pages are separately reported as server-receipt verification plus an observed `MEMBERSHIP_REQUIRED` response; they are never described as anonymously downloaded.
