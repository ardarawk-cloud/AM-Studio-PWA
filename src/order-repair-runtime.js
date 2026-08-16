import app from './admin-delete-runtime.js';

const LT_MARKER='migrations/lt-ep001-order-fix-20260813-v1.json';
const LT_PREFIX='comics/lt/ep001/';
const BJ_RESET_MARKER='migrations/blackjack-ep001-canon-reset-20260815-v1.json';
const BJ_PREFIX='comics/ld/ep001/';
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

async function resetBlackjackEpisode1(env){
  if(await env.COMIC_ASSETS.head(BJ_RESET_MARKER))return {ok:true,alreadyDone:true};
  let cursor;const deleted=[];
  do{
    const list=await env.COMIC_ASSETS.list({prefix:BJ_PREFIX,limit:1000,cursor});
    for(const item of list.objects||[]){
      await env.COMIC_ASSETS.delete(item.key);
      deleted.push(item.key);
    }
    cursor=list.truncated?list.cursor:undefined;
  }while(cursor);
  await env.COMIC_ASSETS.put(BJ_RESET_MARKER,JSON.stringify({ok:true,seriesId:'ld',divisionId:'blackjack',episode:1,action:'CANON_RESTART_FROM_ZERO',deletedCount:deleted.length,completedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'},customMetadata:{source:'OWNER_APPROVED_BLACKJACK_CANON_RESET'}});
  return {ok:true,reset:true,deletedCount:deleted.length};
}

async function repair(env){
  if(!env?.COMIC_ASSETS)return {ok:false,skipped:true};
  const results={};
  try{results.blackjack=await resetBlackjackEpisode1(env)}catch(e){results.blackjack={ok:false,error:String(e?.message||e)}}
  try{results.lingTian=await repairLingTian(env)}catch(e){results.lingTian={ok:false,error:String(e?.message||e)}}
  results.royalGambler={ok:true,skipped:true,reason:'OWNER_MANUAL_UPLOAD_ORDER_ONLY'};
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
