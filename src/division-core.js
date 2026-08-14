const DIVISION_ID=/^[a-z0-9-]+$/;

const normalizeTitle=value=>String(value||'').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');

function titleClaims(divisionId,state={}){
  const claims=[];
  const add=(scope,node,authoritative=false)=>{
    const title=String(node?.title||'').trim();
    if(!title)return;
    claims.push({divisionId,scope,title,normalizedTitle:normalizeTitle(title),authoritative});
  };
  const last=state.lastCompletedEpisode;
  add('lastCompletedEpisode',last,Boolean(last?.canon==='CANON_FINAL'||last?.ownerVerified===true));
  const current=state.currentEpisode;
  add('currentEpisode',current,Boolean(current?.canon==='CANON_FINAL'||current?.ownerVerified===true));
  add('nextProductionTarget',state.nextProductionTarget,false);
  return claims;
}

export function detectCrossDivisionTitleCollisions({divisionId,currentState={},states=[]}={}){
  const target=titleClaims(divisionId,currentState);
  if(!target.length)return [];
  const foreignTrusted=[];
  for(const item of states||[]){
    const foreignDivisionId=item?.division?.divisionId||item?.currentState?.divisionId;
    if(!foreignDivisionId||foreignDivisionId===divisionId)continue;
    foreignTrusted.push(...titleClaims(foreignDivisionId,item.currentState||{}).filter(x=>x.authoritative));
  }
  const collisions=[];
  for(const claim of target){
    for(const foreign of foreignTrusted){
      if(claim.normalizedTitle&&claim.normalizedTitle===foreign.normalizedTitle){
        collisions.push({
          type:'EXACT_TITLE_COLLISION',
          title:claim.title,
          targetDivisionId:divisionId,
          targetScope:claim.scope,
          authoritativeDivisionId:foreign.divisionId,
          authoritativeScope:foreign.scope,
          authoritativeTitle:foreign.title
        });
      }
    }
  }
  return collisions;
}

export function validatePassport(passport={}){
  const errors=[];
  if(passport.protocolVersion!=='1.0')errors.push('UNSUPPORTED_PROTOCOL_VERSION');
  if(!/^\d{3}$/.test(String(passport.divisionNumber||'')))errors.push('INVALID_DIVISION_NUMBER');
  if(!DIVISION_ID.test(String(passport.divisionId||'')))errors.push('INVALID_DIVISION_ID');
  if(!DIVISION_ID.test(String(passport.seriesId||'')))errors.push('INVALID_SERIES_ID');
  if(passport.brain?.mode!=='ISOLATED_DIVISION_BRAIN')errors.push('BRAIN_NOT_ISOLATED');
  if(passport.brain?.contextPolicy!=='LOAD_THIS_DIVISION_ONLY')errors.push('INVALID_CONTEXT_POLICY');
  if(!passport.memory?.passport||!passport.memory?.currentState||!passport.memory?.contextManifest)errors.push('MEMORY_POINTERS_INCOMPLETE');
  if(passport.production?.ownerApprovalRequired!==true)errors.push('OWNER_APPROVAL_GATE_REQUIRED');
  if(passport.handoff?.target!=='AM_STUDIO_CORE')errors.push('INVALID_HANDOFF_TARGET');
  return {ok:errors.length===0,errors};
}

export function validateIsolation(passport={},contextManifest={}){
  const errors=[];
  if(passport.divisionId!==contextManifest.divisionId)errors.push('DIVISION_CONTEXT_MISMATCH');
  if(contextManifest.divisionLocalOnly!==true)errors.push('DIVISION_LOCAL_ONLY_REQUIRED');
  if(Array.isArray(contextManifest.crossDivisionImports)&&contextManifest.crossDivisionImports.length>0&&!passport.brain?.sharedUniverseContract)errors.push('CROSS_DIVISION_IMPORT_WITHOUT_CONTRACT');
  return {ok:errors.length===0,errors};
}

export function evaluateProductionGate({passport={},contextManifest={},canonLock=null,sourceLedger=null,recoveryLedger=null,crossDivisionConflicts=[]}={}){
  const errors=[];
  if(passport.production?.generationAllowed===false)errors.push('PASSPORT_GENERATION_BLOCKED');
  if(contextManifest.generationAllowed===false)errors.push('CONTEXT_GENERATION_BLOCKED');
  if(canonLock?.generationAllowed===false)errors.push('CANON_LOCK_GENERATION_BLOCKED');
  if(canonLock?.releaseAllowed===false)errors.push('CANON_LOCK_RELEASE_BLOCKED');
  if(sourceLedger?.safeToResolveByAI===false)errors.push('SOURCE_LEDGER_AI_RESOLUTION_BLOCKED');
  if(Array.isArray(sourceLedger?.conflicts)&&sourceLedger.conflicts.some(x=>String(x?.status||'').includes('UNRESOLVED')||String(x?.status||'')==='CONFLICT'))errors.push('UNRESOLVED_SOURCE_CONFLICT');
  if(recoveryLedger?.safeToGenerate===false)errors.push('RECOVERY_LEDGER_NOT_SAFE_TO_GENERATE');
  if(Array.isArray(recoveryLedger?.conflicts)&&recoveryLedger.conflicts.some(x=>String(x?.status||'')==='CONFLICT'))errors.push('UNRESOLVED_CANON_CONFLICT');
  if(Array.isArray(crossDivisionConflicts)&&crossDivisionConflicts.length>0)errors.push('CROSS_DIVISION_CANON_COLLISION');
  if(String(passport.identity?.status||'').includes('CANON_RECOVERY_HOLD'))errors.push('CANON_RECOVERY_HOLD');
  return {ok:errors.length===0,errors};
}

export function buildReleasePackage({passport,currentState,episode,pageCount,divisionQc='QC_WAIT',ownerApproved=false,pipelineState='ASSET_WAIT',scheduledAt=null}={}){
  const pv=validatePassport(passport||{});
  if(!pv.ok)throw new Error(`INVALID_PASSPORT:${pv.errors.join(',')}`);
  if(passport?.production?.generationAllowed===false||String(passport?.identity?.status||'').includes('CANON_RECOVERY_HOLD'))throw new Error('DIVISION_CANON_HOLD_GENERATION_BLOCKED');
  const ep=Number(episode);
  const pages=Number(pageCount);
  if(!Number.isInteger(ep)||ep<1)throw new Error('INVALID_EPISODE');
  if(!Number.isInteger(pages)||pages<1)throw new Error('INVALID_PAGE_COUNT');
  const target=currentState?.nextProductionTarget;
  const title=target&&Number(target.number)===ep?String(target.title||`Episode ${ep}`):`Episode ${ep}`;
  return {
    protocolVersion:'1.0',
    divisionId:passport.divisionId,
    seriesId:passport.seriesId,
    episode:ep,
    title,
    pageCount:pages,
    divisionQc,
    ownerApproved:Boolean(ownerApproved),
    releaseMode:passport.release?.mode||'FREE_BETA',
    pipelineState,
    scheduledAt,
    monetization:passport.release?.monetization?.status||'OFF',
    assetRoot:`comics/${passport.seriesId}/ep${String(ep).padStart(3,'0')}/`,
    currentStateAdvance:null
  };
}

export function canHandoffToCore(pkg={}){
  const errors=[];
  if(pkg.divisionQc!=='QC_PASS')errors.push('DIVISION_QC_NOT_PASS');
  if(pkg.ownerApproved!==true)errors.push('OWNER_APPROVAL_REQUIRED');
  if(!Number.isInteger(pkg.pageCount)||pkg.pageCount<1)errors.push('INVALID_PAGE_COUNT');
  if(!pkg.divisionId||!pkg.seriesId)errors.push('DIVISION_IDENTITY_MISSING');
  return {ok:errors.length===0,errors};
}