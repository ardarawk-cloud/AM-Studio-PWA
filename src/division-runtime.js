import base from './pipeline-runtime.js';
import {loadDivisionRegistry,loadDivisionContext,loadDivisionStates} from './division-loader.js';

const DIVISION_CONTEXT=/^\/api\/divisions\/([a-z0-9-]+)\/context$/;
const EPISODE_MEDIA=/^\/media\/comics\/([a-z0-9-]+)\/ep\d{3}\//i;

function adminOK(request,env){
  const key=request.headers.get('x-am-studio-admin-key')||'';
  return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY);
}
function deny(){return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
function fail(error,status=500){return Response.json({ok:false,error:String(error?.message||error)},{status,headers:{'cache-control':'no-store'}})}
function isHoldStatus(status=''){return String(status).includes('CANON_RECOVERY_HOLD')}

async function heldDivisionForSeries(env,requestUrl,seriesId){
  try{
    const registry=await loadDivisionRegistry(env,requestUrl);
    return (registry.divisions||[]).find(x=>x.seriesId===seriesId&&isHoldStatus(x.status))||null;
  }catch{return null}
}

async function heldSeriesSet(env,requestUrl){
  try{
    const registry=await loadDivisionRegistry(env,requestUrl);
    return new Set((registry.divisions||[]).filter(x=>isHoldStatus(x.status)).map(x=>x.seriesId));
  }catch{return new Set()}
}

async function overlayCatalog(request,response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  try{
    const {states}=await loadDivisionStates(env,request.url);
    const stateBySeries=new Map(states.map(x=>[x.division.seriesId,x]));
    data.series=(data.series||[]).map(series=>{
      const x=stateBySeries.get(series.id);if(!x)return series;
      const held=isHoldStatus(x.division.status),last=x.currentState.lastCompletedEpisode||null,next=x.currentState.nextProductionTarget||null;
      return {
        ...series,
        ...(held?{status:'CANON_HOLD',episodes:null,episodeCountVerified:false,verifiedEpisodes:[],freeEpisodes:0,qc:'OWNER_MASTER_STORY_RECOVERY_REQUIRED'}:{}),
        division:{number:x.division.divisionNumber,id:x.division.divisionId,brain:'ISOLATED',passport:x.division.passport,status:x.division.status},
        currentEpisode:held?null:(last?{number:last.number,title:last.title,publishedPages:last.pageCount,nextPage:null,status:'COMPLETE'}:series.currentEpisode),
        nextProductionTarget:next?{number:next.number,title:next.title,state:next.state}:null
      };
    });
    return Response.json(data,{headers:{'cache-control':'no-store','x-am-canon-firewall':'active'}});
  }catch{return Response.json(data,{headers:{'cache-control':'no-store'}})}
}

async function filterHeldReader(request,response,env){
  if(!response.ok)return response;let data;try{data=await response.json()}catch{return response}
  const held=await heldSeriesSet(env,request.url);
  if(Array.isArray(data?.episodes))data.episodes=data.episodes.filter(ep=>!held.has(ep.seriesId));
  data.canonHold={active:held.size>0,heldSeries:[...held],rule:'CANON_RECOVERY_HOLD_ASSETS_PRESERVED_NOT_PUBLIC'};
  return Response.json(data,{headers:{'cache-control':'no-store','x-am-canon-firewall':'active'}});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/divisions'&&request.method==='GET'){
      if(!adminOK(request,env))return deny();
      try{
        const registry=await loadDivisionRegistry(env,request.url);
        return Response.json({ok:true,...registry},{headers:{'cache-control':'no-store'}});
      }catch(error){return fail(error)}
    }
    const match=url.pathname.match(DIVISION_CONTEXT);
    if(match&&request.method==='GET'){
      if(!adminOK(request,env))return deny();
      try{
        const context=await loadDivisionContext(env,request.url,match[1]);
        return Response.json({ok:true,context},{headers:{'cache-control':'no-store'}});
      }catch(error){return fail(error,error?.message==='DIVISION_NOT_FOUND'?404:409)}
    }
    const media=url.pathname.match(EPISODE_MEDIA);
    if(media&&request.method==='GET'){
      const held=await heldDivisionForSeries(env,request.url,media[1]);
      if(held)return new Response('CANON_HOLD: owner-approved Master Story recovery required',{status:423,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-am-canon-firewall':'active'}});
    }
    let response=await base.fetch(request,env,ctx);
    if(url.pathname==='/reader-assets.json'&&request.method==='GET')response=await filterHeldReader(request,response,env);
    if(url.pathname==='/catalog.json'&&request.method==='GET')response=await overlayCatalog(request,response,env);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};