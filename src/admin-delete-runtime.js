import base from './workers-ai-production-runtime.js';

const SERIES_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)$/i;
const EPISODE_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})$/i;
const TRIM_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})\/trim\/(\d{1,3})$/i;

function adminOK(request,env){
  const key=request.headers.get('x-am-studio-admin-key')||'';
  return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY);
}

function cleanSeries(value=''){
  const x=String(value).trim().toLowerCase();
  return /^[a-z0-9-]+$/.test(x)?x:null;
}

function pad(n,w=3){return String(n).padStart(w,'0')}

async function listAll(env,prefix){
  const objects=[];
  let cursor;
  do{
    const r=await env.COMIC_ASSETS.list({prefix,limit:1000,cursor});
    objects.push(...(r.objects||[]));
    cursor=r.truncated?r.cursor:undefined;
  }while(cursor);
  return objects;
}

async function deleteObjects(env,objects){
  let deleted=0;
  for(const item of objects){
    await env.COMIC_ASSETS.delete(item.key);
    deleted++;
  }
  return deleted;
}

function deny(){
  return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}});
}

function storageUnavailable(){
  return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503,headers:{'cache-control':'no-store'}});
}

async function deleteSeries(request,env,rawSeriesId){
  if(!adminOK(request,env))return deny();
  if(!env?.COMIC_ASSETS)return storageUnavailable();
  const seriesId=cleanSeries(rawSeriesId);
  if(!seriesId)return Response.json({ok:false,error:'INVALID_SERIES_ID'},{status:400});
  const confirmation=request.headers.get('x-am-delete-confirmation')||'';
  if(confirmation!==seriesId)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected:seriesId},{status:409,headers:{'cache-control':'no-store'}});
  const prefix=`comics/${seriesId}/`;
  const objects=await listAll(env,prefix);
  const deletedCount=await deleteObjects(env,objects);
  return Response.json({ok:true,action:'DELETE_SERIES_ASSETS',seriesId,prefix,deletedCount,readyForReupload:true},{headers:{'cache-control':'no-store'}});
}

async function deleteEpisode(request,env,rawSeriesId,rawEpisode){
  if(!adminOK(request,env))return deny();
  if(!env?.COMIC_ASSETS)return storageUnavailable();
  const seriesId=cleanSeries(rawSeriesId),episode=Number(rawEpisode);
  if(!seriesId||!Number.isInteger(episode)||episode<1||episode>999)return Response.json({ok:false,error:'INVALID_EPISODE'},{status:400});
  const expected=`${seriesId}:${episode}`;
  const confirmation=request.headers.get('x-am-delete-confirmation')||'';
  if(confirmation!==expected)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected},{status:409,headers:{'cache-control':'no-store'}});
  const prefix=`comics/${seriesId}/ep${pad(episode)}/`;
  const objects=await listAll(env,prefix);
  const deletedCount=await deleteObjects(env,objects);
  return Response.json({ok:true,action:'DELETE_EPISODE_ASSETS',seriesId,episode,prefix,deletedCount,readyForReupload:true},{headers:{'cache-control':'no-store'}});
}

async function trimEpisode(request,env,rawSeriesId,rawEpisode,rawKeepThrough){
  if(!adminOK(request,env))return deny();
  if(!env?.COMIC_ASSETS)return storageUnavailable();
  const seriesId=cleanSeries(rawSeriesId),episode=Number(rawEpisode),keepThrough=Number(rawKeepThrough);
  if(!seriesId||!Number.isInteger(episode)||episode<1||episode>999||!Number.isInteger(keepThrough)||keepThrough<1||keepThrough>999){
    return Response.json({ok:false,error:'INVALID_TRIM_RANGE'},{status:400});
  }
  const expected=`${seriesId}:${episode}:trim:${keepThrough}`;
  const confirmation=request.headers.get('x-am-delete-confirmation')||'';
  if(confirmation!==expected)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected},{status:409,headers:{'cache-control':'no-store'}});

  const prefix=`comics/${seriesId}/ep${pad(episode)}/`;
  const objects=await listAll(env,prefix);
  const stale=objects.filter(item=>{
    const m=String(item.key||'').match(/\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif)$/i);
    return m&&Number(m[1])>keepThrough;
  });
  const deletedCount=await deleteObjects(env,stale);

  const metaKey=`${prefix}meta.json`;
  const metaObj=await env.COMIC_ASSETS.get(metaKey);
  let meta={seriesId,episode,title:`Episode ${pad(episode)}`};
  if(metaObj){try{meta=JSON.parse(await metaObj.text())}catch{}}
  if(meta.pageQc&&typeof meta.pageQc==='object'){
    meta.pageQc=Object.fromEntries(Object.entries(meta.pageQc).filter(([page])=>Number(page)<=keepThrough));
  }
  meta.seriesId=seriesId;
  meta.episode=episode;
  meta.pageCount=keepThrough;
  meta.lastGeneratedPage=Math.min(Number(meta.lastGeneratedPage)||keepThrough,keepThrough);
  meta.updatedAt=new Date().toISOString();
  meta.trimmedByOwner=true;
  meta.trimmedAfterPage=keepThrough;
  await env.COMIC_ASSETS.put(metaKey,JSON.stringify(meta),{
    httpMetadata:{contentType:'application/json',cacheControl:'no-store'},
    customMetadata:{source:'OWNER_ADMIN_TRIM',updatedAt:meta.updatedAt}
  });

  return Response.json({
    ok:true,
    action:'TRIM_EPISODE_AFTER_PAGE',
    seriesId,
    episode,
    keepThrough,
    deletedCount,
    deletedKeys:stale.map(x=>x.key),
    pageCount:keepThrough
  },{headers:{'cache-control':'no-store'}});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const trimMatch=url.pathname.match(TRIM_ROUTE);
    if(trimMatch&&request.method==='DELETE')return trimEpisode(request,env,trimMatch[1],trimMatch[2],trimMatch[3]);
    const episodeMatch=url.pathname.match(EPISODE_ROUTE);
    if(episodeMatch&&request.method==='DELETE')return deleteEpisode(request,env,episodeMatch[1],episodeMatch[2]);
    const seriesMatch=url.pathname.match(SERIES_ROUTE);
    if(seriesMatch&&request.method==='DELETE')return deleteSeries(request,env,seriesMatch[1]);
    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};
