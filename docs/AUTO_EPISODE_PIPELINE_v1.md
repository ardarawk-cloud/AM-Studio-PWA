# AM STUDIO — AUTO EPISODE PIPELINE v1

Status: RC
Timezone: Asia/Makassar
Default release slot: 19:00 WITA

## Purpose
Make episode delivery repeatable without allowing incomplete or unapproved material to leak into the public reader.

## State model
DRAFT → ASSET_WAIT → QC_WAIT → QC_PASS → OWNER_APPROVED → SCHEDULED → PUBLISHED

Safety exit: any episode may move to HOLD.

## Hard gates
An episode cannot publish unless all gates pass:
1. Valid series + episode metadata.
2. Series cover exists.
3. Total page count is declared.
4. Every page from 1 through total page count exists with no gap.
5. Technical QC = QC_PASS.
6. Owner approval = true.

## Upload behavior
New episode metadata written through the existing Admin Asset Manager is converted to staging state (`ASSET_WAIT`). Staged episodes are filtered from the public reader and catalog until `PUBLISHED`.

Legacy owner-approved episodes without pipeline metadata remain public and are treated as legacy published material so existing releases are not accidentally hidden.

## Owner controls
The mobile Pipeline panel provides:
- VALIDATE
- APPROVE + SCHEDULE
- PUBLISH NOW
- HOLD

`APPROVE + SCHEDULE` chooses the next 19:00 WITA release slot by default.

## Automatic release
Cloudflare cron runs at 11:00 UTC / 19:00 WITA. Only due `SCHEDULED` episodes are considered. A failed release validation moves the episode to HOLD rather than publishing partial content.

## Scope v1
This release engine controls publication to the AM STUDIO PWA/reader. Facebook/social promotion automation is a later marketing phase and is not part of v1.

## Monetization
No payment behavior is activated by this pipeline. FREE Beta / future AM STUDIO PASS policy remains a separate product gate.
