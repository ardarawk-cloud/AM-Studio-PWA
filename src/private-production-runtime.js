import base from './canon-brain-runtime.js';
import {loadDivisionContext} from './division-loader.js';
import {evaluatePrivateProductionContext,episodePlanFromContext,producedPageNumbers,nextMissingPage,buildBlackjackPagePrompt,buildPrivateEpisodeMeta,evaluatePublicRelease} from './private-production-core.js';

const ROUTE=/^\/api\/production\/([a-z0-9-]+)\/(status|start|generate-next|pause|page-qc|preview|release)$/;
const pad=(n,w=3)=>String(n).padStart(w,'0');
function adminOK(request,env){const key=request.headers.get('x-am-studio-admin-key')||'';return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY)}
function deny(){return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
function fail(error,status=500){return Response.json({ok:false,error:String(error?.message||error)},{status,headers:{'cache-control':'no-store'}})}
async function bodyJson(request){try{return await request.json()}catch{return{}}}
async function listObjects(env,prefix){if(!env?.COMIC_ASSETS)throw new Error('COMIC_ASSETS_NOT_CONFIGURED');const out=[];let cursor;do{const r=await env.COMIC_ASSETS.list({prefix,limit:1000,cursor});out.push(...r.objects);cursor=r.truncated?r.cursor:undefined}while(cursor);return out}
async function readMeta(env,seriesId,episode){try{const obj=await env.COMIC_ASSETS.get(`comics/${seriesId}/ep${pad(episode)}/meta.json`);return obj?JSON.parse(await obj.text()):{}}catch{return{}}}
async function writeMeta(env,seriesId,episode,meta){const key=`comics/${seriesId}/ep${pad(episode)}/meta.json`;await env.COMIC_ASSETS.put(key,JSON.stringify({...meta,updatedAt:new Date().toISOString()}),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'},customMetadata:{source:'PRIVATE_OWNER_AUTO_PRODUCTION_V1'}});return meta}
async function deletePage(env,seriesId,episode,page){const root=`comics/${seriesId}/ep${pad(episode)}/page-${String(page).padStart(2,'0')}`;for(const ext of ['png','jpg','jpeg','webp','avif'])await env.COMIC_ASSETS.delete(`${root}.${ext}`)}
async function statusFor(env,requestUrl,divisionId){
  const context=await loadDivisionContext(env,requestUrl,divisionId);
  const gate=evaluatePrivateProductionContext(context);
  const plan=episodePlanFromContext(context);
  if(!plan)throw new Error('EPISODE_CANON_PLAN_MISSING');
  const episode=Number(plan.episodeNumber),seriesId=context.passport.seriesId,prefix=`comics/${seriesId}/ep${pad(episode)}/`;
  const objects=await listObjects(env,prefix),produced=producedPageNumbers(objects,seriesId,episode),meta=await readMeta(env,seriesId,episode);
  return {context,gate,plan,episode,seriesId,objects,produced,meta,nextPage:nextMissingPage(plan.pagePlan.length,produced)};
}
function decodeBase64(value=''){const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes}
async function generateImage(env,prompt){
  if(!env?.OPENAI_API_KEY)throw new Error('GENERATOR_NOT_CONFIGURED_OPENAI_API_KEY');
  const model=env.AM_STUDIO_IMAGE_MODEL||'gpt-image-1';
  const r=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({model,prompt,size:'1024x1536',quality:'high',output_format:'png',n:1})});
  let data={};try{data=await r.json()}catch{}
  if(!r.ok)throw new Error(`IMAGE_API_${r.status}:${data?.error?.message||'GENERATION_FAILED'}`);
  const item=data?.data?.[0]||{};
  if(item.b64_json)return {bytes:decodeBase64(item.b64_json),contentType:'image/png',model};
  if(item.url){const ir=await fetch(item.url);if(!ir.ok)throw new Error(`IMAGE_DOWNLOAD_${ir.status}`);return {bytes:new Uint8Array(await ir.arrayBuffer()),contentType:ir.headers.get('content-type')||'image/png',model}}
  throw new Error('IMAGE_API_EMPTY_RESULT');
}
async function start(request,env,divisionId){
  const x=await statusFor(env,request.url,divisionId);if(!x.gate.ok)return Response.json({ok:false,error:'PRODUCTION_GATE_BLOCKED',errors:x.gate.errors},{status:409});
  if(divisionId!=='blackjack')return Response.json({ok:false,error:'AUTO_PRODUCTION_V1_BLACKJACK_ONLY'},{status:409});
  const pageQc=x.meta.pageQc||{};const meta=buildPrivateEpisodeMeta({context:x.context,existing:x.meta,produced:x.produced,pageQc});
  meta.productionState=x.nextPage?'AUTO_PRODUCTION_READY':'OWNER_PAGE_QC_REQUIRED';meta.releaseState='PRIVATE_STAGING';meta.ownerApproved=false;meta.publicVisible=false;meta.startedAt=x.meta.startedAt||new Date().toISOString();
  await writeMeta(env,x.seriesId,x.episode,meta);
  return Response.json({ok:true,divisionId,episode:x.episode,title:x.plan.episodeTitle,totalPages:x.plan.pagePlan.length,generatedPages:x.produced,nextPage:x.nextPage,generatorConfigured:Boolean(env.OPENAI_API_KEY),releaseState:meta.releaseState,publicVisible:false},{headers:{'cache-control':'no-store'}})
}
async function generateNext(request,env,divisionId){
  const x=await statusFor(env,request.url,divisionId);if(!x.gate.ok)return Response.json({ok:false,error:'PRODUCTION_GATE_BLOCKED',errors:x.gate.errors},{status:409});
  if(divisionId!=='blackjack')return Response.json({ok:false,error:'AUTO_PRODUCTION_V1_BLACKJACK_ONLY'},{status:409});
  if(!x.nextPage)return Response.json({ok:true,state:'ALL_PAGES_GENERATED',generatedPages:x.produced,totalPages:x.plan.pagePlan.length,publicVisible:false});
  const prompt=buildBlackjackPagePrompt({context:x.context,pageNumber:x.nextPage});
  const generated=await generateImage(env,prompt),key=`comics/${x.seriesId}/ep${pad(x.episode)}/page-${String(x.nextPage).padStart(2,'0')}.png`;
  await env.COMIC_ASSETS.put(key,generated.bytes,{httpMetadata:{contentType:generated.contentType,cacheControl:'no-store'},customMetadata:{source:'PRIVATE_OWNER_AUTO_PRODUCTION_V1',model:generated.model,page:String(x.nextPage),generatedAt:new Date().toISOString()}});
  const objects=await listObjects(env,`comics/${x.seriesId}/ep${pad(x.episode)}/`),produced=producedPageNumbers(objects,x.seriesId,x.episode),pageQc={...(x.meta.pageQc||{}),[String(x.nextPage)]:'OWNER_REVIEW'};
  const meta=buildPrivateEpisodeMeta({context:x.context,existing:x.meta,produced,pageQc});meta.lastGeneratedPage=x.nextPage;meta.lastGenerationModel=generated.model;meta.publicVisible=false;await writeMeta(env,x.seriesId,x.episode,meta);
  return Response.json({ok:true,state:meta.productionState,page:x.nextPage,totalPages:x.plan.pagePlan.length,generatedPages:produced,nextPage:nextMissingPage(x.plan.pagePlan.length,produced),visualQc:'OWNER_REVIEW',preview:`/api/production/${divisionId}/preview?episode=${x.episode}&page=${x.nextPage}`,publicVisible:false},{headers:{'cache-control':'no-store'}})
}
async function pause(request,env,divisionId){const x=await statusFor(env,request.url,divisionId),meta={...x.meta,releaseState:'PRIVATE_HOLD',productionState:'PAUSED_BY_OWNER',ownerApproved:false,publicVisible:false,pausedAt:new Date().toISOString()};await writeMeta(env,x.seriesId,x.episode,meta);return Response.json({ok:true,state:'PAUSED_BY_OWNER',publicVisible:false})}
async function pageQc(request,env,divisionId){
  const b=await bodyJson(request),page=Number(b.page),result=String(b.result||'').toUpperCase();if(!Number.isInteger(page)||!['PASS','REGENERATE'].includes(result))return Response.json({ok:false,error:'INVALID_PAGE_QC'},{status:400});
  const x=await statusFor(env,request.url,divisionId);if(page<1||page>x.plan.pagePlan.length)return Response.json({ok:false,error:'PAGE_OUT_OF_RANGE'},{status:400});
  const pageQcMap={...(x.meta.pageQc||{})};
  if(result==='REGENERATE'){await deletePage(env,x.seriesId,x.episode,page);pageQcMap[String(page)]='REGENERATE_REQUESTED'}else pageQcMap[String(page)]='PASS';
  const objects=await listObjects(env,`comics/${x.seriesId}/ep${pad(x.episode)}/`),produced=producedPageNumbers(objects,x.seriesId,x.episode),meta=buildPrivateEpisodeMeta({context:x.context,existing:x.meta,produced,pageQc:pageQcMap});meta.publicVisible=false;await writeMeta(env,x.seriesId,x.episode,meta);
  return Response.json({ok:true,page,result,state:meta.productionState,releaseState:meta.releaseState,nextPage:nextMissingPage(x.plan.pagePlan.length,produced),publicVisible:false},{headers:{'cache-control':'no-store'}})
}
async function preview(request,env,divisionId){
  const x=await statusFor(env,request.url,divisionId),url=new URL(request.url),episode=Number(url.searchParams.get('episode')||x.episode),page=Number(url.searchParams.get('page'));
  if(episode!==x.episode||!Number.isInteger(page)||page<1)return new Response('Not found',{status:404});
  const root=`comics/${x.seriesId}/ep${pad(episode)}/page-${String(page).padStart(2,'0')}`;let obj=null;for(const ext of ['png','jpg','jpeg','webp','avif']){obj=await env.COMIC_ASSETS.get(`${root}.${ext}`);if(obj)break}if(!obj)return new Response('Not found',{status:404});
  const h=new Headers({'cache-control':'no-store','x-am-private-preview':'owner-only'});if(typeof obj.writeHttpMetadata==='function')obj.writeHttpMetadata(h);return new Response(obj.body,{headers:h})
}
async function release(request,env,divisionId){const x=await statusFor(env,request.url,divisionId),b=await bodyJson(request),meta={...x.meta,ownerApproved:b.ownerApproved===true};const gate=evaluatePublicRelease({canonLock:x.context.bootMemory?.CANON_LOCK||{},meta});return Response.json({ok:false,error:'PUBLIC_RELEASE_NOT_AVAILABLE_IN_PRIVATE_PRODUCTION_EXPERIMENT',releaseGate:gate,publicVisible:false},{status:423,headers:{'cache-control':'no-store'}})}
async function injectPrivateProduction(response){const ct=response.headers.get('content-type')||'';if(!response.ok||!ct.includes('text/html'))return response;const html=await response.text(),src='/private-production.js?v=20260815a',marker=`<script src="${src}" defer></script>`;const out=html.includes(src)?html:(html.includes('</body>')?html.replace('</body>',`${marker}</body>`):`${html}${marker}`),headers=new Headers(response.headers);headers.set('cache-control','no-store');return new Response(out,{status:response.status,statusText:response.statusText,headers})}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),m=url.pathname.match(ROUTE);
    if(m){if(!adminOK(request,env))return deny();try{const [,divisionId,action]=m;if(action==='status'&&request.method==='GET'){const x=await statusFor(env,request.url,divisionId);return Response.json({ok:true,divisionId,episode:x.episode,title:x.plan.episodeTitle,totalPages:x.plan.pagePlan.length,generatedPages:x.produced,nextPage:x.nextPage,pageQc:x.meta.pageQc||{},productionState:x.meta.productionState||'NOT_STARTED',releaseState:x.meta.releaseState||null,publicVisible:false,generatorConfigured:Boolean(env.OPENAI_API_KEY),productionGate:x.gate},{headers:{'cache-control':'no-store'}})}if(action==='start'&&request.method==='POST')return start(request,env,divisionId);if(action==='generate-next'&&request.method==='POST')return generateNext(request,env,divisionId);if(action==='pause'&&request.method==='POST')return pause(request,env,divisionId);if(action==='page-qc'&&request.method==='POST')return pageQc(request,env,divisionId);if(action==='preview'&&request.method==='GET')return preview(request,env,divisionId);if(action==='release'&&request.method==='POST')return release(request,env,divisionId);return new Response('Method not allowed',{status:405})}catch(error){return fail(error,String(error?.message||'').includes('GENERATOR_NOT_CONFIGURED')?503:500)}}
    return injectPrivateProduction(await base.fetch(request,env,ctx));
  },
  async scheduled(controller,env,ctx){if(base.scheduled)return base.scheduled(controller,env,ctx)}
};
