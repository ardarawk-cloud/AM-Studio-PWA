(()=>{
  if(window.__amReaderZoomV3)return;
  window.__amReaderZoomV3=true;
  window.__amReaderZoomV2=true;
  window.__amReaderZoomV1=true;
  document.documentElement.dataset.amReaderZoom='continuous';

  const MAX_SCALE=5;
  const MIN_SCALE=1;
  const pad=(n,w=2)=>String(n).padStart(w,'0');
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  let activeStack=null;
  let scale=1;
  let pinchStartDistance=0;
  let pinchStartScale=1;

  function enableWholePageZoomFallback(){
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
      html[data-am-reader-zoom="continuous"],html[data-am-reader-zoom="continuous"] body{overscroll-behavior-x:auto}
      html[data-am-reader-zoom="continuous"] .comic-stack{overflow:visible!important;max-width:none!important;transform-origin:top left;touch-action:pan-x pan-y}
      html[data-am-reader-zoom="continuous"] .comic-page{display:block;width:100%;height:auto;cursor:default!important;touch-action:pan-x pan-y!important;-webkit-user-drag:none}
      .am-reader-zoom-entry-hint{display:none!important}
      .am-reader-zoom-bar{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin:0 0 8px;padding:0;background:transparent;border:0;color:#d7deea;font:700 10px system-ui,-apple-system,Segoe UI,sans-serif}
      .am-reader-zoom-bar[hidden]{display:none!important}
      .am-reader-zoom-bar button{border:1px solid #ffffff26;border-radius:999px;background:#151b25;color:#fff;padding:7px 11px;font:800 10px system-ui,-apple-system,Segoe UI,sans-serif}
      .am-reader-page-number{display:flex;align-items:center;justify-content:center;min-height:31px;padding:7px 10px;background:#05070b;color:#d7deea;border-top:1px solid #ffffff1a;border-bottom:1px solid #ffffff1a;font:800 11px/1 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.12em;text-transform:uppercase;user-select:none;-webkit-user-select:none}
      #am-reader-zoom-overlay{display:none!important}
    `;
    document.head.appendChild(style);
  }

  function removeLegacyOverlay(){
    document.getElementById('am-reader-zoom-overlay')?.remove();
    if(document.body.style.overflow==='hidden')document.body.style.overflow='';
  }

  function distance(a,b){return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)}

  function updateZoomUi(){
    if(!activeStack)return;
    activeStack.style.width=`${Math.round(scale*10000)/100}%`;
    activeStack.dataset.amContinuousScale=String(scale);
    const level=document.getElementById('am-reader-continuous-zoom-level');
    const bar=document.getElementById('am-reader-continuous-zoom-bar');
    if(level)level.textContent=`${Math.round(scale*100)}%`;
    if(bar)bar.hidden=scale<=1.001;
  }

  function resetZoom(){
    scale=1;
    pinchStartDistance=0;
    pinchStartScale=1;
    updateZoomUi();
    document.scrollingElement?.scrollTo({left:0,behavior:'smooth'});
  }

  function bindContinuousPinch(stack){
    if(stack.dataset.amContinuousZoomBound==='1')return;
    stack.dataset.amContinuousZoomBound='1';

    stack.addEventListener('touchstart',event=>{
      if(event.touches.length!==2)return;
      activeStack=stack;
      pinchStartDistance=Math.max(1,distance(event.touches[0],event.touches[1]));
      pinchStartScale=scale;
    },{passive:true});

    stack.addEventListener('touchmove',event=>{
      if(event.touches.length!==2||!pinchStartDistance)return;
      const now=Math.max(1,distance(event.touches[0],event.touches[1]));
      scale=clamp(pinchStartScale*(now/pinchStartDistance),MIN_SCALE,MAX_SCALE);
      updateZoomUi();
      event.preventDefault();
    },{passive:false});

    stack.addEventListener('touchend',event=>{
      if(event.touches.length<2)pinchStartDistance=0;
    },{passive:true});

    stack.addEventListener('touchcancel',()=>{pinchStartDistance=0},{passive:true});
  }

  function decorateReader(){
    enableWholePageZoomFallback();
    installStyle();
    removeLegacyOverlay();

    const stack=document.querySelector('.comic-stack');
    if(!stack)return;
    if(activeStack!==stack){
      activeStack=stack;
      scale=1;
    }
    bindContinuousPinch(stack);
    updateZoomUi();

    document.getElementById('am-reader-zoom-entry-hint')?.remove();

    let bar=document.getElementById('am-reader-continuous-zoom-bar');
    if(!bar){
      bar=document.createElement('div');
      bar.id='am-reader-continuous-zoom-bar';
      bar.className='am-reader-zoom-bar';
      bar.hidden=true;
      bar.innerHTML='<span id="am-reader-continuous-zoom-level">100%</span><button type="button" id="am-reader-continuous-reset">Reset</button>';
      stack.parentNode?.insertBefore(bar,stack);
      bar.querySelector('#am-reader-continuous-reset')?.addEventListener('click',resetZoom);
    }
    updateZoomUi();

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
