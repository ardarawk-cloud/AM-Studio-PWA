import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatePassport,validateIsolation} from '../src/division-core.js';

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