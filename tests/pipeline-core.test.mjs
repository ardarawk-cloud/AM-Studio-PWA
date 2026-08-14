import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEpisode,derivePipelineState,nextReleaseAt,isReaderPublished} from '../src/pipeline-core.js';

test('complete episode validates',()=>{
  const v=validateEpisode({seriesId:'amu',episode:2,pageCount:3,pages:[1,2,3],hasCover:true});
  assert.equal(v.ok,true);
});

test('missing page blocks release',()=>{
  const v=validateEpisode({seriesId:'amu',episode:2,pageCount:3,pages:[1,3],hasCover:true});
  assert.equal(v.ok,false);assert.deepEqual(v.missingPages,[2]);
});

test('state gates owner approval',()=>{
  const base={seriesId:'amu',episode:2,pageCount:2,pages:[1,2],hasCover:true};
  assert.equal(derivePipelineState({...base,meta:{}}),'QC_WAIT');
  assert.equal(derivePipelineState({...base,meta:{technicalQc:'QC_PASS'}}),'QC_PASS');
  assert.equal(derivePipelineState({...base,meta:{technicalQc:'QC_PASS',ownerApproved:true}}),'OWNER_APPROVED');
  assert.equal(derivePipelineState({...base,meta:{technicalQc:'QC_PASS',ownerApproved:true,releaseState:'SCHEDULED'}}),'SCHEDULED');
});

test('reader hides staged meta',()=>{
  assert.equal(isReaderPublished({releaseState:'ASSET_WAIT'}),false);
  assert.equal(isReaderPublished({releaseState:'PUBLISHED'}),true);
  assert.equal(isReaderPublished({}),true);
});

test('next release respects WITA 19:00',()=>{
  assert.equal(nextReleaseAt(Date.parse('2026-08-14T08:00:00Z')),'2026-08-14T11:00:00.000Z');
  assert.equal(nextReleaseAt(Date.parse('2026-08-14T12:00:00Z')),'2026-08-15T11:00:00.000Z');
});
