import base from './hotfix-runtime.js';

const MEDIA_PREFIX='/media/';
const UPLOAD_PATH='/api/assets/upload';
const META_PATH='/api/assets/meta';
const LIST_PATH='/api/assets/list';
const IMAGE_KEY=/^comics\/([a-z0-9-]+)\/(?:cover\.(?:jpg|jpeg|png|webp|avif)|ep(\d{3})\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif))$/i;
const META_KEY=/^comics\/([a-z0-9-]+)\/ep(\d{3})\/meta\.json$/i;
const INVENTORY_CACHE_MS=30000;
let inventoryCachePromise=null;
let inventoryCacheExpiresAt=0;

function adminOK(request,env){const key=request.headers.get('x-am-studio-admin-key')||'';return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY)}
function cleanKey(value=''){let key='';try{key=decodeURIComponent(String(value))}catch{return null}if(key.includes('..')||key.includes('\\'))return null;return IMAGE_KEY.test(key)?key:null}
function cleanSeries(value=''){const x=String(value).trim().toLowerCase();return /^[a-z0-9-]+$/.test(x)?x:null}
function pad(n,w=3){return String(n).padStart(w,'0')}

export function invalidateInventoryCache(){
  inventoryCachePromise=null;
  inventoryCacheExpiresAt=0;
}

async function uploadAsset(request,env){
  if(!adminOK(request,env))return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401});
  if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const url=new URL(request.url),key=cleanKey(url.searchParams.get('key')||'');
  if(!key)return Response.json({ok:false,error:'INVALID_ASSET_KEY'},{status:400});
  if(!request.body)return Response.json({ok:false,error:'EMPTY_ASSET_BODY'},{status:400});
  const type=request.headers.get('content-type')||'application/octet-stream',length=Number(request.headers.get('content-length')||0);
  if(length>20*1024*1024)return Response.json({ok:false,error:'ASSET_TOO_LARGE',maxBytes:20*1024*1024},{status:413});
  const stored=await env.COMIC_ASSETS.put(key,request.body,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{source:'OWNER_ADMIN_UPLOAD',uploadedAt:new Date().toISOString()}});
  invalidateInventoryCache();
  return Response.json({ok:true,key,size:stored?.size??(length||null),contentType:stored?.httpMetadata?.contentType||type},{headers:{'cache-control':'no-store'}});
}

async function saveMeta(request,env){
  if(!adminOK(request,env))return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401});
  if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  let body={};try{body=await request.json()}catch{return Response.json({ok:false,error:'INVALID_JSON'},{status:400})}
  const seriesId=cleanSeries(body.seriesId),episode=Number(body.episode),title=String(body.title||'').trim(),pageCount=Number(body.pageCount||0);
  if(!seriesId||!Number.isInteger(episode)||episode<1||episode>999)return Response.json({ok:false,error:'INVALID_EPISODE_META'},{status:400});
  if(pageCount&&(!Number.isInteger(pageCount)||pageCount<1||pageCount>999))return Response.json({ok:false,error:'INVALID_PAGE_COUNT'},{status:400});
  const key=`comics/${seriesId}/ep${pad(episode)}/meta.json`;
  const meta={seriesId,episode,title:title||`Episode ${pad(episode)}`,pageCount:pageCount||null,ownerApproved:body.ownerApproved!==false,updatedAt:new Date().toISOString()};
  await env.COMIC_ASSETS.put(key,JSON.stringify(meta),{
    httpMetadata:{contentType:'application/json',cacheControl:'no-store'},
    customMetadata:{source:'OWNER_ADMIN_META',episodeTitle:meta.title.slice(0,180),pageCount:String(meta.pageCount||0),updatedAt:meta.updatedAt}
  });
  invalidateInventoryCache();
  return Response.json({ok:true,key,meta},{headers:{'cache-control':'no-store'}});
}

async function listAll(env,prefix='comics/'){
  const objects=[];let cursor;
  do{
    const r=await env.COMIC_ASSETS.list({prefix,limit:1000,cursor,include:['customMetadata']});
    objects.push(...(r.objects||[]));
    cursor=r.truncated?r.cursor:undefined;
  }while(cursor);
  return objects;
}

async function buildInventoryFresh(env){
  if(!env?.COMIC_ASSETS)return {covers:new Set(),episodes:[]};
  const objects=await listAll(env,'comics/'),covers=new Set(),groups=new Map();
  for(const o of objects){
    const c=o.key.match(/^comics\/([a-z0-9-]+)\/cover\./i);if(c){covers.add(c[1]);continue}
    const p=o.key.match(/^comics\/([a-z0-9-]+)\/ep(\d{3})\/page-(\d{2,3})\./i);
    if(p){
      const k=`${p[1]}:${Number(p[2])}`;
      if(!groups.has(k))groups.set(k,{seriesId:p[1],episode:Number(p[2]),pages:new Map(),meta:null});
      groups.get(k).pages.set(Number(p[3]),`/media/${o.key}`);
      continue;
    }
    const m=o.key.match(META_KEY);
    if(m){
      const k=`${m[1]}:${Number(m[2])}`;
      if(!groups.has(k))groups.set(k,{seriesId:m[1],episode:Number(m[2]),pages:new Map(),meta:null});
      const cm=o.customMetadata||{};
      const n=Number(cm.pageCount||0);
      groups.get(k).meta={
        title:typeof cm.episodeTitle==='string'&&cm.episodeTitle?cm.episodeTitle:null,
        pageCount:Number.isInteger(n)&&n>0?n:null,
        updatedAt:cm.updatedAt||o.uploaded?.toISOString?.()||null
      };
    }
  }
  return {covers,episodes:[...groups.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.episode-b.episode)};
}

async function buildInventory(env){
  const now=Date.now();
  if(inventoryCachePromise&&now<inventoryCacheExpiresAt)return inventoryCachePromise;
  inventoryCacheExpiresAt=now+INVENTORY_CACHE_MS;
  inventoryCachePromise=buildInventoryFresh(env).catch(error=>{invalidateInventoryCache();throw error});
  return inventoryCachePromise;
}

function dynamicEntry(g,covers){
  const nums=[...g.pages.keys()].sort((a,b)=>a-b),pages=nums.map(n=>g.pages.get(n)),meta=g.meta||{},pageCount=Math.max(Number(meta.pageCount)||0,nums.at(-1)||0),missing=[];
  for(let i=1;i<=pageCount;i++)if(!g.pages.has(i))missing.push(i);
  return {seriesId:g.seriesId,episode:g.episode,title:meta.title||`Episode ${pad(g.episode)}`,canonState:'CANON_FINAL',qc:'QC_PASS',publicationState:'OWNER_MANUAL_RECOVERY',productionFormat:'PROFESSIONAL_MULTI_PAGE_EPISODE',coverAsset:covers.has(g.seriesId)?`/media/comics/${g.seriesId}/cover.jpg`:undefined,pageCount,availablePageCount:pages.length,pages,missingReaderPages:missing,readerState:missing.length?'PARTIAL_ASSET_RECOVERY':'READER_COMPLETE',assetQuality:'OWNER_ADMIN_UPLOAD',evidence:{type:'OWNER_ADMIN_UPLOAD',verifiedAt:meta.updatedAt||null}};
}

function mergeReader(staticRegistry,inventory){
  const out=structuredClone(staticRegistry||{registry:{},episodes:[]}),map=new Map((out.episodes||[]).map(e=>[`${e.seriesId}:${Number(e.episode)}`,e]));
  for(const g of inventory.episodes){
    if(!g.meta&&!g.pages.size)continue;
    const d=dynamicEntry(g,inventory.covers),k=`${d.seriesId}:${d.episode}`,old=map.get(k);
    map.set(k,old?{...old,...d,pageCount:Math.max(Number(old.pageCount)||0,Number(d.pageCount)||0),title:old.title||d.title}:d);
  }
  out.registry={...(out.registry||{}),version:Number(out.registry?.version||0)+1,storage:'R2_COMIC_ASSETS',runtimeOverlay:true};
  out.episodes=[...map.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||Number(a.episode)-Number(b.episode));
  return out;
}

function mergeCatalog(catalog,inventory){
  const out=structuredClone(catalog||{studio:{},series:[]}),bySeries=new Map();
  for(const g of inventory.episodes){if(!g.meta)continue;if(!bySeries.has(g.seriesId))bySeries.set(g.seriesId,[]);bySeries.get(g.seriesId).push(g)}
  out.series=(out.series||[]).map(s=>{
    const groups=(bySeries.get(s.id)||[]).sort((a,b)=>a.episode-b.episode);if(!groups.length)return s;
    const nums=groups.map(g=>g.episode),max=Math.max(...nums),contiguous=nums.length===max&&nums.every((n,i)=>n===i+1),titles=Array.from({length:max},(_,i)=>groups.find(g=>g.episode===i+1)?.meta?.title||s.episodeTitles?.[i]||`Episode ${pad(i+1)}`);
    return {...s,episodes:contiguous?max:s.episodes,episodeCountVerified:contiguous||s.episodeCountVerified,verifiedEpisodes:[...new Set([...(s.verifiedEpisodes||[]),...nums])].sort((a,b)=>a-b),episodeTitles:titles,cover:{...(s.cover||{}),status:inventory.covers.has(s.id)?'OWNER_UPLOAD_READY':s.cover?.status}};
  });
  return out;
}

async function listAssets(request,env){
  if(!adminOK(request,env))return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401});
  if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const url=new URL(request.url),prefix=String(url.searchParams.get('prefix')||'comics/').replace(/^\/+/, '');
  if(prefix.includes('..')||!prefix.startsWith('comics/'))return Response.json({ok:false,error:'INVALID_PREFIX'},{status:400});
  const objects=await listAll(env,prefix);
  return Response.json({ok:true,prefix,count:objects.length,objects:objects.map(o=>({key:o.key,size:o.size,uploaded:o.uploaded?.toISOString?.()||null}))},{headers:{'cache-control':'no-store'}});
}

async function media(request,env,key){
  if(!env?.COMIC_ASSETS)return new Response('Comic storage unavailable',{status:503});
  const clean=cleanKey(key);if(!clean)return new Response('Not found',{status:404});
  const obj=await env.COMIC_ASSETS.get(clean);if(!obj)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
  const h=new Headers();if(typeof obj.writeHttpMetadata==='function')obj.writeHttpMetadata(h);if(!h.get('content-type'))h.set('content-type','application/octet-stream');h.set('cache-control','public, max-age=31536000, immutable');if(obj.httpEtag)h.set('etag',obj.httpEtag);h.set('x-am-asset-source','R2_COMIC_ASSETS');
  return new Response(obj.body,{headers:h});
}

async function jsonOverlay(request,env,ctx,kind){
  const response=await base.fetch(request,env,ctx);if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const inventory=await buildInventory(env),merged=kind==='reader'?mergeReader(data,inventory):mergeCatalog(data,inventory);
  return Response.json(merged,{headers:{'cache-control':'no-store','x-am-inventory-cache':'30s'}});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===UPLOAD_PATH&&request.method==='POST')return uploadAsset(request,env);
    if(url.pathname===META_PATH&&request.method==='POST')return saveMeta(request,env);
    if(url.pathname===LIST_PATH&&request.method==='GET')return listAssets(request,env);
    if(url.pathname.startsWith(MEDIA_PREFIX)&&request.method==='GET')return media(request,env,url.pathname.slice(MEDIA_PREFIX.length));
    if(url.pathname==='/reader-assets.json'&&request.method==='GET')return jsonOverlay(request,env,ctx,'reader');
    if(url.pathname==='/catalog.json'&&request.method==='GET')return jsonOverlay(request,env,ctx,'catalog');
    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){if(base.scheduled)return base.scheduled(controller,env,ctx)}
};
