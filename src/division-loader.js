import {validatePassport,validateIsolation} from './division-core.js';

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
  return {
    protocolVersion:registry.protocolVersion,
    architecture:registry.architecture,
    division,
    passport,
    currentState,
    contextManifest:manifest,
    loadedDivisionOnly:divisionId
  };
}