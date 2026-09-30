import base from './asset-runtime.js';

const SERIES_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)$/i;
const EPISODE_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})$/i;
const TRIM_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})\/trim\/(\d{1,3})$/i;\nconst PAGE_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})\/pages\/(\d{1,3})$/i;
const META_KEY=/^comics\/([a-z0-9-]+)\/ep(\d{3})\/meta\.json$/i;
const CACHE_TTL_MS=30000;
let inventoryCache=null;
let inventoryCacheAt=0;
let inventoryPromise=null;

function adminOK(request,env){const key=request.headers.get('x-am-studio-admin-key')||'';return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY)}
function deny(){return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
function cleanSeries(value=''){const x=String(value).trim().toLowerCase();return /^[a-z0-9-]+$/.test(x)?x:null}
function pad(n,w=3){return String(n).padStart(w,'0')}
function invalidateInventory(){inventoryCache=null;inventoryCacheAt=0;inventoryPromise=null}

async function listAll(env,prefix){
  const objects=[];let cursor;
  do{const r=await env.COMIC_ASSETS.list({prefix,limit:1000,cursor});objects.push(...(r.objects||[]));cursor=r.truncated?r.cursor:undefined}while(cursor);
  return objects;
}

async function buildInventoryFresh(env){
  if(!env?.COMIC_ASSETS)return {covers:new Set(),episodes:[]};
  const objects=await listAll(env,'comics/'),covers=new Set(),groups=new Map(),metaKeys=[];
  for(const o of objects){
    const c=String(o.key||'').match(/^comics\/([a-z0-9-]+)\/cover\./i);if(c){covers.add(c[1]);continue}
    const p=String(o.key||'').match(/^comics\/([a-z0-9-]+)\/ep(\d{3})\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif)$/i);
    if(p){const k=`${p[1]}:${Number(p[2])}`;if(!groups.has(k))groups.set(k,{seriesId:p[1],episode:Number(p[2]),pages:new Map(),meta:null});groups.get(k).pages.set(Number(p[3]),`/media/${o.key}`);continue}
    if(META_KEY.test(String(o.key||'')))metaKeys.push(o.key);
  }
  await Promise.all(metaKeys.map(async key=>{
    const m=key.match(META_KEY);if(!m)return;const k=`${m[1]}:${Number(m[2])}`;
    if(!groups.has(k))groups.set(k,{seriesId:m[1],episode:Number(m[2]),pages:new Map(),meta:null});
    try{const obj=await env.COMIC_ASSETS.get(key);if(obj)groups.get(k).meta=JSON.parse(await obj.text())}catch{}
  }));
  return {covers,episodes:[...groups.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.episode-b.episode)};
}

async function inventory(env){
  const now=Date.now();
  if(inventoryCache&&now-inventoryCacheAt<CACHE_TTL_MS)return inventoryCache;
  if(inventoryPromise)return inventoryPromise;
  inventoryPromise=buildInventoryFresh(env).then(x=>{inventoryCache=x;inventoryCacheAt=Date.now();return x}).finally(()=>{inventoryPromise=null});
  return inventoryPromise;
}

function dynamicEntry(g,covers){
  const nums=[...g.pages.keys()].sort((a,b)=>a-b),pages=nums.map(n=>g.pages.get(n)),meta=g.meta||{},pageCount=Math.max(Number(meta.pageCount)||0,nums.at(-1)||0),missing=[];
  for(let i=1;i<=pageCount;i++)if(!g.pages.has(i))missing.push(i);
  return {seriesId:g.seriesId,episode:g.episode,title:meta.title||`Episode ${pad(g.episode)}`,canonState:'CANON_FINAL',qc:'QC_PASS',publicationState:'OWNER_MANUAL_RECOVERY',productionFormat:'PROFESSIONAL_MULTI_PAGE_EPISODE',coverAsset:covers.has(g.seriesId)?`/media/comics/${g.seriesId}/cover.jpg`:undefined,pageCount,availablePageCount:pages.length,pages,missingReaderPages:missing,readerState:missing.length?'PARTIAL_ASSET_RECOVERY':'READER_COMPLETE',assetQuality:'OWNER_ADMIN_UPLOAD',evidence:{type:'OWNER_ADMIN_UPLOAD',verifiedAt:meta.updatedAt||null}};
}

function mergeReader(staticRegistry,inv){
  const out=structuredClone(staticRegistry||{registry:{},episodes:[]}),map=new Map((out.episodes||[]).map(e=>[`${e.seriesId}:${Number(e.episode)}`,e]));
  for(const g of inv.episodes){
    if(!g.meta&&!g.pages.size)continue;
    const d=dynamicEntry(g,inv.covers),k=`${d.seriesId}:${d.episode}`,old=map.get(k);
    if(old&&g.meta){
      // Owner metadata is authoritative after upload/trim/reset. Never let an older
      // static pageCount/readerAsset resurrect pages that were explicitly deleted.
      map.set(k,{...old,...d,pageCount:Number(d.pageCount)||0,availablePageCount:d.availablePageCount,pages:d.pages,missingReaderPages:d.missingReaderPages,readerState:d.readerState,readerAsset:undefined,replacementPending:false,title:d.title||old.title});
    }else if(old){
      map.set(k,{...old,...d,pageCount:Math.max(Number(old.pageCount)||0,Number(d.pageCount)||0),title:old.title||d.title});
    }else map.set(k,d);
  }
  out.registry={...(out.registry||{}),storage:'R2_COMIC_ASSETS',runtimeOverlay:true,inventoryCacheSeconds:CACHE_TTL_MS/1000};
  out.episodes=[...map.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||Number(a.episode)-Number(b.episode));
  return out;
}

function mergeCatalog(catalog,inv){
  const out=structuredClone(catalog||{studio:{},series:[]}),bySeries=new Map();
  for(const g of inv.episodes){if(!g.meta)continue;if(!bySeries.has(g.seriesId))bySeries.set(g.seriesId,[]);bySeries.get(g.seriesId).push(g)}
  out.series=(out.series||[]).map(s=>{
    const groups=(bySeries.get(s.id)||[]).sort((a,b)=>a.episode-b.episode);if(!groups.length)return s;
    const nums=groups.map(g=>g.episode),max=Math.max(...nums),contiguous=nums.length===max&&nums.every((n,i)=>n===i+1),titles=Array.from({length:max},(_,i)=>groups.find(g=>g.episode===i+1)?.meta?.title||s.episodeTitles?.[i]||`Episode ${pad(i+1)}`);
    return {...s,episodes:contiguous?max:s.episodes,episodeCountVerified:contiguous||s.episodeCountVerified,verifiedEpisodes:[...new Set([...(s.verifiedEpisodes||[]),...nums])].sort((a,b)=>a-b),episodeTitles:titles,cover:{...(s.cover||{}),status:inv.covers.has(s.id)?'OWNER_UPLOAD_READY':s.cover?.status}};
  });
  return out;
}

async function liteJson(request,env,kind){
  const path=kind==='reader'?'/reader-assets.json':'/catalog.json';
  const r=await env.ASSETS.fetch(new Request(new URL(path,request.url).toString(),{headers:{accept:'application/json'}}));
  if(!r.ok)return r;
  let data;try{data=await r.json()}catch{return r}
  const inv=await inventory(env),merged=kind==='reader'?mergeReader(data,inv):mergeCatalog(data,inv);
  return Response.json(merged,{headers:{'cache-control':'no-store','x-am-runtime':'owner-lite'}});
}

async function deleteObjects(env,objects){let n=0;for(const x of objects){await env.COMIC_ASSETS.delete(x.key);n++}return n}

async function deleteSeries(request,env,raw){
  if(!adminOK(request,env))return deny();if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const id=cleanSeries(raw);if(!id)return Response.json({ok:false,error:'INVALID_SERIES_ID'},{status:400});
  if((request.headers.get('x-am-delete-confirmation')||'')!==id)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected:id},{status:409});
  const objects=await listAll(env,`comics/${id}/`),deletedCount=await deleteObjects(env,objects);invalidateInventory();
  return Response.json({ok:true,action:'DELETE_SERIES_ASSETS',seriesId:id,deletedCount,readyForReupload:true},{headers:{'cache-control':'no-store'}});
}

async function deleteEpisode(request,env,rawId,rawEp){
  if(!adminOK(request,env))return deny();if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const id=cleanSeries(rawId),ep=Number(rawEp);if(!id||!Number.isInteger(ep)||ep<1||ep>999)return Response.json({ok:false,error:'INVALID_EPISODE'},{status:400});
  const expected=`${id}:${ep}`;if((request.headers.get('x-am-delete-confirmation')||'')!==expected)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected},{status:409});
  const objects=await listAll(env,`comics/${id}/ep${pad(ep)}/`),deletedCount=await deleteObjects(env,objects);invalidateInventory();
  return Response.json({ok:true,action:'DELETE_EPISODE_ASSETS',seriesId:id,episode:ep,deletedCount,readyForReupload:true},{headers:{'cache-control':'no-store'}});
}

async function deletePage(request,env,rawId,rawEp,rawPage){
  if(!adminOK(request,env))return deny();
  if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const id=cleanSeries(rawId),ep=Number(rawEp),page=Number(rawPage);
  if(!id||!Number.isInteger(ep)||ep<1||ep>999||!Number.isInteger(page)||page<1||page>999)return Response.json({ok:false,error:'INVALID_PAGE'},{status:400});
  const expected=`${id}:${ep}:page:${page}`;
  if((request.headers.get('x-am-delete-confirmation')||'')!==expected)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected},{status:409});

  const prefix=`comics/${id}/ep${pad(ep)}/`,objects=await listAll(env,prefix);
  const pageRe=new RegExp(`/page-0*${page}\\.(?:jpg|jpeg|png|webp|avif)import base from './asset-runtime.js';

const SERIES_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)$/i;
const EPISODE_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})$/i;
const TRIM_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})\/trim\/(\d{1,3})$/i;\nconst PAGE_ROUTE=/^\/api\/assets\/series\/([a-z0-9-]+)\/episodes\/(\d{1,3})\/pages\/(\d{1,3})$/i;
const META_KEY=/^comics\/([a-z0-9-]+)\/ep(\d{3})\/meta\.json$/i;
const CACHE_TTL_MS=30000;
let inventoryCache=null;
let inventoryCacheAt=0;
let inventoryPromise=null;

function adminOK(request,env){const key=request.headers.get('x-am-studio-admin-key')||'';return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY)}
function deny(){return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
function cleanSeries(value=''){const x=String(value).trim().toLowerCase();return /^[a-z0-9-]+$/.test(x)?x:null}
function pad(n,w=3){return String(n).padStart(w,'0')}
function invalidateInventory(){inventoryCache=null;inventoryCacheAt=0;inventoryPromise=null}

async function listAll(env,prefix){
  const objects=[];let cursor;
  do{const r=await env.COMIC_ASSETS.list({prefix,limit:1000,cursor});objects.push(...(r.objects||[]));cursor=r.truncated?r.cursor:undefined}while(cursor);
  return objects;
}

async function buildInventoryFresh(env){
  if(!env?.COMIC_ASSETS)return {covers:new Set(),episodes:[]};
  const objects=await listAll(env,'comics/'),covers=new Set(),groups=new Map(),metaKeys=[];
  for(const o of objects){
    const c=String(o.key||'').match(/^comics\/([a-z0-9-]+)\/cover\./i);if(c){covers.add(c[1]);continue}
    const p=String(o.key||'').match(/^comics\/([a-z0-9-]+)\/ep(\d{3})\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif)$/i);
    if(p){const k=`${p[1]}:${Number(p[2])}`;if(!groups.has(k))groups.set(k,{seriesId:p[1],episode:Number(p[2]),pages:new Map(),meta:null});groups.get(k).pages.set(Number(p[3]),`/media/${o.key}`);continue}
    if(META_KEY.test(String(o.key||'')))metaKeys.push(o.key);
  }
  await Promise.all(metaKeys.map(async key=>{
    const m=key.match(META_KEY);if(!m)return;const k=`${m[1]}:${Number(m[2])}`;
    if(!groups.has(k))groups.set(k,{seriesId:m[1],episode:Number(m[2]),pages:new Map(),meta:null});
    try{const obj=await env.COMIC_ASSETS.get(key);if(obj)groups.get(k).meta=JSON.parse(await obj.text())}catch{}
  }));
  return {covers,episodes:[...groups.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.episode-b.episode)};
}

async function inventory(env){
  const now=Date.now();
  if(inventoryCache&&now-inventoryCacheAt<CACHE_TTL_MS)return inventoryCache;
  if(inventoryPromise)return inventoryPromise;
  inventoryPromise=buildInventoryFresh(env).then(x=>{inventoryCache=x;inventoryCacheAt=Date.now();return x}).finally(()=>{inventoryPromise=null});
  return inventoryPromise;
}

function dynamicEntry(g,covers){
  const nums=[...g.pages.keys()].sort((a,b)=>a-b),pages=nums.map(n=>g.pages.get(n)),meta=g.meta||{},pageCount=Math.max(Number(meta.pageCount)||0,nums.at(-1)||0),missing=[];
  for(let i=1;i<=pageCount;i++)if(!g.pages.has(i))missing.push(i);
  return {seriesId:g.seriesId,episode:g.episode,title:meta.title||`Episode ${pad(g.episode)}`,canonState:'CANON_FINAL',qc:'QC_PASS',publicationState:'OWNER_MANUAL_RECOVERY',productionFormat:'PROFESSIONAL_MULTI_PAGE_EPISODE',coverAsset:covers.has(g.seriesId)?`/media/comics/${g.seriesId}/cover.jpg`:undefined,pageCount,availablePageCount:pages.length,pages,missingReaderPages:missing,readerState:missing.length?'PARTIAL_ASSET_RECOVERY':'READER_COMPLETE',assetQuality:'OWNER_ADMIN_UPLOAD',evidence:{type:'OWNER_ADMIN_UPLOAD',verifiedAt:meta.updatedAt||null}};
}

function mergeReader(staticRegistry,inv){
  const out=structuredClone(staticRegistry||{registry:{},episodes:[]}),map=new Map((out.episodes||[]).map(e=>[`${e.seriesId}:${Number(e.episode)}`,e]));
  for(const g of inv.episodes){
    if(!g.meta&&!g.pages.size)continue;
    const d=dynamicEntry(g,inv.covers),k=`${d.seriesId}:${d.episode}`,old=map.get(k);
    if(old&&g.meta){
      // Owner metadata is authoritative after upload/trim/reset. Never let an older
      // static pageCount/readerAsset resurrect pages that were explicitly deleted.
      map.set(k,{...old,...d,pageCount:Number(d.pageCount)||0,availablePageCount:d.availablePageCount,pages:d.pages,missingReaderPages:d.missingReaderPages,readerState:d.readerState,readerAsset:undefined,replacementPending:false,title:d.title||old.title});
    }else if(old){
      map.set(k,{...old,...d,pageCount:Math.max(Number(old.pageCount)||0,Number(d.pageCount)||0),title:old.title||d.title});
    }else map.set(k,d);
  }
  out.registry={...(out.registry||{}),storage:'R2_COMIC_ASSETS',runtimeOverlay:true,inventoryCacheSeconds:CACHE_TTL_MS/1000};
  out.episodes=[...map.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||Number(a.episode)-Number(b.episode));
  return out;
}

function mergeCatalog(catalog,inv){
  const out=structuredClone(catalog||{studio:{},series:[]}),bySeries=new Map();
  for(const g of inv.episodes){if(!g.meta)continue;if(!bySeries.has(g.seriesId))bySeries.set(g.seriesId,[]);bySeries.get(g.seriesId).push(g)}
  out.series=(out.series||[]).map(s=>{
    const groups=(bySeries.get(s.id)||[]).sort((a,b)=>a.episode-b.episode);if(!groups.length)return s;
    const nums=groups.map(g=>g.episode),max=Math.max(...nums),contiguous=nums.length===max&&nums.every((n,i)=>n===i+1),titles=Array.from({length:max},(_,i)=>groups.find(g=>g.episode===i+1)?.meta?.title||s.episodeTitles?.[i]||`Episode ${pad(i+1)}`);
    return {...s,episodes:contiguous?max:s.episodes,episodeCountVerified:contiguous||s.episodeCountVerified,verifiedEpisodes:[...new Set([...(s.verifiedEpisodes||[]),...nums])].sort((a,b)=>a-b),episodeTitles:titles,cover:{...(s.cover||{}),status:inv.covers.has(s.id)?'OWNER_UPLOAD_READY':s.cover?.status}};
  });
  return out;
}

async function liteJson(request,env,kind){
  const path=kind==='reader'?'/reader-assets.json':'/catalog.json';
  const r=await env.ASSETS.fetch(new Request(new URL(path,request.url).toString(),{headers:{accept:'application/json'}}));
  if(!r.ok)return r;
  let data;try{data=await r.json()}catch{return r}
  const inv=await inventory(env),merged=kind==='reader'?mergeReader(data,inv):mergeCatalog(data,inv);
  return Response.json(merged,{headers:{'cache-control':'no-store','x-am-runtime':'owner-lite'}});
}

async function deleteObjects(env,objects){let n=0;for(const x of objects){await env.COMIC_ASSETS.delete(x.key);n++}return n}

async function deleteSeries(request,env,raw){
  if(!adminOK(request,env))return deny();if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const id=cleanSeries(raw);if(!id)return Response.json({ok:false,error:'INVALID_SERIES_ID'},{status:400});
  if((request.headers.get('x-am-delete-confirmation')||'')!==id)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected:id},{status:409});
  const objects=await listAll(env,`comics/${id}/`),deletedCount=await deleteObjects(env,objects);invalidateInventory();
  return Response.json({ok:true,action:'DELETE_SERIES_ASSETS',seriesId:id,deletedCount,readyForReupload:true},{headers:{'cache-control':'no-store'}});
}

async function deleteEpisode(request,env,rawId,rawEp){
  if(!adminOK(request,env))return deny();if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const id=cleanSeries(rawId),ep=Number(rawEp);if(!id||!Number.isInteger(ep)||ep<1||ep>999)return Response.json({ok:false,error:'INVALID_EPISODE'},{status:400});
  const expected=`${id}:${ep}`;if((request.headers.get('x-am-delete-confirmation')||'')!==expected)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected},{status:409});
  const objects=await listAll(env,`comics/${id}/ep${pad(ep)}/`),deletedCount=await deleteObjects(env,objects);invalidateInventory();
  return Response.json({ok:true,action:'DELETE_EPISODE_ASSETS',seriesId:id,episode:ep,deletedCount,readyForReupload:true},{headers:{'cache-control':'no-store'}});
}

,'i');
  const targets=objects.filter(x=>pageRe.test('/'+String(x.key||'')));
  if(!targets.length)return Response.json({ok:false,error:'PAGE_ASSET_NOT_FOUND',seriesId:id,episode:ep,page},{status:404,headers:{'cache-control':'no-store'}});
  await deleteObjects(env,targets);

  const remaining=objects.filter(x=>!targets.some(t=>t.key===x.key));
  const nums=remaining.map(x=>{const m=String(x.key||'').match(/\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif)$/i);return m?Number(m[1]):null}).filter(Number.isInteger);
  const highest=nums.length?Math.max(...nums):0;
  const highestBefore=Math.max(page,...nums);

  const metaKey=`${prefix}meta.json`;
  let meta={seriesId:id,episode:ep,title:`Episode ${pad(ep)}`,pageCount:highestBefore};
  try{const o=await env.COMIC_ASSETS.get(metaKey);if(o)meta=JSON.parse(await o.text())}catch{}
  const currentCount=Number(meta.pageCount)||highestBefore;
  const nextCount=(page===highestBefore&&currentCount<=highestBefore)?highest:currentCount;
  if(meta.pageQc&&typeof meta.pageQc==='object')delete meta.pageQc[String(page)];
  meta={...meta,seriesId:id,episode:ep,pageCount:nextCount||null,updatedAt:new Date().toISOString(),pageDeletedByOwner:page};
  await env.COMIC_ASSETS.put(metaKey,JSON.stringify(meta),{
    httpMetadata:{contentType:'application/json',cacheControl:'no-store'},
    customMetadata:{source:'OWNER_ADMIN_PAGE_DELETE',episodeTitle:String(meta.title||`Episode ${pad(ep)}`).slice(0,180),pageCount:String(meta.pageCount||0),updatedAt:meta.updatedAt}
  });
  invalidateInventory();
  return Response.json({ok:true,action:'DELETE_SINGLE_PAGE',seriesId:id,episode:ep,page,deletedCount:targets.length,pageCount:meta.pageCount,remainingPages:nums.sort((a,b)=>a-b)},{headers:{'cache-control':'no-store'}});
}

async function trimEpisode(request,env,rawId,rawEp,rawKeep){
  if(!adminOK(request,env))return deny();if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const id=cleanSeries(rawId),ep=Number(rawEp),keep=Number(rawKeep);if(!id||!Number.isInteger(ep)||ep<1||!Number.isInteger(keep)||keep<1)return Response.json({ok:false,error:'INVALID_TRIM_RANGE'},{status:400});
  const expected=`${id}:${ep}:trim:${keep}`;if((request.headers.get('x-am-delete-confirmation')||'')!==expected)return Response.json({ok:false,error:'DELETE_CONFIRMATION_REQUIRED',expected},{status:409});
  const prefix=`comics/${id}/ep${pad(ep)}/`,objects=await listAll(env,prefix),stale=objects.filter(x=>{const m=String(x.key||'').match(/\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif)$/i);return m&&Number(m[1])>keep});
  const deletedCount=await deleteObjects(env,stale),metaKey=`${prefix}meta.json`;let meta={seriesId:id,episode:ep,title:`Episode ${pad(ep)}`};
  try{const o=await env.COMIC_ASSETS.get(metaKey);if(o)meta=JSON.parse(await o.text())}catch{}
  if(meta.pageQc&&typeof meta.pageQc==='object')meta.pageQc=Object.fromEntries(Object.entries(meta.pageQc).filter(([p])=>Number(p)<=keep));
  meta={...meta,seriesId:id,episode:ep,pageCount:keep,lastGeneratedPage:Math.min(Number(meta.lastGeneratedPage)||keep,keep),updatedAt:new Date().toISOString(),trimmedByOwner:true,trimmedAfterPage:keep};
  await env.COMIC_ASSETS.put(metaKey,JSON.stringify(meta),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'},customMetadata:{source:'OWNER_ADMIN_TRIM',episodeTitle:String(meta.title||`Episode ${pad(ep)}`).slice(0,180),pageCount:String(keep),updatedAt:meta.updatedAt}});invalidateInventory();
  return Response.json({ok:true,action:'TRIM_EPISODE_AFTER_PAGE',seriesId:id,episode:ep,keepThrough:keep,deletedCount,pageCount:keep},{headers:{'cache-control':'no-store'}});
}

async function injectOwnerUi(response){
  const ct=response.headers.get('content-type')||'';if(!response.ok||!ct.includes('text/html'))return response;
  let html=await response.text();
  const scripts=[
    '/admin-panel.js?v=20260817c',
    '/admin-upload-queue-fix.js?v=20260816c',
    '/admin-delete-panel.js?v=20260930a',\n    '/admin-page-delete.js?v=20260930a'
  ];
  for(const src of scripts){
    const plain=src.split('?')[0];if(html.includes(src)||html.includes(`src="${plain}`)||html.includes(`src='${plain}`))continue;
    const marker=`<script src="${src}" defer></script>`;html=html.includes('</body>')?html.replace('</body>',`${marker}</body>`):`${html}${marker}`;
  }
  const h=new Headers(response.headers);h.set('cache-control','no-store');h.set('x-am-runtime','owner-lite');h.set('x-am-admin-ui','restored');
  return new Response(html,{status:response.status,statusText:response.statusText,headers:h});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/reader-assets.json')return liteJson(request,env,'reader');
    if(request.method==='GET'&&url.pathname==='/catalog.json')return liteJson(request,env,'catalog');
    const pm=url.pathname.match(PAGE_ROUTE);if(pm&&request.method==='DELETE')return deletePage(request,env,pm[1],pm[2],pm[3]);\n    const tm=url.pathname.match(TRIM_ROUTE);if(tm&&request.method==='DELETE')return trimEpisode(request,env,tm[1],tm[2],tm[3]);
    const em=url.pathname.match(EPISODE_ROUTE);if(em&&request.method==='DELETE')return deleteEpisode(request,env,em[1],em[2]);
    const sm=url.pathname.match(SERIES_ROUTE);if(sm&&request.method==='DELETE')return deleteSeries(request,env,sm[1]);
    const response=await base.fetch(request,env,ctx);
    if(response.ok&&request.method==='POST'&&(url.pathname==='/api/assets/upload'||url.pathname==='/api/assets/meta'))invalidateInventory();
    return injectOwnerUi(response);
  },
  async scheduled(controller,env,ctx){if(base.scheduled)return base.scheduled(controller,env,ctx)}
};
