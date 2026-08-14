import base from './pipeline-runtime.js';
import {loadDivisionRegistry,loadDivisionContext} from './division-loader.js';

const DIVISION_CONTEXT=/^\/api\/divisions\/([a-z0-9-]+)\/context$/;

function adminOK(request,env){
  const key=request.headers.get('x-am-studio-admin-key')||'';
  return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY);
}
function deny(){return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
function fail(error,status=500){return Response.json({ok:false,error:String(error?.message||error)},{status,headers:{'cache-control':'no-store'}})}

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
    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};