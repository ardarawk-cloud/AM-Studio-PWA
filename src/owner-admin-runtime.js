import base from './play-firewall-runtime.js';

function isPlay(request){
  try{
    const url=new URL(request.url);
    if(url.searchParams.get('channel')==='play')return true;
    return /AMStudioAndroid\/[^\s]+\s+PlayReader/i.test(request.headers.get('user-agent')||'');
  }catch{return false}
}

function ownerNative(request){
  try{
    const url=new URL(request.url);
    return (url.searchParams.get('channel')==='beta'&&url.searchParams.get('native')==='android')||/AMStudioAndroid\/[^\s]+\s+OwnerBeta/i.test(request.headers.get('user-agent')||'');
  }catch{return false}
}

function patchCatalogFromReader(catalog,registry){
  const out=structuredClone(catalog||{studio:{},series:[]});
  const bySeries=new Map();
  for(const asset of registry?.episodes||[]){
    const id=String(asset?.seriesId||'').trim(),ep=Number(asset?.episode);
    const pages=Array.isArray(asset?.pages)?asset.pages.filter(Boolean):[];
    if(!id||!Number.isInteger(ep)||ep<1||!pages.length)continue;
    if(!bySeries.has(id))bySeries.set(id,[]);
    bySeries.get(id).push({ep,title:asset.title||`Episode ${String(ep).padStart(3,'0')}`});
  }
  out.series=(out.series||[]).map(series=>{
    const list=(bySeries.get(String(series.id))||[]).sort((a,b)=>a.ep-b.ep);
    if(!list.length)return series;
    const nums=[...new Set(list.map(x=>x.ep))].sort((a,b)=>a-b);
    const max=nums.at(-1)||0;
    const contiguous=nums.length===max&&nums.every((n,i)=>n===i+1);
    const titles=Array.from({length:max},(_,i)=>list.find(x=>x.ep===i+1)?.title||series.episodeTitles?.[i]||`Episode ${String(i+1).padStart(3,'0')}`);
    return {...series,episodes:contiguous?max:(Number(series.episodes)||null),episodeCountVerified:contiguous||series.episodeCountVerified,verifiedEpisodes:[...new Set([...(series.verifiedEpisodes||[]),...nums])].sort((a,b)=>a-b),episodeTitles:titles};
  });
  return out;
}

async function patchOwnerCatalog(response,request,env,ctx){
  if(!response.ok)return response;
  let catalog;try{catalog=await response.json()}catch{return response}
  const readerUrl=new URL('/reader-assets.json',request.url);
  readerUrl.searchParams.set('channel','beta');
  const rr=await base.fetch(new Request(readerUrl.toString(),{method:'GET',headers:{accept:'application/json','user-agent':request.headers.get('user-agent')||''}}),env,ctx);
  let registry={episodes:[]};try{if(rr.ok)registry=await rr.json()}catch{}
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-am-owner-catalog-patch','reader-assets');
  return Response.json(patchCatalogFromReader(catalog,registry),{status:response.status,headers});
}

async function injectScripts(response,scripts){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  let html=await response.text();
  for(const src of scripts){
    const plain=src.split('?')[0];
    if(html.includes(`src="${plain}`)||html.includes(`src='${plain}`))continue;
    const tag=`<script src="${src}" defer></script>`;
    html=html.includes('</body>')?html.replace('</body>',`${tag}</body>`):`${html}${tag}`;
  }
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-am-owner-admin-runtime','v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    let response=await base.fetch(request,env,ctx);
    const play=isPlay(request);
    if(request.method==='GET'&&url.pathname==='/catalog.json'&&!play)response=await patchOwnerCatalog(response,request,env,ctx);
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname.endsWith('.html'))){
      const scripts=['/cover-assets.js?v=20260916a'];
      if(!play&&ownerNative(request))scripts.push('/owner-mode.js?v=20260916a');
      response=await injectScripts(response,scripts);
    }
    return response;
  },
  async scheduled(controller,env,ctx){if(base.scheduled)return base.scheduled(controller,env,ctx)}
};

export {isPlay,ownerNative,patchCatalogFromReader};