import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {derivePipelineState,isReaderPublished,nextReleaseAt,validateEpisode} from '../src/pipeline-core.js';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));

const canon=await json('../public/divisions/blackjack/canon-lock.json');
const state=await json('../public/divisions/blackjack/current-state.json');
const episode=await json('../public/divisions/blackjack/episode-001.director-draft-v1.json');
const pageCount=episode.pagePlan.length;
const fullPages=Array.from({length:pageCount},(_,i)=>i+1);
const base={seriesId:'ld',episode:1,pageCount,hasCover:true,pages:fullPages};

test('Blackjack automatic pilot boots only from locked current canon',()=>{
  assert.equal(canon.lockState,'MASTER_CANON_LOCKED_READY_FOR_PRODUCTION');
  assert.equal(canon.masterStory.ownerApproved,true);
  assert.equal(canon.generationAllowed,true);
  assert.equal(canon.releaseAllowed,false);
  assert.equal(state.currentEpisode.title,'The Ace in the Rain');
  assert.equal(state.nextProductionTarget.page,1);
  assert.equal(episode.episodeTitle,'The Ace in the Rain');
  assert.equal(pageCount,8);
});

test('empty Blackjack episode stays ASSET_WAIT and cannot leak',()=>{
  const input={seriesId:'ld',episode:1,pageCount,pages:[],hasCover:false,meta:{releaseState:'ASSET_WAIT'}};
  const validation=validateEpisode(input);
  assert.equal(validation.ok,false);
  assert.ok(validation.issues.includes('COVER_REQUIRED'));
  assert.ok(validation.issues.includes('MISSING_PAGES'));
  assert.deepEqual(validation.missingPages,fullPages);
  assert.equal(derivePipelineState(input),'ASSET_WAIT');
  assert.equal(isReaderPublished(input.meta),false);
});

test('complete assets advance automatically to QC_WAIT before technical QC',()=>{
  assert.equal(validateEpisode(base).ok,true);
  assert.equal(derivePipelineState({...base,meta:{}}),'QC_WAIT');
});

test('technical QC pass advances to QC_PASS but still waits for owner gate',()=>{
  const input={...base,meta:{technicalQc:'QC_PASS',ownerApproved:false}};
  assert.equal(derivePipelineState(input),'QC_PASS');
  assert.equal(isReaderPublished({releaseState:'QC_PASS'}),false);
});

test('owner approval can schedule the complete episode to the next 19:00 WITA slot',()=>{
  const input={...base,meta:{technicalQc:'QC_PASS',ownerApproved:true,releaseState:'SCHEDULED'}};
  assert.equal(derivePipelineState(input),'SCHEDULED');
  assert.equal(isReaderPublished(input.meta),false);
  assert.equal(nextReleaseAt(Date.parse('2026-08-14T16:44:00Z')),'2026-08-15T11:00:00.000Z');
});

test('canon release gate remains closed during experiment even if pipeline metadata is forced to PUBLISHED',()=>{
  const meta={technicalQc:'QC_PASS',ownerApproved:true,releaseState:'PUBLISHED'};
  assert.equal(derivePipelineState({...base,meta}),'PUBLISHED');
  const integratedPublishAllowed=canon.releaseAllowed===true && meta.ownerApproved===true && validateEpisode(base).ok;
  assert.equal(integratedPublishAllowed,false);
});

test('Royal Gambler legacy mechanics remain excluded from the automatic pilot',()=>{
  const rules=canon.rules.join(' ');
  assert.match(rules,/ROYAL_GAMBLER_LEGACY_MECHANICS_REMAIN_QUARANTINED/);
  assert.equal(state.powerState.legacyProbabilityMechanics,'QUARANTINED_NOT_CANON');
});
