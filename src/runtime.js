import base from './index.js';

const SNAPSHOT_KEY='system/fb-canon-audit/latest.json';

function metaEnv(env){
  // The working ACC Publish Connector discovers Pages with META_PAGE_ACCESS_TOKEN.
  // Keep META_SYSTEM_USER_TOKEN as a backwards-compatible fallback, but present
  // the publish-grade Page token to the base controller when it is configured.
  if(!env?.META_PAGE_ACCESS_TOKEN)return env;
  return new Proxy(env,{
    get(target,prop){
      if(prop==='META_SYSTEM_USER_TOKEN')return target.META_PAGE_ACCESS_TOKEN||target.META_SYSTEM_USER_TOKEN;
      return target[prop];
    }
  });
}

async function readSnapshot(env){
  if(!env.COMIC_ASSETS)return null;
  const o=await env.COMIC_ASSETS.get(SNAPSHOT_KEY);
  if(!o)return null;
  try{return JSON.parse(await o.text())}catch{return null}
}

function buildPublishedIndex(snapshot){
  const audits=Array.isArray(snapshot?.audits)?snapshot.audits:[];
  const series=audits.filter(a=>a?.ok&&a?.mapping?.seriesId).map(a=>{
    const episodes=Array.isArray(a.detectedEpisodes)?a.detectedEpisodes.filter(Number.isFinite).sort((x,y)=>x-y):[];
    const contiguous=episodes.length>0&&episodes.every((n,i)=>n===i+1);
    const posts=Array.isArray(a.posts)?a.posts:[];
    const episodePosts=posts.filter(p=>Number.isFinite(p.episodeNumber)).map(p=>({
      episodeNumber:p.episodeNumber,
      title:p.title||null,
      publishedAt:p.publishedAt||null,
      permalink:p.permalink||null,
      postId:p.postId||null,
      characterAppearances:Array.isArray(p.characterAppearances)?p.characterAppearances:[],
      media:p.fullPicture||null
    }));
    return {
      seriesId:a.mapping.seriesId,
      title:a.mapping.title,
      pageId:a.pageId,
      pageName:a.pageName,
      scannedPosts:a.scannedPosts||0,
      detectedEpisodes:episodes,
      detectedEpisodeCount:episodes.length,
      highestDetectedEpisode:episodes.length?episodes[episodes.length-1]:null,
      sequenceContiguousFromOne:contiguous,
      verificationState:episodes.length?'FB_DETECTED_NEEDS_QC':'NO_EPISODE_DETECTED',
      coverCandidates:Array.isArray(a.coverCandidates)?a.coverCandidates:[],
      episodePosts
    };
  });
  return {
    generatedAt:snapshot?.generatedAt||null,
    source:'FACEBOOK_CANON_SNAPSHOT',
    rule:'FACEBOOK_VERIFIES_PUBLISHED_STATE_ONLY; DETECTION_REQUIRES_QC_BEFORE_FINAL_COUNT',
    series
  };
}

async function runtimeCatalog(request,env){
  const assetUrl=new URL('/catalog.json',request.url);
  const res=await env.ASSETS.fetch(new Request(assetUrl.toString()));
  if(!res.ok)return res;
  const catalog=await res.json();
  const snapshot=await readSnapshot(env);
  if(!snapshot)return Response.json(catalog,{headers:{'cache-control':'no-store','x-am-canon-source':'STATIC_NO_SNAPSHOT'}});
  const index=buildPublishedIndex(snapshot);
  const byId=Object.fromEntries(index.series.map(s=>[s.seriesId,s]));
  catalog.series=(catalog.series||[]).map(s=>{
    const fb=byId[s.id];
    if(!fb)return s;
    return {
      ...s,
      facebookAudit:{
        pageId:fb.pageId,
        pageName:fb.pageName,
        detectedEpisodes:fb.detectedEpisodes,
        detectedEpisodeCount:fb.detectedEpisodeCount,
        highestDetectedEpisode:fb.highestDetectedEpisode,
        sequenceContiguousFromOne:fb.sequenceContiguousFromOne,
        verificationState:fb.verificationState,
        coverCandidates:fb.coverCandidates
      },
      status:s.episodeCountVerified?s.status:(fb.detectedEpisodeCount?'FB_AUDIT_REVIEW_READY':'FB_CANON_AUDIT_PENDING')
    };
  });
  catalog.studio={...catalog.studio,facebookCanonSnapshot:index.generatedAt||null};
  return Response.json(catalog,{headers:{'cache-control':'no-store','x-am-canon-source':'FB_SNAPSHOT_OVERLAY'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/meta/token-source'&&request.method==='GET'){
      return Response.json({
        ok:true,
        pageAccessTokenConfigured:Boolean(env.META_PAGE_ACCESS_TOKEN),
        legacySystemTokenConfigured:Boolean(env.META_SYSTEM_USER_TOKEN),
        activeTokenSource:env.META_PAGE_ACCESS_TOKEN?'META_PAGE_ACCESS_TOKEN':env.META_SYSTEM_USER_TOKEN?'META_SYSTEM_USER_TOKEN':'NONE',
        requiredForMultiPageDiscovery:'META_PAGE_ACCESS_TOKEN'
      },{headers:{'cache-control':'no-store'}});
    }
    if(url.pathname==='/api/published-index'&&request.method==='GET'){
      const snapshot=await readSnapshot(env);
      if(!snapshot)return Response.json({ok:false,error:'CANON_SNAPSHOT_NOT_FOUND'},{status:404,headers:{'cache-control':'no-store'}});
      return Response.json({ok:true,index:buildPublishedIndex(snapshot)},{headers:{'cache-control':'no-store'}});
    }
    if(url.pathname==='/catalog.json'&&request.method==='GET')return runtimeCatalog(request,env);
    return base.fetch(request,metaEnv(env),ctx);
  },
  async scheduled(controller,env,ctx){
    return base.scheduled(controller,metaEnv(env),ctx);
  }
};
