import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePassport,validateIsolation,buildReleasePackage,canHandoffToCore} from '../src/division-core.js';

const passport={
  protocolVersion:'1.0',divisionNumber:'001',divisionId:'amu',seriesId:'amu',
  brain:{mode:'ISOLATED_DIVISION_BRAIN',contextPolicy:'LOAD_THIS_DIVISION_ONLY',sharedUniverseContract:null},
  memory:{passport:'/divisions/amu/passport.json',currentState:'/divisions/amu/current-state.json',contextManifest:'/divisions/amu/context-manifest.json'},
  production:{ownerApprovalRequired:true},release:{mode:'FREE_BETA',monetization:{status:'OFF'}},handoff:{target:'AM_STUDIO_CORE'}
};
const state={nextProductionTarget:{number:2,title:'The First Breach'}};

test('AMU passport satisfies isolated division contract',()=>{
  assert.deepEqual(validatePassport(passport),{ok:true,errors:[]});
});

test('cross-division imports are rejected without explicit contract',()=>{
  const result=validateIsolation(passport,{divisionId:'amu',divisionLocalOnly:true,crossDivisionImports:['other']});
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('CROSS_DIVISION_IMPORT_WITHOUT_CONTRACT'));
});

test('release package contains only normalized core handoff data',()=>{
  const pkg=buildReleasePackage({passport,currentState:state,episode:2,pageCount:24,divisionQc:'QC_PASS',ownerApproved:true,pipelineState:'OWNER_APPROVED'});
  assert.equal(pkg.title,'The First Breach');
  assert.equal(pkg.assetRoot,'comics/amu/ep002/');
  assert.equal(pkg.monetization,'OFF');
  assert.deepEqual(canHandoffToCore(pkg),{ok:true,errors:[]});
});

test('core handoff is blocked before owner approval',()=>{
  const pkg=buildReleasePackage({passport,currentState:state,episode:2,pageCount:24,divisionQc:'QC_PASS',ownerApproved:false});
  const result=canHandoffToCore(pkg);
  assert.equal(result.ok,false);
  assert.ok(result.errors.includes('OWNER_APPROVAL_REQUIRED'));
});