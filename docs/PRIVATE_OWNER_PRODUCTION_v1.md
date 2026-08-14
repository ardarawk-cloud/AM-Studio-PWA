# AM STUDIO — PRIVATE OWNER PRODUCTION v1

Status: EXPERIMENT RC
Pilot Division: 004 — The Legendary Decks / Blackjack

## Goal
Allow the Owner to generate and review sequential comic pages inside AM STUDIO without exposing unfinished material to public viewers.

## Owner flow
ADMIN unlock → AUTO PRODUCE → generate next canonical page → private R2 staging → Owner preview → PASS or REGENERATE → continue until episode complete → PRIVATE_REVIEW.

## Public firewall
- PRIVATE_STAGING, PRIVATE_REVIEW and PRIVATE_HOLD are never public states.
- Private episodes are filtered from reader-assets.json.
- Private episode counts/titles are filtered from catalog.json.
- Direct public media requests for private episode pages return 404.
- Private preview requires x-am-studio-admin-key.
- Experiment v1 does not expose a working public release action.

## Blackjack pilot locks
Episode 001: The Ace in the Rain.
Production begins Page 1 from locked Current State.
Page 1 occurs before Black Deck awakening and before Adrian publicly becomes Blackjack.
Royal Gambler legacy probability mechanics remain quarantined.

## Generator bridge
Server-side Worker generation requires OPENAI_API_KEY as a Worker secret. The key must never be embedded in the APK or public JavaScript.
Optional AM_STUDIO_IMAGE_MODEL selects the image model; the experimental default is gpt-image-1.
If the server secret is absent, production returns GENERATOR_NOT_CONFIGURED_OPENAI_API_KEY and no fake completion is recorded.

## Quality and owner control
Generated pages enter OWNER_REVIEW. The Owner may PASS or REGENERATE each page. Automatic generation does not imply final visual approval.

## Release
Public release remains a separate gate requiring an episode-complete state, final QC and explicit Owner release approval. Monetization remains OFF.
