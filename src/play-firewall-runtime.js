import base from './qc-ui-runtime.js';

const INTERNAL_SCRIPT_NAMES=[
  'page-control',
  'admin-panel',
  'asset-upload',
  'private-production',
  'private-production-qc-v2',
  'admin-upload-queue-fix'
];

function isPlayRequest(request){
  try{return new URL(request.url).searchParams.get('channel')==='play'}catch{return false}
}

function completeReaderAsset(asset){
  if(!asset||asset.canonState!=='CANON_FINAL'||asset.qc!=='QC_PASS')return false;
  if(asset.replacementPending===true)return false;
  if(String(asset.readerState||'').includes('PARTIAL'))return false;
  const readerAsset=typeof asset.readerAsset==='string'&&asset.readerAsset.trim().length>0;
  const pages=Array.isArray(asset.pages)?asset.pages.filter(Boolean):[];
  const total=Number(asset.pageCount||0);
  const available=Number(asset.availablePageCount||pages.length||0);
  const missing=Array.isArray(asset.missingReaderPages)?asset.missingReaderPages.filter(Boolean):[];
  return readerAsset||(total>0&&pages.length>=total&&available>=total&&missing.length===0);
}

function filterReaderRegistry(data){
  const out=structuredClone(data||{registry:{},episodes:[]});
  out.episodes=(out.episodes||[]).filter(completeReaderAsset);
  out.registry={
    ...(out.registry||{}),
    readerMode:'PUBLIC_READER_ONLY',
    playFirewall:true
  };
  return out;
}

function readyEpisodeMap(registry){
  const map=new Map();
  for(const asset of registry?.episodes||[]){
    if(!completeReaderAsset(asset))continue;
    const id=String(asset.seriesId||'').trim(),episode=Number(asset.episode);
    if(!id||!Number.isInteger(episode)||episode<1)continue;
    if(!map.has(id))map.set(id,new Set());
    map.get(id).add(episode);
  }
  return map;
}

function filterCatalog(catalog,registry){
  const out=structuredClone(catalog||{studio:{},series:[]});
  const ready=readyEpisodeMap(registry);
  out.series=(out.series||[]).filter(series=>ready.has(series.id)).map(series=>{
    const episodes=[...ready.get(series.id)].sort((a,b)=>a-b);
    const max=episodes.length?episodes[episodes.length-1]:0;
    const contiguous=max>0&&episodes.length===max&&episodes.every((n,i)=>n===i+1);
    return {
      ...series,
      episodes:contiguous?max:episodes.length,
      episodeCountVerified:contiguous,
      verifiedEpisodes:episodes,
      freeEpisodes:Math.max(Number(series.freeEpisodes||0),contiguous?max:0),
      publicReaderState:'READY'
    };
  });
  out.studio={
    ...(out.studio||{}),
    mode:'PUBLIC_READER_ONLY',
    publicPromotion:true,
    playFirewall:true
  };
  return out;
}

function stripInternalScripts(html){
  let out=html;
  for(const name of INTERNAL_SCRIPT_NAMES){
    const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pattern=new RegExp(`<script\\b[^>]*\\bsrc=["']\\/${escaped}\\.js(?:\\?[^"']*)?["'][^>]*>\\s*<\\/script>`,'gi');
    out=out.replace(pattern,'');
  }
  return out;
}

const PLAY_BOOTSTRAP=`
<style id="am-play-firewall-style">
html[data-am-distribution="play"] #am-admin-launch,
html[data-am-distribution="play"] #am-admin-panel,
html[data-am-distribution="play"] #am-page-control-launch,
html[data-am-distribution="play"] #am-page-control,
html[data-am-distribution="play"] #am-asset-upload-launch,
html[data-am-distribution="play"] #am-asset-upload,
html[data-am-distribution="play"] [id^="am-private-production"],
html[data-am-distribution="play"] [id^="am-qc-"]{display:none!important}
</style>
<script id="am-play-firewall-bootstrap">
(()=>{
  document.documentElement.dataset.amDistribution='play';
  document.documentElement.dataset.amPlayFirewall='active';
  const rawFetch=window.fetch.bind(window);
  window.fetch=(input,init)=>{
    try{
      const source=input instanceof Request?input.url:input;
      const url=new URL(source,location.href);
      if(url.origin===location.origin&&(url.pathname==='/catalog.json'||url.pathname==='/reader-assets.json')){
        url.searchParams.set('channel','play');
        if(input instanceof Request)return rawFetch(new Request(url.toString(),input),init);
        return rawFetch(url.toString(),init);
      }
    }catch{}
    return rawFetch(input,init);
  };
})();
</script>`;

async function playHtml(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  let html=stripInternalScripts(await response.text());
  if(!html.includes('am-play-firewall-bootstrap')){
    html=html.includes('</head>')?html.replace('</head>',`${PLAY_BOOTSTRAP}</head>`):`${PLAY_BOOTSTRAP}${html}`;
  }
  const reader='<script id="am-play-reader-server" src="/native-reader.js?v=3" defer></script>';
  if(!html.includes('am-play-reader-server'))html=html.includes('</body>')?html.replace('</body>',`${reader}</body>`):`${html}${reader}`;
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-am-play-firewall','active');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function playReaderJson(response){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-am-play-firewall','active');
  return Response.json(filterReaderRegistry(data),{status:response.status,headers});
}

async function playCatalogJson(response,request,env,ctx){
  if(!response.ok)return response;
  let catalog;try{catalog=await response.json()}catch{return response}
  const readerUrl=new URL('/reader-assets.json',request.url);
  readerUrl.searchParams.set('playFirewallSource','1');
  const readerResponse=await base.fetch(new Request(readerUrl.toString(),{method:'GET',headers:{accept:'application/json'}}),env,ctx);
  let registry={episodes:[]};try{if(readerResponse.ok)registry=await readerResponse.json()}catch{}
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-am-play-firewall','active');
  return Response.json(filterCatalog(catalog,registry),{status:response.status,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const response=await base.fetch(request,env,ctx);
    if(!isPlayRequest(request))return response;
    if(request.method==='GET'&&url.pathname==='/reader-assets.json')return playReaderJson(response);
    if(request.method==='GET'&&url.pathname==='/catalog.json')return playCatalogJson(response,request,env,ctx);
    return playHtml(response);
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};

export {completeReaderAsset,filterReaderRegistry,filterCatalog,stripInternalScripts};
