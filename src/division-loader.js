import {validatePassport,validateIsolation,evaluateProductionGate} from './division-core.js';

async function readJsonAsset(env,requestUrl,path){
  if(!env?.ASSETS)throw new Error('ASSETS_BINDING_REQUIRED');
  const url=new URL(path,requestUrl);
  const response=await env.ASSETS.fetch(new Request(url.toString(),{method:'GET',headers:{accept:'application/json'}}));
  if(!response.ok)throw new Error(`DIVISION_ASSET_HTTP_${response.status}:${path}`);
  return response.json();
}

export async function loadDivisionRegistry(env,requestUrl){
  return readJsonAsset(env,requestUrl,'/divisions/index.json');
}

export async function loadDivisionStates(env,requestUrl){
  const registry=await loadDivisionRegistry(env,requestUrl);
  const states=await Promise.all((registry.divisions||[]).map(async division=>{
    const currentState=await readJsonAsset(env,requestUrl,division.currentState);
    if(currentState.divisionId!==division.divisionId)throw new Error(`CURRENT_STATE_DIVISION_MISMATCH:${division.divisionId}`);
    return {division,currentState};
  }));
  return {registry,states};
}

async function loadBootMemory(env,requestUrl,manifest,preloaded={}){
  const memory={};
  for(const item of [...(manifest.bootOrder||[])].sort((a,b)=>Number(a.priority||0)-Number(b.priority||0))){
    if(!item?.type||!item?.path)continue;
    try{
      memory[item.type]=preloaded[item.path]||await readJsonAsset(env,requestUrl,item.path);
    }catch(error){
      if(item.required===true)throw new Error(`REQUIRED_BOOT_MEMORY_FAILED:${item.type}:${String(error?.message||error)}`);
      memory[item.type]={unavailable:true,error:String(error?.message||error)};
    }
  }
  return memory;
}

export async function loadDivisionContext(env,requestUrl,divisionId){
  const registry=await loadDivisionRegistry(env,requestUrl);
  const division=(registry.divisions||[]).find(x=>x.divisionId===divisionId);
  if(!division)throw new Error('DIVISION_NOT_FOUND');
  const [passport,currentState,manifest]=await Promise.all([
    readJsonAsset(env,requestUrl,division.passport),
    readJsonAsset(env,requestUrl,division.currentState),
    readJsonAsset(env,requestUrl,division.contextManifest)
  ]);
  const passportCheck=validatePassport(passport);
  if(!passportCheck.ok)throw new Error(`INVALID_DIVISION_PASSPORT:${passportCheck.errors.join(',')}`);
  const isolationCheck=validateIsolation(passport,manifest);
  if(!isolationCheck.ok)throw new Error(`DIVISION_ISOLATION_FAILED:${isolationCheck.errors.join(',')}`);
  if(currentState.divisionId!==divisionId)throw new Error('CURRENT_STATE_DIVISION_MISMATCH');

  const bootMemory=await loadBootMemory(env,requestUrl,manifest,{
    [division.passport]:passport,
    [division.currentState]:currentState,
    [division.contextManifest]:manifest
  });
  const canonLock=bootMemory.CANON_LOCK||null;
  const sourceLedger=bootMemory.SOURCE_LEDGER||null;
  const recoveryLedger=bootMemory.RECOVERY_LEDGER||null;
  const productionGate=evaluateProductionGate({passport,contextManifest:manifest,canonLock,sourceLedger,recoveryLedger});

  return {
    protocolVersion:registry.protocolVersion,
    architecture:registry.architecture,
    division,
    passport,
    currentState,
    contextManifest:manifest,
    bootMemory,
    productionGate:{safeToProduce:productionGate.ok,errors:productionGate.errors},
    loadedDivisionOnly:divisionId
  };
}