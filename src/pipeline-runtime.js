import base from './order-repair-runtime.js';
import {derivePipelineState,nextReleaseAt,validateEpisode} from './pipeline-core.js';

const API_PREFIX='/api/pipeline/';
const META_KEY=/^comics\/([a-z0-9-]+)\/ep(\d{3})\/meta\.json$/i;
const PAGE_KEY=/^comics\/([a-z0-9-]+)\/ep(\d{3})\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif)$/i;
const COVER_KEY=/^comics\/([a-z0-9-]+)\/cover\.(?:jpg|jpeg|png|webp|avif)$/i;
const RELEASE_HOUR_WITA=19;

const pad=(n,w=3)=>String(n).padStart(w,'0');
const cleanSeries=value=>{const x=String(value||'').trim().toLowerCase();return /^[a-z0-9-]+$/.test(x)?x:null};
function adminOK(request,env){const key=request.headers.get('x-am-studio-admin-key')||'';return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY)}
function deny(){return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
async function jsonBody(request){try{return await request.json()}catch{return{}}}

async function listAll(env,prefix='comics/'){
  const objects=[];let cursor;
  do{const r=await env.COMIC_ASSETS.list({prefix,limit:1000,cursor});objects.push(...r.objects);cursor=r.truncated?r.cursor:undefined}while(cursor);
  return objects;
}

async function readMeta(env,key){
  try{const obj=await env.COMIC_ASSETS.get(key);return obj?JSON.parse(await obj.text()):null}catch{return null}
}

async function buildInventory(env){
  if(!env?.COMIC_ASSETS)return {covers:new Set(),episodes:[]};
  const objects=await listAll(env),covers=new Set(),groups=new Map(),metaKeys=[];
  const ensure=(seriesId,episode)=>{const k=`${seriesId}:${episode}`;if(!groups.has(k))groups.set(k,{seriesId,episode,pages:new Set(),meta:null});return groups.get(k)};
  for(const o of objects){
    const c=o.key.match(COVER_KEY);if(c){covers.add(c[1]);continue}
    const p=o.key.match(PAGE_KEY);if(p){ensure(p[1],Number(p[2])).pages.add(Number(p[3]));continue}
    const m=o.key.match(META_KEY);if(m){ensure(m[1],Number(m[2]));metaKeys.push(o.key)}
  }
  for(const key of metaKeys){const m=key.match(META_KEY),g=ensure(m[1],Number(m[2]));g.meta=await readMeta(env,key)}
  return {covers,episodes:[...groups.values()].sort((a,b)=>a.seriesId.localeCompare(b.seriesId)||a.episode-b.episode)};
}

function recordOf(g,covers){
  const rawMeta=g.meta||{},legacyPublished=!rawMeta.releaseState&&rawMeta.ownerApproved===true,meta=legacyPublished?{...rawMeta,releaseState:'PUBLISHED',technicalQc:rawMeta.technicalQc||'QC_PASS'}:rawMeta,pages=[...g.pages].sort((a,b)=>a-b),pageCount=Number(meta.pageCount||0);
  const input={seriesId:g.seriesId,episode:g.episode,pageCount,pages,hasCover:covers.has(g.seriesId),meta};
  const validation=validateEpisode(input),state=derivePipelineState(input);
  return {seriesId:g.seriesId,episode:g.episode,title:meta.title||`Episode ${pad(g.episode)}`,pageCount,availablePageCount:pages.length,pages,hasCover:covers.has(g.seriesId),missingPages:validation.missingPages,validation,state,ownerApproved:Boolean(meta.ownerApproved),technicalQc:meta.technicalQc||null,releaseState:meta.releaseState||null,scheduledAt:meta.scheduledAt||null,publishedAt:meta.publishedAt||null,updatedAt:meta.updatedAt||null,legacyPublished};
}

async function episodeGroup(env,seriesId,episode){
  const inventory=await buildInventory(env);return {inventory,group:inventory.episodes.find(g=>g.seriesId===seriesId&&g.episode===episode)||{seriesId,episode,pages:new Set(),meta:null}};
}

async function writeMeta(env,seriesId,episode,patch){
  const key=`comics/${seriesId}/ep${pad(episode)}/meta.json`,previous=await readMeta(env,key)||{};
  const meta={...previous,seriesId,episode,title:patch.title??previous.title??`Episode ${pad(episode)}`,...patch,updatedAt:new Date().toISOString()};
  await env.COMIC_ASSETS.put(key,JSON.stringify(meta),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'},customMetadata:{source:'AUTO_EPISODE_PIPELINE_V1'}});
  return meta;
}

async function statusApi(request,env){
  if(!adminOK(request,env))return deny();
  const inventory=await buildInventory(env),episodes=inventory.episodes.map(g=>recordOf(g,inventory.covers));
  return Response.json({ok:true,engine:{name:'AM STUDIO Auto Episode Pipeline',version:1,timezone:'Asia/Makassar',releaseTime:'19:00',policy:'ASSET_COMPLETE+QC_PASS+OWNER_APPROVED'},episodes},{headers:{'cache-control':'no-store'}});
}

function target(body){const seriesId=cleanSeries(body.seriesId),episode=Number(body.episode);return seriesId&&Number.isInteger(episode)&&episode>=1&&episode<=999?{seriesId,episode}:null}

async function validateApi(request,env){
  if(!adminOK(request,env))return deny();const body=await jsonBody(request),t=target(body);if(!t)return Response.json({ok:false,error:'INVALID_EPISODE_TARGET'},{status:400});
  const {inventory,group}=await episodeGroup(env,t.seriesId,t.episode),record=recordOf(group,inventory.covers),pass=record.validation.ok;
  const releaseState=record.releaseState==='HOLD'||record.releaseState==='PUBLISHED'?record.releaseState:(pass?'QC_PASS':'ASSET_WAIT');
  const meta=await writeMeta(env,t.seriesId,t.episode,{technicalQc:pass?'QC_PASS':'QC_FAIL',technicalQcAt:new Date().toISOString(),releaseState,ownerApproved:record.ownerApproved});
  return Response.json({ok:pass,record:{...record,technicalQc:meta.technicalQc,releaseState:meta.releaseState,state:pass?(meta.ownerApproved?'OWNER_APPROVED':'QC_PASS'):'ASSET_WAIT'}},{status:pass?200:409,headers:{'cache-control':'no-store'}});
}

async function approveApi(request,env){
  if(!adminOK(request,env))return deny();const body=await jsonBody(request),t=target(body);if(!t)return Response.json({ok:false,error:'INVALID_EPISODE_TARGET'},{status:400});
  const {inventory,group}=await episodeGroup(env,t.seriesId,t.episode),record=recordOf(group,inventory.covers);if(!record.validation.ok)return Response.json({ok:false,error:'ASSET_VALIDATION_FAILED',record},{status:409});
  const requestedMs=body.scheduledAt?Date.parse(body.scheduledAt):null;if(body.scheduledAt&&Number.isNaN(requestedMs))return Response.json({ok:false,error:'INVALID_SCHEDULE_TIME'},{status:400});
  const scheduledAt=body.scheduledAt?new Date(requestedMs).toISOString():nextReleaseAt(Date.now(),RELEASE_HOUR_WITA,480);
  const meta=await writeMeta(env,t.seriesId,t.episode,{technicalQc:'QC_PASS',technicalQcAt:new Date().toISOString(),ownerApproved:true,ownerApprovedAt:new Date().toISOString(),releaseState:'SCHEDULED',scheduledAt});
  return Response.json({ok:true,state:'SCHEDULED',scheduledAt,meta},{headers:{'cache-control':'no-store'}});
}

async function holdApi(request,env){
  if(!adminOK(request,env))return deny();const body=await jsonBody(request),t=target(body);if(!t)return Response.json({ok:false,error:'INVALID_EPISODE_TARGET'},{status:400});
  const meta=await writeMeta(env,t.seriesId,t.episode,{releaseState:'HOLD',holdReason:String(body.reason||'OWNER_HOLD').slice(0,240),heldAt:new Date().toISOString()});
  return Response.json({ok:true,state:'HOLD',meta},{headers:{'cache-control':'no-store'}});
}

async function publishOne(env,t,source='OWNER_PUBLISH_NOW'){
  const {inventory,group}=await episodeGroup(env,t.seriesId,t.episode),record=recordOf(group,inventory.covers);
  if(!record.validation.ok)return {ok:false,status:409,error:'ASSET_VALIDATION_FAILED',record};
  if(!record.ownerApproved)return {ok:false,status:409,error:'OWNER_APPROVAL_REQUIRED',record};
  const now=new Date().toISOString(),meta=await writeMeta(env,t.seriesId,t.episode,{technicalQc:'QC_PASS',releaseState:'PUBLISHED',publishedAt:now,publishSource:source});
  return {ok:true,status:200,state:'PUBLISHED',publishedAt:now,meta};
}

async function publishApi(request,env){
  if(!adminOK(request,env))return deny();const body=await jsonBody(request),t=target(body);if(!t)return Response.json({ok:false,error:'INVALID_EPISODE_TARGET'},{status:400});
  const result=await publishOne(env,t);return Response.json(result,{status:result.status,headers:{'cache-control':'no-store'}});
}

async function releaseDue(env,nowMs=Date.now()){
  if(!env?.COMIC_ASSETS)return {ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'};
  const inventory=await buildInventory(env),results=[];
  for(const g of inventory.episodes){
    const r=recordOf(g,inventory.covers);if(r.releaseState!=='SCHEDULED'||!r.scheduledAt||Date.parse(r.scheduledAt)>nowMs)continue;
    const result=await publishOne(env,{seriesId:r.seriesId,episode:r.episode},'SCHEDULED_CRON');results.push({seriesId:r.seriesId,episode:r.episode,...result});
    if(!result.ok)await writeMeta(env,r.seriesId,r.episode,{releaseState:'HOLD',holdReason:`AUTO_RELEASE_BLOCKED:${result.error}`});
  }
  return {ok:true,checkedAt:new Date(nowMs).toISOString(),released:results.filter(x=>x.ok).length,results};
}

async function filterPublicationJson(request,response,env,kind){
  if(!response.ok)return response;let data;try{data=await response.json()}catch{return response}
  const inventory=await buildInventory(env),metaByKey=new Map(inventory.episodes.map(g=>[`${g.seriesId}:${g.episode}`,g.meta||{}]));
  const staged=(seriesId,episode)=>{const meta=metaByKey.get(`${seriesId}:${Number(episode)}`);return Boolean(meta?.releaseState&&meta.releaseState!=='PUBLISHED')};
  if(kind==='reader'){data.episodes=(data.episodes||[]).filter(e=>!staged(e.seriesId,e.episode));}
  else if(kind==='catalog'){data.series=(data.series||[]).map(s=>{
    const verified=(s.verifiedEpisodes||[]).filter(n=>!staged(s.id,n)).sort((a,b)=>a-b),max=verified.length?Math.max(...verified):0,contiguous=max>0&&verified.length===max&&verified.every((n,i)=>n===i+1);
    const hasStaged=inventory.episodes.some(g=>g.seriesId===s.id&&g.meta?.releaseState&&g.meta.releaseState!=='PUBLISHED');
    if(!hasStaged)return s;return {...s,verifiedEpisodes:verified,episodes:contiguous?max:(max||null),episodeCountVerified:contiguous,episodeTitles:Array.isArray(s.episodeTitles)?s.episodeTitles.slice(0,max):s.episodeTitles};
  })}
  return Response.json(data,{headers:{'cache-control':'no-store'}});
}

async function stageAssetMeta(request,response,env,body,previous){
  if(!response.ok)return response;const t=target(body);if(!t)return response;
  const preservePublished=previous?.releaseState==='PUBLISHED'||(!previous?.releaseState&&previous?.ownerApproved===true),preserveHold=previous?.releaseState==='HOLD';
  await writeMeta(env,t.seriesId,t.episode,{ownerApproved:preservePublished?Boolean(previous.ownerApproved):false,releaseState:preservePublished?'PUBLISHED':preserveHold?'HOLD':'ASSET_WAIT',technicalQc:preservePublished?previous.technicalQc||'QC_PASS':null,scheduledAt:preservePublished?previous.scheduledAt||null:null,publishedAt:preservePublished?previous.publishedAt||null:null});
  return response;
}

async function injectPipelineAdmin(request,response){
  const ct=response.headers.get('content-type')||'';if(!response.ok||!ct.includes('text/html'))return response;
  const url=new URL(request.url);if(url.searchParams.get('native')==='android')return response;
  const html=await response.text(),src='/pipeline-admin.js?v=20260814a',marker=`<script src="${src}" defer></script>`;
  const out=html.includes(marker)?html:(html.includes('</body>')?html.replace('</body>',`${marker}</body>`):`${html}${marker}`),headers=new Headers(response.headers);headers.set('cache-control','no-store');
  return new Response(out,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===`${API_PREFIX}status`&&request.method==='GET')return statusApi(request,env);
    if(url.pathname===`${API_PREFIX}validate`&&request.method==='POST')return validateApi(request,env);
    if(url.pathname===`${API_PREFIX}approve`&&request.method==='POST')return approveApi(request,env);
    if(url.pathname===`${API_PREFIX}hold`&&request.method==='POST')return holdApi(request,env);
    if(url.pathname===`${API_PREFIX}publish`&&request.method==='POST')return publishApi(request,env);
    let metaBody=null,previous=null;
    if(url.pathname==='/api/assets/meta'&&request.method==='POST'){try{metaBody=await request.clone().json();const t=target(metaBody);if(t)previous=await readMeta(env,`comics/${t.seriesId}/ep${pad(t.episode)}/meta.json`)}catch{}}
    let response=await base.fetch(request,env,ctx);
    if(metaBody)response=await stageAssetMeta(request,response,env,metaBody,previous);
    if(url.pathname==='/reader-assets.json'&&request.method==='GET')response=await filterPublicationJson(request,response,env,'reader');
    if(url.pathname==='/catalog.json'&&request.method==='GET')response=await filterPublicationJson(request,response,env,'catalog');
    return injectPipelineAdmin(request,response);
  },
  async scheduled(controller,env,ctx){ctx.waitUntil(releaseDue(env));if(base.scheduled)return base.scheduled(controller,env,ctx)}
};
