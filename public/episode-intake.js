(()=>{
  const EVENT='amstudio:episode-staged';
  const API='/api/pipeline/validate';
  let pending=null,lastValidated='';
  const key=()=>sessionStorage.getItem('am_admin_key')||'';
  const target=()=>({seriesId:document.querySelector('#amaSeries')?.value||'',episode:Number(document.querySelector('#amaEpisode')?.value||0)});
  async function validate(t){
    if(!key()||!t.seriesId||!t.episode)return {ok:false,error:'INVALID_INTAKE_TARGET'};
    const r=await fetch(API,{method:'POST',cache:'no-store',headers:{'x-am-studio-admin-key':key(),'content-type':'application/json'},body:JSON.stringify(t)});
    let x={};try{x=await r.json()}catch{}
    if(!r.ok||x.ok===false)return {ok:false,error:x.error||`HTTP ${r.status}`,data:x};
    return {ok:true,data:x};
  }
  function appendStatus(message,ok){
    const el=document.querySelector('#amaStatus');if(!el)return;
    const line=document.createElement('div');line.style.marginTop='8px';line.style.color=ok?'#72e7ad':'#f1c56b';line.textContent=message;el.appendChild(line);
  }
  function install(){
    const upload=document.querySelector('#amaUpload'),status=document.querySelector('#amaStatus');
    if(!upload||!status)return false;
    upload.addEventListener('click',()=>{pending=target()},{capture:true});
    new MutationObserver(async()=>{
      if(!pending||!status.textContent.includes('SELESAI'))return;
      const sig=`${pending.seriesId}:${pending.episode}`;if(sig===lastValidated)return;lastValidated=sig;
      const t=pending;pending=null;
      appendStatus('Menjalankan technical QC otomatis…',true);
      const result=await validate(t);
      appendStatus(result.ok?'✓ TECHNICAL QC PASS — menunggu Owner Approval.':`QC belum lolos — ${result.error}. Episode tetap HOLD/STAGING.`,result.ok);
      window.dispatchEvent(new CustomEvent(EVENT,{detail:{...t,validated:result.ok,result}}));
    }).observe(status,{childList:true,subtree:true,characterData:true});
    return true;
  }
  if(!install()){
    const observer=new MutationObserver(()=>{if(install())observer.disconnect()});observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();
