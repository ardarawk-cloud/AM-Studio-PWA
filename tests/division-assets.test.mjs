import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePassport,validateIsolation,evaluateProductionGate} from '../src/division-core.js';

const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));

test('Division registry boots AMU as Division 001 only',async()=>{
  const registry=await json('../public/divisions/index.json');
  assert.equal(registry.architecture,'1_COMIC_1_DIVISION_1_BRAIN_1_PASSPORT');
  assert.equal(registry.divisions[0].divisionNumber,'001');
  assert.equal(registry.divisions[0].divisionId,'amu');
});

test('AMU passport and context manifest satisfy isolation contract',async()=>{
  const passport=await json('../public/divisions/amu/passport.json');
  const manifest=await json('../public/divisions/amu/context-manifest.json');
  assert.deepEqual(validatePassport(passport),{ok:true,errors:[]});
  assert.deepEqual(validateIsolation(passport,manifest),{ok:true,errors:[]});
});

test('AMU working memory freezes EP001 at 22 pages and advances target to EP002',async()=>{
  const state=await json('../public/divisions/amu/current-state.json');
  assert.equal(state.lastCompletedEpisode.number,1);
  assert.equal(state.lastCompletedEpisode.pageCount,22);
  assert.equal(state.lastCompletedEpisode.production,'COMPLETE');
  assert.equal(state.nextProductionTarget.number,2);
  assert.equal(state.nextProductionTarget.title,'The First Breach');
});

test('Blackjack is Division 004 and remains hard-blocked during canon recovery',async()=>{
  const registry=await json('../public/divisions/index.json');
  const division=registry.divisions.find(x=>x.divisionId==='blackjack');
  assert.equal(division.divisionNumber,'004');
  assert.equal(division.seriesId,'ld');
  assert.equal(division.status,'CANON_RECOVERY_HOLD');

  const passport=await json('../public/divisions/blackjack/passport.json');
  const manifest=await json('../public/divisions/blackjack/context-manifest.json');
  const lock=await json('../public/divisions/blackjack/canon-lock.json');
  const sourceLedger=await json('../public/divisions/blackjack/source-ledger.json');
  const ledger=await json('../public/divisions/blackjack/recovery-ledger.json');
  const state=await json('../public/divisions/blackjack/current-state.json');

  assert.deepEqual(validatePassport(passport),{ok:true,errors:[]});
  assert.deepEqual(validateIsolation(passport,manifest),{ok:true,errors:[]});
  const gate=evaluateProductionGate({passport,contextManifest:manifest,canonLock:lock,sourceLedger,recoveryLedger:ledger});
  assert.equal(gate.ok,false);
  assert.ok(gate.errors.includes('UNRESOLVED_SOURCE_CONFLICT'));
  assert.ok(gate.errors.includes('UNRESOLVED_CANON_CONFLICT'));
  assert.equal(state.currentEpisode.title,null);
  assert.equal(state.currentEpisode.titleStatus,'UNKNOWN_CROSS_IP_COLLISION');
  assert.ok(sourceLedger.conflicts.some(x=>x.conflictId==='EPISODE_1_TITLE_CROSS_IP_COLLISION'));
  assert.equal(lock.masterStory.ownerApproved,false);
  assert.equal(sourceLedger.safeToResolveByAI,false);
  assert.equal(ledger.safeToGenerate,false);
});