import base from './owner-lite-runtime.js';

const INTERNAL_SCRIPT_NAMES=[
  'page-control',
  'admin-panel',
  'asset-upload',
  'private-production',
  'private-production-qc-v2',
  'admin-upload-queue-fix',
  'admin-delete-panel',
  'admin-page-delete'
];

const SIGNING_OBJECT_KEY='system/signing/am-studio-public.json';
const GITHUB_OIDC_ISSUER='https://token.actions.githubusercontent.com';
const GITHUB_OIDC_AUDIENCE='am-studio-signing';
let githubJwksCache={keys:[],expiresAt:0};

function b64UrlBytes(value){
  let s=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4)s+='=';
  const raw=atob(s),out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}

function b64UrlJson(value){
  return JSON.parse(new TextDecoder().decode(b64UrlBytes(value)));
}

async function githubJwks(){
  if(githubJwksCache.keys.length&&Date.now()<githubJwksCache.expiresAt)return githubJwksCache.keys;
  const r=await fetch(GITHUB_OIDC_ISSUER+'/.well-known/jwks',{headers:{accept:'application/json'}});
  if(!r.ok)throw new Error('GITHUB_OIDC_JWKS_UNAVAILABLE');
  const data=await r.json(),keys=Array.isArray(data?.keys)?data.keys:[];
  if(!keys.length)throw new Error('GITHUB_OIDC_JWKS_EMPTY');
  githubJwksCache={keys,expiresAt:Date.now()+60*60*1000};
  return keys;
}

async function verifyGithubSigningOidc(token){
  const parts=String(token||'').split('.');
  if(parts.length!==3)throw new Error('OIDC_INVALID_TOKEN');
  const header=b64UrlJson(parts[0]),claims=b64UrlJson(parts[1]);
  if(header.alg!=='RS256'||!header.kid)throw new Error('OIDC_INVALID_HEADER');

  const now=Math.floor(Date.now()/1000);
  const audience=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==GITHUB_OIDC_ISSUER||!audience.includes(GITHUB_OIDC_AUDIENCE))throw new Error('OIDC_INVALID_ISSUER_OR_AUDIENCE');
  if(Number(claims.exp||0)<=now||Number(claims.nbf||0)>now+30)throw new Error('OIDC_TOKEN_EXPIRED');
  if(claims.repository!=='ardarawk-cloud/AM-Studio-PWA')throw new Error('OIDC_REPOSITORY_DENIED');
  if(claims.ref!=='refs/heads/main')throw new Error('OIDC_REF_DENIED');
  if(!['push','workflow_dispatch'].includes(String(claims.event_name||'')))throw new Error('OIDC_EVENT_DENIED');
  const wf=String(claims.workflow_ref||'');
  if(!wf.includes('ardarawk-cloud/AM-Studio-PWA/.github/workflows/android-independent-release.yml@refs/heads/main'))throw new Error('OIDC_WORKFLOW_DENIED');

  const jwk=(await githubJwks()).find(k=>k.kid===header.kid);
  if(!jwk)throw new Error('OIDC_KEY_NOT_FOUND');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const data=new TextEncoder().encode(parts[0]+'.'+parts[1]);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64UrlBytes(parts[2]),data);
  if(!valid)throw new Error('OIDC_BAD_SIGNATURE');
  return claims;
}

async function signingMaterialRoute(request,env){
  if(request.method!=='POST')return new Response(null,{status:405,headers:{allow:'POST'}});
  const auth=request.headers.get('authorization')||'';
  if(!auth.startsWith('Bearer '))return Response.json({ok:false,error:'OIDC_REQUIRED'},{status:401});
  try{
    await verifyGithubSigningOidc(auth.slice(7).trim());
    const object=await env.COMIC_ASSETS?.get(SIGNING_OBJECT_KEY);
    if(!object)return Response.json({ok:false,error:'SIGNING_MATERIAL_NOT_CONFIGURED'},{status:503});
    const body=await object.text();
    let normalized=body;
    try{
      const parsed=JSON.parse(body);
      if(typeof parsed==='string')normalized=parsed;
    }catch{}
    return new Response(normalized,{
      status:200,
      headers:{
        'content-type':'application/json',
        'cache-control':'no-store',
        'pragma':'no-cache',
        'x-content-type-options':'nosniff'
      }
    });
  }catch(error){
    return Response.json({ok:false,error:String(error?.message||'OIDC_DENIED')},{status:403,headers:{'cache-control':'no-store'}});
  }
}

function isPlayRequest(request){
  try{
    const url=new URL(request.url);
    if(url.searchParams.get('channel')==='play'||url.searchParams.get('channel')==='public')return true;
    return /AMStudioAndroid\/[^\s]+\s+(?:PlayReader|PublicReader)/i.test(request.headers.get('user-agent')||'');
  }catch{return false}
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

function publicDiscoveryCover(series){
  const cover=series?.cover;
  return cover?.publicDiscovery===true
    && typeof cover.publicReaderAsset==='string'
    && cover.publicReaderAsset.startsWith('/');
}

function filterReaderRegistry(data){
  const out=structuredClone(data||{registry:{},episodes:[]});
  out.episodes=(out.episodes||[]).filter(completeReaderAsset);
  out.registry={...(out.registry||{}),readerMode:'PUBLIC_READER_ONLY',playFirewall:true};
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
  out.series=(out.series||[]).filter(series=>ready.has(series.id)||publicDiscoveryCover(series)).map(series=>{
    const episodes=[...(ready.get(series.id)||new Set())].sort((a,b)=>a-b);
    if(!episodes.length)return {...series,episodes:0,episodeCountVerified:true,verifiedEpisodes:[],freeEpisodes:0,status:'COMING_SOON',qc:'PUBLIC_COVER_APPROVED',publicReaderState:'COMING_SOON'};
    const max=episodes[episodes.length-1],contiguous=episodes.length===max&&episodes.every((n,i)=>n===i+1);
    return {...series,episodes:contiguous?max:episodes.length,episodeCountVerified:contiguous,verifiedEpisodes:episodes,freeEpisodes:Math.max(Number(series.freeEpisodes||0),contiguous?max:0),status:'PUBLISHED',qc:'PUBLIC_READER_READY',publicReaderState:'READY'};
  });
  out.studio={...(out.studio||{}),mode:'PUBLIC_READER_ONLY',publicPromotion:true,playFirewall:true};
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

async function publicDocument(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  const html=stripInternalScripts(await response.text());
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-am-public-document','safe');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function playHtml(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  let html=stripInternalScripts(await response.text());
  if(!html.includes('am-play-firewall-bootstrap'))html=html.includes('</head>')?html.replace('</head>',`${PLAY_BOOTSTRAP}</head>`):`${PLAY_BOOTSTRAP}${html}`;
  const scripts=[
    '<script id="am-play-reader-server" src="/native-reader.js?v=5" defer></script>',
    '<script id="am-growth-reader-server" src="/growth-reader.js?v=2" defer></script>',
    '<script id="am-reader-zoom-server" src="/reader-zoom.js?v=2" defer></script>'
  ];
  for(const script of scripts){const id=(script.match(/id="([^"]+)"/)||[])[1];if(id&&html.includes(`id="${id}"`))continue;html=html.includes('</body>')?html.replace('</body>',`${script}</body>`):`${html}${script}`}
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');headers.set('x-am-play-firewall','active');headers.set('x-am-growth-build','v2');headers.set('x-am-reader-zoom','v2');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

async function playReaderJson(response){
  if(!response.ok)return response;
  let data;try{data=await response.json()}catch{return response}
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-am-play-firewall','active');
  return Response.json(filterReaderRegistry(data),{status:response.status,headers});
}

async function playCatalogJson(response,request,env,ctx){
  if(!response.ok)return response;
  let catalog;try{catalog=await response.json()}catch{return response}
  const readerUrl=new URL('/reader-assets.json',request.url);readerUrl.searchParams.set('playFirewallSource','1');
  const readerResponse=await base.fetch(new Request(readerUrl.toString(),{method:'GET',headers:{accept:'application/json'}}),env,ctx);
  let registry={episodes:[]};try{if(readerResponse.ok)registry=await readerResponse.json()}catch{}
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-am-play-firewall','active');
  return Response.json(filterCatalog(catalog,registry),{status:response.status,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/internal/build/signing-material')return signingMaterialRoute(request,env);
    const response=await base.fetch(request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/privacy-policy.html'||url.pathname==='/privacy-policy'))return publicDocument(response);
    if(!isPlayRequest(request))return response;
    if(request.method==='GET'&&url.pathname==='/reader-assets.json')return playReaderJson(response);
    if(request.method==='GET'&&url.pathname==='/catalog.json')return playCatalogJson(response,request,env,ctx);
    return playHtml(response);
  },
  async scheduled(controller,env,ctx){if(base.scheduled)return base.scheduled(controller,env,ctx)}
};

export {completeReaderAsset,publicDiscoveryCover,filterReaderRegistry,filterCatalog,stripInternalScripts,isPlayRequest,publicDocument};
