(()=>{
  if(window.__amReaderZoomV2)return;
  window.__amReaderZoomV2=true;
  window.__amReaderZoomV1=true;
  document.documentElement.dataset.amReaderZoom='continuous';

  const MAX_SCALE=5;
  const pad=(n,w=2)=>String(n).padStart(w,'0');

  function enableWholeReaderZoom(){
    let viewport=document.querySelector('meta[name="viewport"]');
    if(!viewport){
      viewport=document.createElement('meta');
      viewport.name='viewport';
      document.head.appendChild(viewport);
    }
    viewport.setAttribute('content',`width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=${MAX_SCALE},user-scalable=yes,viewport-fit=cover`);
  }

  function installStyle(){
    if(document.getElementById('am-reader-zoom-style'))return;
    const style=document.createElement('style');
    style.id='am-reader-zoom-style';
    style.textContent=`
      html[data-am-reader-zoom="continuous"],
      html[data-am-reader-zoom="continuous"] body{touch-action:pan-x pan-y pinch-zoom!important}
      html[data-am-reader-zoom="continuous"] .comic-stack{overflow:visible!important}
      html[data-am-reader-zoom="continuous"] .comic-page{display:block;width:100%;height:auto;cursor:default!important;touch-action:auto!important;-webkit-user-drag:none}
      .am-reader-zoom-entry-hint{margin:8px 0 12px;padding:9px 12px;border-radius:12px;background:#101722;border:1px solid #ffffff1f;color:#cbd3df;font-size:11px;line-height:1.45;text-align:center}
      .am-reader-page-number{display:flex;align-items:center;justify-content:center;min-height:31px;padding:7px 10px;background:#05070b;color:#d7deea;border-top:1px solid #ffffff1a;border-bottom:1px solid #ffffff1a;font:800 11px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.12em;text-transform:uppercase;user-select:none;-webkit-user-select:none}
      .am-reader-page-number:first-child{border-top:0}
      #am-reader-zoom-overlay{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function removeLegacyOverlay(){
    const overlay=document.getElementById('am-reader-zoom-overlay');
    if(overlay)overlay.remove();
    if(document.body.style.overflow==='hidden')document.body.style.overflow='';
  }

  function decorateReader(){
    enableWholeReaderZoom();
    installStyle();
    removeLegacyOverlay();

    const stack=document.querySelector('.comic-stack');
    if(!stack)return;

    const oldHint=document.getElementById('am-reader-zoom-entry-hint');
    if(oldHint)oldHint.remove();
    const hint=document.createElement('div');
    hint.id='am-reader-zoom-entry-hint';
    hint.className='am-reader-zoom-entry-hint';
    hint.textContent='Cubit 2 jari untuk zoom seluruh komik sampai 5×. Semua halaman tetap tersambung—tidak perlu buka/tutup zoom per page.';
    stack.parentNode?.insertBefore(hint,stack);

    const pages=[...stack.querySelectorAll('img.comic-page')];
    const total=pages.length;
    pages.forEach((img,index)=>{
      img.removeAttribute('role');
      img.removeAttribute('tabindex');
      img.dataset.amZoomReady='continuous';
      img.setAttribute('aria-label',img.alt||`Page ${index+1}`);

      const prev=img.previousElementSibling;
      if(prev?.classList?.contains('am-reader-page-number'))prev.remove();

      const label=document.createElement('div');
      label.className='am-reader-page-number';
      label.dataset.page=String(index+1);
      label.textContent=total>1?`PAGE ${pad(index+1)} / ${pad(total)}`:`PAGE ${pad(index+1)}`;
      img.parentNode?.insertBefore(label,img);
    });
  }

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      decorateReader();
    });
  };

  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  addEventListener('orientationchange',schedule);
  schedule();
})();
