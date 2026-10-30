import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePassport,validateIsolation,evaluateProductionGate,buildReleasePackage} from '../src/division-core.js';

const readJson=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));

test('Han Kera reuses the existing registered hk series and publisher identity',async()=>{
  const index=await readJson('../public/divisions/index.json');
  const registry=await readJson('../public/publisher-registry.json');
  const publisherPassport=await readJson('../public/publisher/passports/hk.json');
  const division=index.divisions.filter(x=>x.divisionId==='han-kera');
  assert.equal(division.length,1);
  assert.equal(division[0].seriesId,'hk');
  assert.equal(division[0].divisionNumber,'005');
  assert.equal(division[0].status,'CANON_RECOVERY_HOLD');
  const existing=registry.profiles.filter(x=>x.comic_id==='hk');
  assert.equal(existing.length,1);
  assert.equal(existing[0].channel_id,'ch-han-kera');
  assert.equal(existing[0].profile_code,'SR-208');
  assert.equal(existing[0].canon_context,'/divisions/han-kera/context-manifest.json');
  assert.equal(publisherPassport.comic_id,'hk');
  assert.equal(publisherPassport.canon_context,existing[0].canon_context);
});

test('Han Kera has an isolated bootable Division Brain with canon hold enforced',async()=>{
  const passport=await readJson('../public/divisions/han-kera/passport.json');
  const manifest=await readJson('../public/divisions/han-kera/context-manifest.json');
  const lock=await readJson('../public/divisions/han-kera/canon-lock.json');
  const ledger=await readJson('../public/divisions/han-kera/source-ledger.json');
  const state=await readJson('../public/divisions/han-kera/current-state.json');

  assert.deepEqual(validatePassport(passport),{ok:true,errors:[]});
  assert.deepEqual(validateIsolation(passport,manifest),{ok:true,errors:[]});
  assert.equal(state.divisionId,'han-kera');
  assert.equal(state.seriesId,'hk');
  assert.equal(state.lastCompletedPage,null);
  assert.equal(passport.memory.masterStory,null);
  assert.equal(manifest.crossDivisionImports.length,0);
  assert.equal(manifest.bootOrder.every(x=>x.path.startsWith('/divisions/han-kera/')||x.path==='/catalog.json'),true);

  const gate=evaluateProductionGate({passport,contextManifest:manifest,canonLock:lock,sourceLedger:ledger});
  assert.equal(gate.ok,false);
  for(const err of ['PASSPORT_GENERATION_BLOCKED','CONTEXT_GENERATION_BLOCKED','CANON_LOCK_GENERATION_BLOCKED','SOURCE_LEDGER_AI_RESOLUTION_BLOCKED','CANON_RECOVERY_HOLD']){
    assert.ok(gate.errors.includes(err),err);
  }
  assert.equal(lock.releaseAllowed,false);
  assert.equal(ledger.safeToGenerate,false);
  assert.equal(ledger.safeToRelease,false);
  assert.throws(()=>buildReleasePackage({passport,currentState:state,episode:1,pageCount:8}),/DIVISION_CANON_HOLD_GENERATION_BLOCKED/);
});
