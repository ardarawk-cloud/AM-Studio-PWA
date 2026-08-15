import base from './private-production-runtime.js';
import {loadDivisionContext} from './division-loader.js';
import {
  evaluatePrivateProductionContext,
  episodePlanFromContext,
  producedPageNumbers,
  nextMissingPage,
  buildBlackjackPagePrompt,
  buildPrivateEpisodeMeta
} from './private-production-core.js';

const GENERATE_ROUTE=/^\/api\/production\/([a-z0-9-]+)\/generate-next$/;
const STATUS_OR_START_ROUTE=/^\/api\/production\/([a-z0-9-]+)\/(status|start)$/;
const MODEL_DEFAULT='@cf/bytedance/stable-diffusion-xl-lightning';
const pad=(n,w=3)=>String(n).padStart(w,'0');

function adminOK(request,env){
  const key=request.headers.get('x-am-studio-admin-key')||'';
  return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY);
}

function generatorInfo(env){
  return {
    generatorConfigured:Boolean(env?.AI),
    generatorProvider:'CLOUDFLARE_WORKERS_AI',
    generatorModel:env?.AM_STUDIO_WORKERS_AI_IMAGE_MODEL||MODEL_DEFAULT
  };
}

function decodeBase64(value=''){
  const binary=atob(value);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}

async function outputBytes(output){
  if(output instanceof ReadableStream)return new Uint8Array(await new Response(output).arrayBuffer());
  if(output instanceof ArrayBuffer)return new Uint8Array(output);
  if(ArrayBuffer.isView(output))return new Uint8Array(output.buffer,output.byteOffset,output.byteLength);
  if(output?.image&&typeof output.image==='string')return decodeBase64(output.image);
  throw new Error('WORKERS_AI_EMPTY_IMAGE_RESULT');
}

async function generateImage(env,prompt){
  if(!env?.AI)throw new Error('GENERATOR_NOT_CONFIGURED_WORKERS_AI_BINDING');
  const model=env.AM_STUDIO_WORKERS_AI_IMAGE_MODEL||MODEL_DEFAULT;
  const negative_prompt=[
    'anime, manga, chibi, low detail, blurry face, deformed hands, extra fingers, bad anatomy',
    'empty background, random explosion, glitter, excessive particles, watermark, gibberish text',
    'probability manipulation, Royal Deck, Deck Dimension, Dealer on page one, premature Black Deck power'
  ].join(', ');
  const output=await env.AI.run(model,{
    prompt,
    negative_prompt,
    width:1024,
    height:1536,
    num_steps:4,
    guidance:7.5,
    seed:Math.floor(Math.random()*2147483647)
  });
  return {
    bytes:await outputBytes(output),
    contentType:'image/jpeg',
    provider:'CLOUDFLARE_WORKERS_AI',
    model
  };
}

async function listObjects(env,prefix){
  if(!env?.COMIC_ASSETS)throw new Error('COMIC_ASSETS_NOT_CONFIGURED');
  const out=[];
  let cursor;
  do{
    const r=await env.COMIC_ASSETS.list({prefix,limit:1000,cursor});
    out.push(...r.objects);
    cursor=r.truncated?r.cursor:undefined;
  }while(cursor);
  return out;
}

async function readMeta(env,seriesId,episode){
  try{
    const obj=await env.COMIC_ASSETS.get(`comics/${seriesId}/ep${pad(episode)}/meta.json`);
    return obj?JSON.parse(await obj.text()):{};
  }catch{return{};}
}

async function writeMeta(env,seriesId,episode,meta){
  await env.COMIC_ASSETS.put(
    `comics/${seriesId}/ep${pad(episode)}/meta.json`,
    JSON.stringify({...meta,updatedAt:new Date().toISOString()}),
    {
      httpMetadata:{contentType:'application/json',cacheControl:'no-store'},
      customMetadata:{source:'PRIVATE_OWNER_AUTO_PRODUCTION_WORKERS_AI_V1'}
    }
  );
}

async function generateNext(request,env,divisionId){
  if(!adminOK(request,env))return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}});
  if(divisionId!=='blackjack')return Response.json({ok:false,error:'AUTO_PRODUCTION_V1_BLACKJACK_ONLY'},{status:409});
  if(!env?.AI)return Response.json({ok:false,error:'GENERATOR_NOT_CONFIGURED_WORKERS_AI_BINDING'},{status:503,headers:{'cache-control':'no-store'}});

  try{
    const context=await loadDivisionContext(env,request.url,divisionId);
    const gate=evaluatePrivateProductionContext(context);
    if(!gate.ok)return Response.json({ok:false,error:'PRODUCTION_GATE_BLOCKED',errors:gate.errors},{status:409});

    const plan=episodePlanFromContext(context);
    if(!plan)throw new Error('EPISODE_CANON_PLAN_MISSING');
    const episode=Number(plan.episodeNumber);
    const seriesId=context.passport.seriesId;
    const prefix=`comics/${seriesId}/ep${pad(episode)}/`;
    const objects=await listObjects(env,prefix);
    const produced=producedPageNumbers(objects,seriesId,episode);
    const page=nextMissingPage(plan.pagePlan.length,produced);

    if(!page){
      return Response.json({ok:true,state:'ALL_PAGES_GENERATED',generatedPages:produced,totalPages:plan.pagePlan.length,publicVisible:false,...generatorInfo(env)},{headers:{'cache-control':'no-store'}});
    }

    const prompt=buildBlackjackPagePrompt({context,pageNumber:page});
    const generated=await generateImage(env,prompt);
    const key=`comics/${seriesId}/ep${pad(episode)}/page-${String(page).padStart(2,'0')}.jpg`;
    await env.COMIC_ASSETS.put(key,generated.bytes,{
      httpMetadata:{contentType:generated.contentType,cacheControl:'no-store'},
      customMetadata:{
        source:'PRIVATE_OWNER_AUTO_PRODUCTION_WORKERS_AI_V1',
        provider:generated.provider,
        model:generated.model,
        page:String(page),
        generatedAt:new Date().toISOString()
      }
    });

    const refreshed=await listObjects(env,prefix);
    const generatedPages=producedPageNumbers(refreshed,seriesId,episode);
    const existing=await readMeta(env,seriesId,episode);
    const pageQc={...(existing.pageQc||{}),[String(page)]:'OWNER_REVIEW'};
    const meta=buildPrivateEpisodeMeta({context,existing,produced:generatedPages,pageQc});
    meta.lastGeneratedPage=page;
    meta.lastGenerationProvider=generated.provider;
    meta.lastGenerationModel=generated.model;
    meta.publicVisible=false;
    await writeMeta(env,seriesId,episode,meta);

    return Response.json({
      ok:true,
      state:meta.productionState,
      page,
      totalPages:plan.pagePlan.length,
      generatedPages,
      nextPage:nextMissingPage(plan.pagePlan.length,generatedPages),
      visualQc:'OWNER_REVIEW',
      preview:`/api/production/${divisionId}/preview?episode=${episode}&page=${page}`,
      publicVisible:false,
      ...generatorInfo(env)
    },{headers:{'cache-control':'no-store'}});
  }catch(error){
    return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:{'cache-control':'no-store'}});
  }
}

async function rewriteGeneratorStatus(response,env){
  if(!response.ok)return response;
  let data;
  try{data=await response.json();}catch{return response;}
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  return Response.json({...data,...generatorInfo(env)},{status:response.status,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const generated=url.pathname.match(GENERATE_ROUTE);
    if(generated&&request.method==='POST')return generateNext(request,env,generated[1]);

    const statusOrStart=url.pathname.match(STATUS_OR_START_ROUTE);
    if(statusOrStart&&((statusOrStart[2]==='status'&&request.method==='GET')||(statusOrStart[2]==='start'&&request.method==='POST'))){
      return rewriteGeneratorStatus(await base.fetch(request,env,ctx),env);
    }

    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};
