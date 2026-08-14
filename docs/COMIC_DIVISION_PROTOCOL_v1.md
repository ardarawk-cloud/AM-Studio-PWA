# AM STUDIO — COMIC DIVISION PROTOCOL v1

Status: RC
Principle: GLOBALIZE INFRASTRUCTURE, ISOLATE INTELLIGENCE

## Core rule
1 COMIC = 1 DIVISION = 1 BRAIN = 1 PASSPORT.

AM STUDIO Core is the studio orchestrator. It owns shared infrastructure only. Story intelligence is never shared across unrelated comic divisions.

## AM STUDIO Core owns
- Android/PWA shell
- account and AM STUDIO PASS
- payment infrastructure
- R2 storage
- release engine and global release calendar
- analytics
- admin security
- publication transport

## Each Comic Division owns
- Passport
- Master Story
- Character Bible
- World Bible
- Visual Bible
- Power/Combat Bible when applicable
- Research policy/source ledger when applicable
- Canon Registry
- Episode Registry
- Current State
- Continuity State
- Production State
- IP-specific release policy overrides

## Passport role
Passport is the brain bootloader and the contract between a Comic Division and AM STUDIO Core.

The Passport does not contain every canon detail. It declares identity, authority order, memory locations, current production target, isolation boundaries, and release handoff rules.

## Memory model
- Long-term memory: Master Story + Bibles + Canon Registry.
- Working memory: Current State + Continuity State + Production State.
- Historical memory: Episode Registry + Published Archive.

A brain must load only its own division memory. It must not import another division's story context unless an explicit shared-universe contract exists.

## Authority order
Default authority order inside a division:
1. Owner-approved explicit lock
2. Master Story
3. Character/World/Visual/Power Bibles
4. Canon Registry
5. Current State / Continuity State
6. Episode Registry
7. Production draft

Missing canon must never be invented to complete automation.

## Production contract
Division Brain:
Passport -> Context Load -> Story/Production -> Division QC -> Owner Approval -> Release Package

AM STUDIO Core:
Release Package -> Technical Gate -> Queue -> Publish -> Archive/Analytics

## Release package
Core only needs a normalized package such as:
- divisionId
- seriesId
- episode number/title
- page count
- asset status
- division QC
- owner approval
- release mode
- scheduled time

Core does not need full story context to publish an approved package.

## Isolation rules
- Character canon cannot cross divisions by default.
- Current State cannot be written by another division.
- Visual rules cannot be inherited from another division unless explicitly declared.
- Production completion in one division cannot advance another division.
- Shared-universe relationships must be explicit in Passport; they are not inferred.

## Current State rule
Current State is the authoritative working memory after the latest completed canonical episode. On episode finalization, the Division Brain advances Current State. The global Core never rewrites story state.

## Monetization inheritance
Monetization is global infrastructure. A division may declare FREE/PASS/LOCKED policy, but payment activation remains controlled by AM STUDIO Core.

## Initial implementation
Division 001: Arda Moron Universe (AMU).

AMU is the reference implementation used to validate Passport loading, isolated working memory, release handoff, and future automated production orchestration.