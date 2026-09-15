(()=>{
  if(window.__amReaderBootstrapV1)return;
  window.__amReaderBootstrapV1=true;
  const ua=navigator.userAgent||'';
  const owner=/AMStudioAndroid\/[^\s]+\s+OwnerBeta/i.test(ua);
  const rawFetch=window.fetch.bind(window);

  if(owner){
    window.fetch=async(input,init)=>{
      let url;
      try{url=new URL(input instanceof Request?input.url:input,location.href)}catch{return rawFetch(input,init)}
      if(url.origin!==location.origin||url.pathname!=='/catalog.json')return rawFetch(input,init);
      const catalogResponse=await rawFetch(input,init);
      if(!catalogResponse.ok)return catalogResponse;
      let catalog;try{catalog=await catalogResponse.clone().json()}catch{return catalogResponse}
      try{
        const rr=new URL('/reader-assets.json',location.origin);
        rr.searchParams.set('channel','beta');
        rr.searchParams.set('t',String(Date.now()));
        const registry=await rawFetch(rr.toString(),{cache:'no-store'}).then(r=>r.ok?r.json():{episodes:[]});
        const bySeries=new Map();
        for(const a of registry?.episodes||[]){
          const id=String(a?.seriesId||''),ep=Number(a?.episode),pages=Array.isArray(a?.pages)?a.pages.filter(Boolean):[];
          if(!id||!Number.isInteger(ep)||ep<1||!pages.length)continue;
          if(!bySeries.has(id))bySeries.set(id,[]);
          bySeries.get(id).push({ep,title:a.title||`Episode ${String(ep).padStart(3,'0')}`});
        }
        catalog.series=(catalog.series||[]).map(s=>{
          const rows=(bySeries.get(String(s.id))||[]).sort((a,b)=>a.ep-b.ep);
          if(!rows.length)return s;
          const nums=[...new Set(rows.map(x=>x.ep))].sort((a,b)=>a-b),max=nums.at(-1)||0;
          const contiguous=nums.length===max&&nums.every((n,i)=>n===i+1);
          return {...s,episodes:contiguous?max:(Number(s.episodes)||null),episodeCountVerified:contiguous||s.episodeCountVerified,verifiedEpisodes:[...new Set([...(s.verifiedEpisodes||[]),...nums])].sort((a,b)=>a-b),episodeTitles:Array.from({length:max},(_,i)=>rows.find(x=>x.ep===i+1)?.title||s.episodeTitles?.[i]||`Episode ${String(i+1).padStart(3,'0')}`)};
        });
        const headers=new Headers(catalogResponse.headers);headers.set('content-type','application/json');headers.set('cache-control','no-store');headers.set('x-am-owner-client-patch','reader-assets');
        return new Response(JSON.stringify(catalog),{status:catalogResponse.status,statusText:catalogResponse.statusText,headers});
      }catch{return catalogResponse}
    };
  }

  function applyCovers(){
    document.querySelectorAll('.card[data-open],.card[data-series],article[data-open],article[data-series]').forEach(card=>{
      const id=card.dataset.open||card.dataset.series,cover=card.querySelector('.cover');
      if(!id||!cover||cover.dataset.amR2Cover==='1')return;
      cover.dataset.amR2Cover='1';
      cover.style.backgroundImage=`linear-gradient(180deg,rgba(5,7,11,.02) 28%,rgba(5,7,11,.9) 100%),url('/media/comics/${encodeURIComponent(id)}/cover.jpg')`;
      cover.style.backgroundSize='cover';cover.style.backgroundPosition='center';cover.style.backgroundRepeat='no-repeat';
    });
  }

  function openOwnerAdmin(){
    if(!owner)return;
    document.documentElement.dataset.amOwnerMode='1';
    const panel=document.getElementById('am-admin-panel'),launch=document.getElementById('am-admin-launch');
    if(panel){panel.classList.add('open');return true}
    if(launch){launch.click();return true}
    return false;
  }

  const start=()=>{
    applyCovers();
    if(owner){let n=0;const t=setInterval(()=>{n++;if(openOwnerAdmin()||n>80)clearInterval(t)},100)}
    let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;applyCovers()})}).observe(document.documentElement,{childList:true,subtree:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();