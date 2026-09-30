(()=>{
  if(document.documentElement.dataset.amDistribution==='play')return;

  const style=document.createElement('style');
  style.id='am-page-delete-style';
  style.textContent=`
    .am-page-delete-wrap{position:relative;display:block;width:100%}
    .am-page-delete-wrap>.comic-page{display:block;width:100%}
    .am-page-delete-x{
      position:absolute;top:10px;right:10px;z-index:80;
      width:42px;height:42px;border-radius:999px;
      border:2px solid rgba(255,255,255,.9);
      background:#d9272e;color:#fff;
      font:900 29px/34px system-ui,-apple-system,Segoe UI,sans-serif;
      box-shadow:0 5px 18px rgba(0,0,0,.65);
      display:flex;align-items:center;justify-content:center;
      padding:0;cursor:pointer
    }
    .am-page-delete-x:disabled{opacity:.55}
    .am-page-delete-tag{
      position:absolute;top:13px;right:61px;z-index:79;
      background:rgba(5,7,11,.86);color:#fff;border:1px solid #4b5563;
      border-radius:999px;padding:5px 8px;
      font:800 10px system-ui,-apple-system,Segoe UI,sans-serif
    }
  `;
  document.head.appendChild(style);

  function parsePage(img){
    try{
      const u=new URL(img.currentSrc||img.src,location.href);
      const m=u.pathname.match(/^\/media\/comics\/([a-z0-9-]+)\/ep(\d{3})\/page-(\d{2,3})\.(?:jpg|jpeg|png|webp|avif)$/i);
      if(!m)return null;
      return {seriesId:m[1].toLowerCase(),episode:Number(m[2]),page:Number(m[3])};
    }catch{return null}
  }

  function adminKey(){return sessionStorage.getItem('am_admin_key')||''}

  async function removePage(info,button){
    const key=adminKey();
    if(!key){
      const launcher=document.getElementById('am-admin-launch');
      if(launcher)launcher.click();
      alert('Unlock ADMIN dulu. Setelah itu kembali ke page dan tekan × lagi.');
      return;
    }
    if(!confirm(`Hapus Page ${info.page} saja?\n\nSeries: ${info.seriesId}\nEpisode: ${info.episode}\n\nPage lain tidak ikut terhapus.`))return;
    button.disabled=true;
    button.textContent='…';
    try{
      const r=await fetch(`/api/assets/series/${encodeURIComponent(info.seriesId)}/episodes/${info.episode}/pages/${info.page}`,{
        method:'DELETE',
        cache:'no-store',
        headers:{
          'x-am-studio-admin-key':key,
          'x-am-delete-confirmation':`${info.seriesId}:${info.episode}:page:${info.page}`,
          'accept':'application/json'
        }
      });
      let data={};try{data=await r.json()}catch{}
      if(!r.ok||data.ok===false)throw new Error(data.error||`HTTP ${r.status}`);
      const wrap=button.closest('.am-page-delete-wrap');
      if(wrap)wrap.remove();
      setTimeout(()=>location.reload(),450);
    }catch(e){
      button.disabled=false;
      button.textContent='×';
      alert('Gagal hapus page: '+String(e.message||e));
    }
  }

  function decorate(img){
    if(!(img instanceof HTMLImageElement)||img.dataset.amPageDeleteReady==='1')return;
    const info=parsePage(img);if(!info)return;
    img.dataset.amPageDeleteReady='1';

    const parent=img.parentElement;
    if(!parent)return;
    const wrap=document.createElement('div');
    wrap.className='am-page-delete-wrap';
    parent.insertBefore(wrap,img);
    wrap.appendChild(img);

    const tag=document.createElement('span');
    tag.className='am-page-delete-tag';
    tag.textContent=`PAGE ${String(info.page).padStart(2,'0')}`;
    wrap.appendChild(tag);

    const x=document.createElement('button');
    x.type='button';
    x.className='am-page-delete-x';
    x.setAttribute('aria-label',`Hapus Page ${info.page}`);
    x.textContent='×';
    x.onclick=e=>{e.preventDefault();e.stopPropagation();removePage(info,x)};
    wrap.appendChild(x);
  }

  function scan(){
    document.querySelectorAll('img.comic-page, .comic-stack img').forEach(decorate);
  }

  scan();
  const observer=new MutationObserver(scan);
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();