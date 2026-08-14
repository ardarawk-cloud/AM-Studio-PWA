import base from './pipeline-runtime.js';
import {loadDivisionRegistry,loadDivisionContext,loadDivisionStates} from './division-loader.js';

const DIVISION_CONTEXT=/^\/api\/divisions\/([a-z0-9-]+)\/context$/;

function adminOK(request,env){
  const key=request.headers.get('x-am-studio-admin-key')||'';
  return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY);
}
function deny(){return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
function fail(error,status=500){return Response.json({ok:false,error:String(error?.message||error)},{status,headers:{'cache-control':'no-store'}})}

async function overlayCatalog(request,response,env){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  try{
    const {states}=await loadDivisionStates(env,request.url);
    const stateBySeries=new Map(states.map(x=>[x.division.seriesId,x]));
    data.series=(data.series||[]).map(series=>{
      const x=stateBySeries.get(series.id);if(!x)return series;
      const last=x.currentState.lastCompletedEpisode||null,next=x.currentState.nextProductionTarget||null;
      return {
        ...series,
        division:{number:x.division.divisionNumber,id:x.division.divisionId,brain:'ISOLATED',passport:x.division.passport},
        currentEpisode:last?{number:last.number,title:last.title,publishedPages:last.pageCount,nextPage:null,status:'COMPLETE'}:series.currentEpisode,
        nextProductionTarget:next?{number:next.number,title:next.title,state:next.state}:null
      };
    });
    return Response.json(data,{headers:{'cache-control':'no-store'}});
  }catch{return Response.json(data,{headers:{'cache-control':'no-store'}})}
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
    let response=await base.fetch(request,env,ctx);
    if(url.pathname==='/catalog.json'&&request.method==='GET')response=await overlayCatalog(request,response,env);
    return response;
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};