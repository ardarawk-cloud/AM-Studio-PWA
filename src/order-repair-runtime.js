import app from './asset-runtime.js';
const MARKER='migrations/lt-ep001-order-fix-20260813-v1.json';
const PREFIX='comics/lt/ep001/';
let repairPromise;
async function repair(env){
  if(!env?.COMIC_ASSETS)return {ok:false,skipped:true};
  if(await env.COMIC_ASSETS.head(MARKER))return {ok:true,alreadyDone:true};
  const sourceOrder=[5,4,3,1,2],items=[];
  for(const n of sourceOrder){
    const key=`${PREFIX}page-${String(n).padStart(2,'0')}.jpg`;
    const obj=await env.COMIC_ASSETS.get(key);
    if(!obj)return {ok:false,error:`MISSING_${key}`};
    items.push({body:await obj.arrayBuffer(),type:obj.httpMetadata?.contentType||'image/jpeg'});
  }
  for(let i=0;i<items.length;i++){
    const key=`${PREFIX}page-${String(i+1).padStart(2,'0')}.jpg`;
    await env.COMIC_ASSETS.put(key,items[i].body,{httpMetadata:{contentType:items[i].type,cacheControl:'no-cache'},customMetadata:{source:'ORDER_REPAIR'}});
  }
  await env.COMIC_ASSETS.put(MARKER,JSON.stringify({ok:true,seriesId:'lt',episode:1,completedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'}});
  return {ok:true,repaired:true};
}
function ensure(env){if(!repairPromise)repairPromise=repair(env).catch(e=>({ok:false,error:String(e?.message||e)}));return repairPromise;}
export default {async fetch(request,env,ctx){await ensure(env);return app.fetch(request,env,ctx);},async scheduled(controller,env,ctx){await ensure(env);if(app.scheduled)return app.scheduled(controller,env,ctx);}};
