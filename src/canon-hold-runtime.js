import app from './order-repair-runtime.js';

const HELD_SERIES=new Set(['ld']);
const HOLD_REASON='OWNER_MASTER_STORY_RECOVERY_REQUIRED';

function isHeldSeries(id=''){return HELD_SERIES.has(String(id).trim().toLowerCase())}
function isHeldEpisodeMedia(pathname=''){
  return /^\/media\/comics\/ld\/ep\d{3}\//i.test(pathname);
}

async function holdCatalog(response){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  if(!Array.isArray(data?.series))return Response.json(data,{headers:{'cache-control':'no-store'}});
  data.series=data.series.map(series=>{
    if(!isHeldSeries(series?.id))return series;
    return {
      ...series,
      episodes:null,
      episodeCountVerified:false,
      verifiedEpisodes:[],
      freeEpisodes:0,
      status:'CANON_HOLD',
      qc:HOLD_REASON,
      canonHold:{
        active:true,
        reason:HOLD_REASON,
        rule:'DO_NOT_PUBLISH_OR_GENERATE_UNTIL_OWNER_APPROVED_MASTER_STORY_IS_LOADED',
        assetsPreserved:true
      }
    };
  });
  return Response.json(data,{headers:{'cache-control':'no-store','x-am-canon-firewall':'active'}});
}

async function holdReader(response){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  if(Array.isArray(data?.episodes))data.episodes=data.episodes.filter(ep=>!isHeldSeries(ep?.seriesId));
  data.canonHold={
    ...(data.canonHold||{}),
    active:true,
    heldSeries:[...HELD_SERIES],
    reason:HOLD_REASON,
    assetsPreserved:true
  };
  return Response.json(data,{headers:{'cache-control':'no-store','x-am-canon-firewall':'active'}});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&isHeldEpisodeMedia(url.pathname)){
      return new Response('CANON_HOLD: owner-approved Master Story recovery required',{status:423,headers:{'cache-control':'no-store','content-type':'text/plain; charset=utf-8','x-am-canon-firewall':'active'}});
    }
    const response=await app.fetch(request,env,ctx);
    if(request.method==='GET'&&url.pathname==='/catalog.json')return holdCatalog(response);
    if(request.method==='GET'&&url.pathname==='/reader-assets.json')return holdReader(response);
    return response;
  },
  async scheduled(controller,env,ctx){if(app.scheduled)return app.scheduled(controller,env,ctx)}
};
