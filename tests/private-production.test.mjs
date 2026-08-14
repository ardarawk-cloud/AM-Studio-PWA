import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateProductionGate,evaluateReleaseGate} from '../src/division-core.js';
import {isPrivateMeta,isPublicMeta,nextMissingPage,buildBlackjackPagePrompt,evaluatePublicRelease} from '../src/private-production-core.js';

const context={
  passport:{production:{generationAllowed:true},identity:{status:'CANON_LOCKED_READY_FOR_PRODUCTION'}},
  contextManifest:{generationAllowed:true,releaseAllowed:false},
  currentState:{continuity:{},nextProductionTarget:{episode:1,title:'The Ace in the Rain'}},
  crossDivisionConflicts:[],
  bootMemory:{
    CANON_LOCK:{generationAllowed:true,releaseAllowed:false},
    EPISODE_001_CANON_PLAN:{chapter:'The Man with the Black Deck',episodeNumber:1,episodeTitle:'The Ace in the Rain',setting:'House Vale estate and Crownhaven, Astracrown',time:'night into pre-dawn during a severe storm',pagePlan:[{page:1,beat:'Crownhaven storm. House Vale prepares for a formal gathering while Adrian resists a predetermined future; a sealed black card case is moved through a restricted corridor.'},{page:2,beat:'The estate is breached.'}]}
  }
};

test('production remains allowed while public release stays closed',()=>{
  assert.deepEqual(evaluateProductionGate({passport:context.passport,contextManifest:context.contextManifest,canonLock:context.bootMemory.CANON_LOCK}),{ok:true,errors:[]});
  const release=evaluateReleaseGate({canonLock:context.bootMemory.CANON_LOCK,contextManifest:context.contextManifest,packageData:{divisionQc:'QC_PASS',ownerApproved:true}});
  assert.equal(release.ok,false);assert.ok(release.errors.includes('CANON_RELEASE_GATE_CLOSED'));
});

test('private staging is never public',()=>{
  assert.equal(isPrivateMeta({releaseState:'PRIVATE_STAGING'}),true);
  assert.equal(isPublicMeta({releaseState:'PRIVATE_STAGING'}),false);
  assert.equal(isPublicMeta({releaseState:'PUBLISHED'}),true);
});

test('next missing page advances deterministically',()=>{
  assert.equal(nextMissingPage(8,[1,2,3]),4);
  assert.equal(nextMissingPage(3,[1,2,3]),null);
});

test('Blackjack page 1 prompt preserves pre-awakening canon',()=>{
  const prompt=buildBlackjackPagePrompt({context,pageNumber:1});
  assert.match(prompt,/The Ace in the Rain/);
  assert.match(prompt,/Black Deck is NOT awakened/);
  assert.match(prompt,/Dealer does NOT appear/);
  assert.match(prompt,/probability manipulation/);
});

test('private production cannot publish through release experiment',()=>{
  const gate=evaluatePublicRelease({canonLock:{releaseAllowed:false},meta:{releaseState:'PRIVATE_REVIEW',ownerApproved:true,pageCount:8}});
  assert.equal(gate.ok,false);assert.ok(gate.errors.includes('CANON_RELEASE_GATE_CLOSED'));
});
