# AM STUDIO Comics — Verified conversation-to-R2 publishing bridge

Verified in production: 30 Oct 2026 WITA for WUKONG: REBOOTED Episode 001, release `bee59508-d077-4f19-a472-5bf25c4f8178`. Receipt: `PUBLISHED`; all 3 original PNG file hashes matched, and the public reader displayed 3 pages.

## Goal
The owner's instruction `UPLOAD` in a comic's own conversation means publish its already-approved cover/episode to `comics.nadmo.id`, with no manual downloads, file chooser, regenerated art, or cross-series routing.

## Required safety checks
1. Read the exact channel passport at `/publisher/passports/{comic_id}.json`. Do not invent a comic ID or channel mapping.
2. Inspect the original approved image files in the conversation. Preserve bytes. Verify SHA-256, size, MIME, page order, owner approval and canon QC.
3. Check the existing approved private R2 manifest, or create one under `system/publisher/inbox/{uuid}.json` using the authenticated owner's Cloudflare connector. Never fabricate approval or expose an administrator key.
4. Prefer `scripts/publish-comic.py` direct upload when the execution runtime can reach `comics.nadmo.id`.

## Tested fallback when the local runtime cannot resolve/reach the site
The user must not download or re-upload the art. A connected temporary media transport may be used:
1. The original conversation file reference (`sediment://file_...`) can be passed into the user's connected Google Drive `upload_file`, then `fetch(download_raw_file=true,include_base64=true)`. This returns the original complete base64 into Code Mode memory. Only use files explicitly approved for public comic publication; remove these newly created temporary Drive files once the release is verified.
2. In `functions.exec`, split the base64 on multiples of 4 (proven safe: 262144 base64 characters = 196608 raw bytes). Forward each segment directly to `mcp__Cloudflare__execute` without printing the binary. Decode with `atob` into `Uint8Array` and call authenticated R2 `PUT /accounts/{account_id}/r2/buckets/am-studio-comics/objects/{key}` using `rawBody:true` and `contentType:'application/octet-stream'`. Restrict part keys to `system/publisher/staging-parts/{release_id}/{index}/{part_index}.bin`. Avoid passing a whole 3MB image to one connector call: HTTP/2 message-size limits have caused failures.
3. Assemble using a narrowly scoped, short-lived Cloudflare Worker with only the existing `COMIC_ASSETS` R2 binding. It must hard-code the authorized release ID, expected byte size, per-page SHA-256 and fixed staging destinations; read the exact numbered parts, check every part size, recompute full SHA-256, and write only the approved `system/publisher/staging/{release_id}/{index}.png` files. Never create a broad public R2 write API. Disable/delete temporary Worker after use.
4. Call the existing official `POST /api/publisher/process/{release_id}` with same-origin and target-pinning headers. The server validates approved manifest, final bytes, episode metadata and reader catalog. An ephemeral Worker with a single fixed approved release may call this endpoint if the local runtime cannot.
5. Require an actual `PUBLISHED` receipt. Read back the release status, ensure catalog entry, exactly expected reader pages, and canonical R2 objects with matching size/SHA. Verify the public reading URL works.
6. Delete only the *temporary transfer parts*, *staging blobs*, the narrowly scoped temporary Worker, and any temporary Drive copies. Preserve final `comics/{comic_id}/epNNN/page-NN.png`, episode `meta.json`, cover, approved private manifest, and database audit receipt.

## Accepted test
- Comic: `wukong-rebooted`; channel `ch-wukong-rebooted`
- Title: `Manusia yang Dilupakan`; episode 1; page count 3
- Original PNG sizes: 3,220,622 / 3,364,328 / 3,051,762 bytes
- Original hashes:
  - Page 1: `0de5e7a7f0a13fa58d89bc3d1899aba87d7e78a72cd81972566c2c6b8b501ce8`
  - Page 2: `cd9a09d6598fba0a8571b13423c4dd92fc584205b452f7606e0f64e93431146b`
  - Page 3: `59945875cb247d440db66d4a50b0cf39b9b1c2039d95bc1facfba6c60e0c1529`
- Completed receipt timestamp: `2026-10-29T18:12:16.615Z`
- Browser verification: public homepage showed Wukong as `PUBLISHED` with `1 episode`; direct reader URL opened `Manusia yang Dilupakan` with `3 PAGES` and three page image URLs.
- Work completed without a user download and without generating another image.

This fallback is a verified agent-executed procedure, not a claim that every future conversation automatically has identical connector access. Re-check available tools and file references for each run.
