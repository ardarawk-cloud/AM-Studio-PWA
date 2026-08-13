import app from './asset-runtime.js';

const LT_MARKER='migrations/lt-ep001-order-fix-20260813-v1.json';
const LT_PREFIX='comics/lt/ep001/';
const RG_MARKER='migrations/royal-gambler-ep001-swap-page-03-04-20260814-v1.json';
const RG_PREFIX='comics/royal-gambler/ep001/';
let repairPromise;

async function readPage(env,prefix,n){
  const key=`${prefix}page-${String(n).padStart(2,'0')}.jpg`;
  const obj=await env.COMIC_ASSETS.get(key);
  if(!obj)throw new Error(`MISSING_${key}`);
  return {key,body:await obj.arrayBuffer(),type:obj.httpMetadata?.contentType||'image/jpeg'};
}

async function writePage(env,key,item,source){
  await env.COMIC_ASSETS.put(key,item.body,{
    httpMetadata:{contentType:item.type,cacheControl:'no-cache'},
    customMetadata:{source,updatedAt:new Date().toISOString()}
  });
}

async function repairLingTian(env){
  if(await env.COMIC_ASSETS.head(LT_MARKER))return {ok:true,alreadyDone:true};
  const sourceOrder=[5,4,3,1,2],items=[];
  for(const n of sourceOrder)items.push(await readPage(env,LT_PREFIX,n));
  for(let i=0;i<items.length;i++){
    const key=`${LT_PREFIX}page-${String(i+1).padStart(2,'0')}.jpg`;
    await writePage(env,key,items[i],'LT_EP001_ORDER_REPAIR');
  }
  await env.COMIC_ASSETS.put(LT_MARKER,JSON.stringify({ok:true,seriesId:'lt',episode:1,completedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
  return {ok:true,repaired:true};
}

async function repairRoyalGambler(env){
  if(await env.COMIC_ASSETS.head(RG_MARKER))return {ok:true,alreadyDone:true};
  const page3=await readPage(env,RG_PREFIX,3);
  const page4=await readPage(env,RG_PREFIX,4);
  await writePage(env,page3.key,page4,'ROYAL_GAMBLER_EP001_SWAP_03_04');
  await writePage(env,page4.key,page3,'ROYAL_GAMBLER_EP001_SWAP_03_04');
  await env.COMIC_ASSETS.put(RG_MARKER,JSON.stringify({ok:true,seriesId:'royal-gambler',episode:1,swap:[3,4],completedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
  return {ok:true,repaired:true};
}

async function repair(env){
  if(!env?.COMIC_ASSETS)return {ok:false,skipped:true};
  const results={};
  try{results.lingTian=await repairLingTian(env)}catch(e){results.lingTian={ok:false,error:String(e?.message||e)}}
  try{results.royalGambler=await repairRoyalGambler(env)}catch(e){results.royalGambler={ok:false,error:String(e?.message||e)}}
  return {ok:true,results};
}

function ensure(env){
  if(!repairPromise)repairPromise=repair(env).catch(e=>({ok:false,error:String(e?.message||e)}));
  return repairPromise;
}

export default {
  async fetch(request,env,ctx){await ensure(env);return app.fetch(request,env,ctx)},
  async scheduled(controller,env,ctx){await ensure(env);if(app.scheduled)return app.scheduled(controller,env,ctx)}
};
