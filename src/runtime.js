import base from './index.js';

const SNAPSHOT_KEY='system/fb-canon-audit/latest.json';
const GRAPH='v26.0';
const PAGE_MAP={
  '1178279432042498':{seriesId:'amu',title:'Arda Moron Universe'},
  '1180411308496248':{seriesId:'lt',title:'Legenda Ling Tian'},
  '1304047659451097':{seriesId:'hk',title:'Han Kera'},
  '1323179447544364':{seriesId:'hy',title:'Han You — Pewaris Api Abadi'},
  '1446561275197990':{seriesId:'sg-battle',title:'Sun Gokong — Versi Pertempuran'},
  '1167171983155743':{seriesId:'sg-journey',title:'Sun Gokong — Versi Perjalanan'},
  '1280688068454987':{seriesId:'royal-gambler',title:'Royal Gambler'},
  '1309081242282228':{seriesId:'ld',title:'The Legendary Decks'},
  '1201687913036355':{seriesId:'13',title:'13 Pintu Neraka'}
};

function activeToken(env){return env?.META_PAGE_ACCESS_TOKEN||env?.META_SYSTEM_USER_TOKEN||''}
function activeTokenSource(env){return env?.META_PAGE_ACCESS_TOKEN?'META_PAGE_ACCESS_TOKEN':env?.META_SYSTEM_USER_TOKEN?'META_SYSTEM_USER_TOKEN':'NONE'}
function metaEnv(env){if(!env?.META_PAGE_ACCESS_TOKEN)return env;return new Proxy(env,{get(target,prop){if(prop==='META_SYSTEM_USER_TOKEN')return target.META_PAGE_ACCESS_TOKEN||target.META_SYSTEM_USER_TOKEN;return target[prop]}})}
async function graph(path,token,fields){
  const u=new URL(`https://graph.facebook.com/${GRAPH}/${path}`);
  if(fields)u.searchParams.set('fields',fields);
  u.searchParams.set('access_token',token);
  const r=await fetch(u,{headers:{accept:'application/json'}});
  let d={};try{d=await r.json()}catch{}
  if(!r.ok||d?.error)return{ok:false,status:r.status,error:d?.error||{message:'META_INVALID_RESPONSE'}};
  return{ok:true,status:r.status,data:d};
}
function cleanMetaError(e){return e?{message:e.message||null,type:e.type||null,code:e.code??null,subcode:e.error_subcode??null,traceId:e.fbtrace_id||null}:null}
async function directDiagnostic(env){
  const token=activeToken(env);
  if(!token)return{ok:false,error:'META_TOKEN_NOT_CONFIGURED',activeTokenSource:'NONE'};
  const me=await graph('me',token,'id,name');
  const accounts=await graph('me/accounts?limit=200',token,'id,name,tasks');
  const pages=[];
  for(const [pageId,mapping] of Object.entries(PAGE_MAP)){
    const profile=await graph(pageId,token,'id,name');
    pages.push(profile.ok?{pageId,title:mapping.title,ok:true,name:profile.data?.name||null}:{pageId,title:mapping.title,ok:false,httpStatus:profile.status,metaError:cleanMetaError(profile.error)});
  }
  return{
    ok:true,
    graphVersion:GRAPH,
    activeTokenSource:activeTokenSource(env),
    tokenSubject:me.ok?{ok:true,id:me.data?.id||null,name:me.data?.name||null}:{ok:false,httpStatus:me.status,metaError:cleanMetaError(me.error)},
    meAccounts:accounts.ok?{ok:true,count:Array.isArray(accounts.data?.data)?accounts.data.data.length:0,pages:(accounts.data?.data||[]).map(x=>({id:x.id,name:x.name,tasks:x.tasks||[]}))}:{ok:false,httpStatus:accounts.status,metaError:cleanMetaError(accounts.error)},
    directPages:pages,
    readablePages:pages.filter(x=>x.ok).length,
    failedPages:pages.filter(x=>!x.ok).length,
    generatedAt:new Date().toISOString()
  };
}
function episodeNo(message=''){const m=String(message).match(/(?:episode|ep(?:isode)?|eps?|chapter|bab)\s*[-:#.]?\s*0*(\d{1,4})\b/i);return m?Number(m[1]):null}
function titleOf(message=''){const lines=String(message).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(!lines.length)return null;const t=lines[0].replace(/^(?:episode|ep(?:isode)?|eps?|chapter|bab)\s*[-:#.]?\s*0*\d{1,4}\s*[-–—:|]?\s*/i,'').trim();return t&&t.length<=140?t:null}
async function directPageAudit(env,pageId,mapping,maxPosts=100){
  const token=activeToken(env),profile=await graph(pageId,token,'id,name');
  if(!profile.ok)return{ok:false,pageId,mapping,error:'PAGE_PROFILE_READ_FAILED',metaError:profile.error};
  const posts=await graph(`${pageId}/posts?limit=${Math.min(100,maxPosts)}`,token,'id,message,created_time,permalink_url,full_picture');
  if(!posts.ok)return{ok:false,pageId,pageName:profile.data?.name||null,mapping,error:'PAGE_POST_READ_FAILED',metaError:posts.error};
  const rows=(posts.data?.data||[]).slice(0,maxPosts).map(p=>({postId:p.id,publishedAt:p.created_time||null,permalink:p.permalink_url||null,message:p.message||'',title:titleOf(p.message||''),episodeNumber:episodeNo(p.message||''),coverCandidate:/\bcover\b|sampul|official cover|cover resmi|main cover/i.test(p.message||''),fullPicture:p.full_picture||null,characterAppearances:[],provenance:'FB_DETECTED_DIRECT_PAGE_ID'}));
  const eps=[...new Set(rows.map(x=>x.episodeNumber).filter(Number.isFinite))].sort((a,b)=>a-b);
  return{ok:true,pageId,pageName:profile.data?.name||mapping.title,mapping,discoverySource:'DIRECT_PAGE_ID_FALLBACK',scannedPosts:rows.length,detectedEpisodes:eps,highestDetectedEpisode:eps.length?eps[eps.length-1]:null,coverCandidates:rows.filter(x=>x.coverCandidate).map(x=>({postId:x.postId,publishedAt:x.publishedAt,permalink:x.permalink,fullPicture:x.fullPicture,title:x.title})),posts:rows};
}
async function directDiscovery(env,maxPosts=100){
  const token=activeToken(env);if(!token)return{ok:false,error:'META_TOKEN_NOT_CONFIGURED'};
  const audits=[];for(const [pageId,mapping] of Object.entries(PAGE_MAP))audits.push(await directPageAudit(env,pageId,mapping,maxPosts));
  const successful=audits.filter(x=>x.ok);
  return{ok:true,generatedAt:new Date().toISOString(),controller:'ARDA_ACC_HUB',discoverySource:'DIRECT_PAGE_ID_FALLBACK',mappedPages:successful.length,attemptedPages:audits.length,failedPages:audits.filter(x=>!x.ok).map(x=>({pageId:x.pageId,title:x.mapping?.title,error:x.error,metaError:cleanMetaError(x.metaError)})),audits:successful};
}
async function readSnapshot(env){if(!env.COMIC_ASSETS)return null;const o=await env.COMIC_ASSETS.get(SNAPSHOT_KEY);if(!o)return null;try{return JSON.parse(await o.text())}catch{return null}}
async function saveSnapshot(env,s){if(!env.COMIC_ASSETS)return false;await env.COMIC_ASSETS.put(SNAPSHOT_KEY,JSON.stringify(s),{httpMetadata:{contentType:'application/json'}});return true}
function buildPublishedIndex(snapshot){
  const audits=Array.isArray(snapshot?.audits)?snapshot.audits:[];
  const series=audits.filter(a=>a?.ok&&a?.mapping?.seriesId).map(a=>{const episodes=Array.isArray(a.detectedEpisodes)?a.detectedEpisodes.filter(Number.isFinite).sort((x,y)=>x-y):[];const contiguous=episodes.length>0&&episodes.every((n,i)=>n===i+1);const posts=Array.isArray(a.posts)?a.posts:[];return{seriesId:a.mapping.seriesId,title:a.mapping.title,pageId:a.pageId,pageName:a.pageName,scannedPosts:a.scannedPosts||0,detectedEpisodes:episodes,detectedEpisodeCount:episodes.length,highestDetectedEpisode:episodes.length?episodes[episodes.length-1]:null,sequenceContiguousFromOne:contiguous,verificationState:episodes.length?'FB_DETECTED_NEEDS_QC':'NO_EPISODE_DETECTED',coverCandidates:Array.isArray(a.coverCandidates)?a.coverCandidates:[],episodePosts:posts.filter(p=>Number.isFinite(p.episodeNumber)).map(p=>({episodeNumber:p.episodeNumber,title:p.title||null,publishedAt:p.publishedAt||null,permalink:p.permalink||null,postId:p.postId||null,characterAppearances:Array.isArray(p.characterAppearances)?p.characterAppearances:[],media:p.fullPicture||null}))}});
  return{generatedAt:snapshot?.generatedAt||null,source:'FACEBOOK_CANON_SNAPSHOT',rule:'FACEBOOK_VERIFIES_PUBLISHED_STATE_ONLY; DETECTION_REQUIRES_QC_BEFORE_FINAL_COUNT',series};
}
async function runtimeCatalog(request,env){const assetUrl=new URL('/catalog.json',request.url),res=await env.ASSETS.fetch(new Request(assetUrl.toString()));if(!res.ok)return res;const catalog=await res.json(),snapshot=await readSnapshot(env);if(!snapshot)return Response.json(catalog,{headers:{'cache-control':'no-store','x-am-canon-source':'STATIC_NO_SNAPSHOT'}});const index=buildPublishedIndex(snapshot),byId=Object.fromEntries(index.series.map(s=>[s.seriesId,s]));catalog.series=(catalog.series||[]).map(s=>{const fb=byId[s.id];if(!fb)return s;return{...s,facebookAudit:{pageId:fb.pageId,pageName:fb.pageName,detectedEpisodes:fb.detectedEpisodes,detectedEpisodeCount:fb.detectedEpisodeCount,highestDetectedEpisode:fb.highestDetectedEpisode,sequenceContiguousFromOne:fb.sequenceContiguousFromOne,verificationState:fb.verificationState,coverCandidates:fb.coverCandidates},status:s.episodeCountVerified?s.status:(fb.detectedEpisodeCount?'FB_AUDIT_REVIEW_READY':'FB_CANON_AUDIT_PENDING')}});catalog.studio={...catalog.studio,facebookCanonSnapshot:index.generatedAt||null};return Response.json(catalog,{headers:{'cache-control':'no-store','x-am-canon-source':'FB_SNAPSHOT_OVERLAY'}})}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/meta/token-source'&&request.method==='GET')return Response.json({ok:true,pageAccessTokenConfigured:Boolean(env.META_PAGE_ACCESS_TOKEN),legacySystemTokenConfigured:Boolean(env.META_SYSTEM_USER_TOKEN),activeTokenSource:activeTokenSource(env)},{headers:{'cache-control':'no-store'}});
    if(url.pathname==='/api/meta/direct-diagnostic'&&request.method==='GET')return Response.json(await directDiagnostic(env),{headers:{'cache-control':'no-store'}});
    if(url.pathname==='/api/meta/direct-discovery'&&request.method==='GET')return Response.json(await directDiscovery(env,25),{headers:{'cache-control':'no-store'}});
    if(url.pathname==='/api/meta/canon-sync'&&request.method==='POST'){
      const key=request.headers.get('x-am-studio-admin-key')||'';if(!env.AM_STUDIO_ADMIN_KEY||key!==env.AM_STUDIO_ADMIN_KEY)return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401});
      let body={};try{body=await request.json()}catch{}
      const result=await directDiscovery(env,Math.max(1,Math.min(100,Number(body.maxPosts||100))));if(!result.ok)return Response.json(result,{status:503});const saved=await saveSnapshot(env,result);return Response.json({...result,saved},{headers:{'cache-control':'no-store'}});
    }
    if(url.pathname==='/api/meta/pages'&&request.method==='GET'){const d=await directDiscovery(env,1);return Response.json({ok:d.ok,data:(d.audits||[]).map(a=>({id:a.pageId,name:a.pageName,mapping:a.mapping,discoverySource:a.discoverySource})),failedPages:d.failedPages||[],controller:'ARDA_ACC_HUB',scope:'AM_STUDIO_ONLY'},{headers:{'cache-control':'no-store'}})}
    if(url.pathname==='/api/published-index'&&request.method==='GET'){const snapshot=await readSnapshot(env);if(!snapshot)return Response.json({ok:false,error:'CANON_SNAPSHOT_NOT_FOUND'},{status:404,headers:{'cache-control':'no-store'}});return Response.json({ok:true,index:buildPublishedIndex(snapshot)},{headers:{'cache-control':'no-store'}})}
    if(url.pathname==='/catalog.json'&&request.method==='GET')return runtimeCatalog(request,env);
    return base.fetch(request,metaEnv(env),ctx);
  },
  async scheduled(controller,env,ctx){ctx.waitUntil((async()=>{const d=await directDiscovery(env,50);if(d.ok)await saveSnapshot(env,d)})());return base.scheduled(controller,metaEnv(env),ctx)}
};
