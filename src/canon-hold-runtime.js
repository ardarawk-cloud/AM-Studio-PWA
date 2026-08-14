import app from './order-repair-runtime.js';
import {loadDivisionRegistry} from './division-loader.js';

function isHeldStatus(status=''){return String(status).includes('CANON_RECOVERY_HOLD')}
async function heldDivisions(env,requestUrl){try{const registry=await loadDivisionRegistry(env,requestUrl);return (registry.divisions||[]).filter(x=>isHeldStatus(x.status))}catch{return[]}}
async function heldSeriesSet(env,requestUrl){return new Set((await heldDivisions(env,requestUrl)).map(x=>x.seriesId))}
async function heldDivisionForSeries(env,requestUrl,seriesId){return (await heldDivisions(env,requestUrl)).find(x=>x.seriesId===seriesId)||null}

async function holdCatalog(response,env,requestUrl){
  if(!response.ok)return response;let data;try{data=await response.json()}catch{return response}const held=await heldSeriesSet(env,requestUrl);
  if(!Array.isArray(data?.series)||!held.size)return Response.json(data,{headers:{'cache-control':'no-store'}});
  data.series=data.series.map(series=>!held.has(series?.id)?series:{...series,episodes:null,episodeCountVerified:false,verifiedEpisodes:[],freeEpisodes:0,status:'CANON_HOLD',qc:'OWNER_MASTER_STORY_RECOVERY_REQUIRED',canonHold:{active:true,reason:'OWNER_MASTER_STORY_RECOVERY_REQUIRED',rule:'DO_NOT_PUBLISH_OR_GENERATE_UNTIL_OWNER_APPROVED_MASTER_STORY_IS_LOADED',assetsPreserved:true}});
  return Response.json(data,{headers:{'cache-control':'no-store','x-am-canon-firewall':'active'}})
}
async function holdReader(response,env,requestUrl){
  if(!response.ok)return response;let data;try{data=await response.json()}catch{return response}const held=await heldSeriesSet(env,requestUrl);if(Array.isArray(data?.episodes)&&held.size)data.episodes=data.episodes.filter(ep=>!held.has(ep?.seriesId));data.canonHold={...(data.canonHold||{}),active:held.size>0,heldSeries:[...held],assetsPreserved:true};return Response.json(data,{headers:{'cache-control':'no-store',...(held.size?{'x-am-canon-firewall':'active'}:{})}})
}
export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url),media=url.pathname.match(/^\/media\/comics\/([a-z0-9-]+)\/ep\d{3}\//i);if(request.method==='GET'&&media){const held=await heldDivisionForSeries(env,request.url,media[1]);if(held)return new Response('CANON_HOLD: owner-approved Master Story recovery required',{status:423,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-am-canon-firewall':'active'}})}
    const response=await app.fetch(request,env,ctx);if(request.method==='GET'&&url.pathname==='/catalog.json')return holdCatalog(response,env,request.url);if(request.method==='GET'&&url.pathname==='/reader-assets.json')return holdReader(response,env,request.url);return response
  },
  async scheduled(controller,env,ctx){if(app.scheduled)return app.scheduled(controller,env,ctx)}
};
