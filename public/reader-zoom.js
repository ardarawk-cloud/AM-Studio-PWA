(()=>{
  if(window.__amReaderZoomV1)return;
  window.__amReaderZoomV1=true;

  const isPlay=()=>document.documentElement.dataset.amDistribution==='play'||new URLSearchParams(location.search).get('channel')==='play';
  if(!isPlay())return;

  const MAX_SCALE=5;
  const MIN_SCALE=1;
  let overlay=null;
  let zoomImage=null;
  let viewport=null;
  let scale=1;
  let offsetX=0;
  let offsetY=0;
  let previousBodyOverflow='';
  let lastTapAt=0;
  let lastTapX=0;
  let lastTapY=0;
  const pointers=new Map();
  let gesture=null;

  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

  function installStyle(){
    if(document.getElementById('am-reader-zoom-style'))return;
    const style=document.createElement('style');
    style.id='am-reader-zoom-style';
    style.textContent=`
      html[data-am-distribution="play"] .comic-page{cursor:zoom-in;touch-action:pan-y pinch-zoom}
      #am-reader-zoom-overlay{position:fixed;inset:0;z-index:12000;background:#020306f7;color:#fff;display:grid;grid-template-rows:auto 1fr;overscroll-behavior:contain}
      #am-reader-zoom-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px calc(10px + env(safe-area-inset-top));background:#070a0ff2;border-bottom:1px solid #ffffff24}
      #am-reader-zoom-toolbar .am-zoom-actions{display:flex;gap:7px;align-items:center}
      #am-reader-zoom-toolbar button{min-width:44px;min-height:44px;border:1px solid #ffffff2b;border-radius:12px;background:#151b25;color:#fff;font:700 14px system-ui,-apple-system,Segoe UI,sans-serif;padding:8px 11px}
      #am-reader-zoom-toolbar button:active{transform:scale(.97)}
      #am-reader-zoom-level{min-width:58px;text-align:center;font:800 12px system-ui,-apple-system,Segoe UI,sans-serif;color:#d7deea}
      #am-reader-zoom-viewport{position:relative;overflow:hidden;display:grid;place-items:center;touch-action:none;user-select:none;-webkit-user-select:none}
      #am-reader-zoom-image{display:block;max-width:100%;max-height:100%;width:auto;height:auto;transform-origin:center center;will-change:transform;touch-action:none;-webkit-user-drag:none}
      #am-reader-zoom-hint{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);max-width:calc(100% - 28px);padding:8px 11px;border-radius:999px;background:#090d14dc;border:1px solid #ffffff25;color:#d6dce6;font:600 11px system-ui,-apple-system,Segoe UI,sans-serif;text-align:center;pointer-events:none;transition:opacity .25s}
      #am-reader-zoom-hint.am-hidden{opacity:0}
      .am-reader-zoom-entry-hint{margin:8px 0 12px;padding:8px 11px;border-radius:12px;background:#101722;border:1px solid #ffffff1f;color:#cbd3df;font-size:11px;line-height:1.4;text-align:center}
    `;
    document.head.appendChild(style);
  }

  function bounds(){
    if(!viewport||!zoomImage)return {x:0,y:0};
    const vr=viewport.getBoundingClientRect();
    const ir=zoomImage.getBoundingClientRect();
    const baseWidth=scale?ir.width/scale:ir.width;
    const baseHeight=scale?ir.height/scale:ir.height;
    return {
      x:Math.max(0,(baseWidth*scale-vr.width)/2)+32,
      y:Math.max(0,(baseHeight*scale-vr.height)/2)+32
    };
  }

  function applyTransform(){
    if(!zoomImage)return;
    scale=clamp(scale,MIN_SCALE,MAX_SCALE);
    const b=bounds();
    if(scale<=1.001){offsetX=0;offsetY=0}
    else{
      offsetX=clamp(offsetX,-b.x,b.x);
      offsetY=clamp(offsetY,-b.y,b.y);
    }
    zoomImage.style.transform=`translate3d(${offsetX}px,${offsetY}px,0) scale(${scale})`;
    const level=document.getElementById('am-reader-zoom-level');
    if(level)level.textContent=`${Math.round(scale*100)}%`;
  }

  function setScale(next){
    scale=clamp(next,MIN_SCALE,MAX_SCALE);
    if(scale===1){offsetX=0;offsetY=0}
    applyTransform();
  }

  function distance(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
  function midpoint(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}}

  function beginGesture(){
    const pts=[...pointers.values()];
    if(pts.length>=2){
      const a=pts[0],b=pts[1];
      gesture={type:'pinch',startDistance:Math.max(1,distance(a,b)),startScale:scale,startMid:midpoint(a,b),startX:offsetX,startY:offsetY};
    }else if(pts.length===1){
      gesture={type:'pan',startPoint:{...pts[0]},startX:offsetX,startY:offsetY};
    }else gesture=null;
  }

  function onPointerDown(event){
    if(!viewport)return;
    viewport.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    beginGesture();
    document.getElementById('am-reader-zoom-hint')?.classList.add('am-hidden');
  }

  function onPointerMove(event){
    if(!pointers.has(event.pointerId))return;
    pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    const pts=[...pointers.values()];
    if(pts.length>=2){
      if(!gesture||gesture.type!=='pinch')beginGesture();
      if(!gesture||gesture.type!=='pinch')return;
      const a=pts[0],b=pts[1];
      const currentDistance=Math.max(1,distance(a,b));
      const currentMid=midpoint(a,b);
      scale=clamp(gesture.startScale*(currentDistance/gesture.startDistance),MIN_SCALE,MAX_SCALE);
      offsetX=gesture.startX+(currentMid.x-gesture.startMid.x);
      offsetY=gesture.startY+(currentMid.y-gesture.startMid.y);
      applyTransform();
      event.preventDefault();
      return;
    }
    if(pts.length===1&&scale>1){
      if(!gesture||gesture.type!=='pan')beginGesture();
      if(!gesture||gesture.type!=='pan')return;
      const p=pts[0];
      offsetX=gesture.startX+(p.x-gesture.startPoint.x);
      offsetY=gesture.startY+(p.y-gesture.startPoint.y);
      applyTransform();
      event.preventDefault();
    }
  }

  function onPointerUp(event){
    const p=pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if(pointers.size)beginGesture();else gesture=null;

    if(!p)return;
    const now=Date.now();
    const closeTap=now-lastTapAt<330&&Math.hypot(p.x-lastTapX,p.y-lastTapY)<36;
    if(closeTap){
      setScale(scale>1.2?1:2.5);
      lastTapAt=0;
    }else{
      lastTapAt=now;lastTapX=p.x;lastTapY=p.y;
    }
  }

  function close(){
    if(!overlay)return;
    overlay.remove();
    overlay=null;
    zoomImage=null;
    viewport=null;
    pointers.clear();
    gesture=null;
    document.body.style.overflow=previousBodyOverflow;
  }

  function open(source){
    close();
    installStyle();
    previousBodyOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    scale=1;offsetX=0;offsetY=0;lastTapAt=0;

    overlay=document.createElement('div');
    overlay.id='am-reader-zoom-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-label','Pembesar halaman komik');
    overlay.innerHTML=`
      <div id="am-reader-zoom-toolbar">
        <button type="button" id="am-reader-zoom-close" aria-label="Tutup pembesar">Tutup</button>
        <div class="am-zoom-actions">
          <button type="button" id="am-reader-zoom-out" aria-label="Perkecil">−</button>
          <span id="am-reader-zoom-level" aria-live="polite">100%</span>
          <button type="button" id="am-reader-zoom-reset" aria-label="Kembalikan zoom ke seratus persen">Reset</button>
          <button type="button" id="am-reader-zoom-in" aria-label="Perbesar">+</button>
        </div>
      </div>
      <div id="am-reader-zoom-viewport">
        <img id="am-reader-zoom-image" alt="${String(source.alt||'Halaman komik diperbesar').replace(/"/g,'&quot;')}">
        <div id="am-reader-zoom-hint">Cubit 2 jari untuk zoom sampai 5× • geser saat diperbesar • ketuk 2× untuk zoom cepat</div>
      </div>`;
    document.body.appendChild(overlay);

    viewport=overlay.querySelector('#am-reader-zoom-viewport');
    zoomImage=overlay.querySelector('#am-reader-zoom-image');
    zoomImage.src=source.currentSrc||source.src;
    zoomImage.onload=applyTransform;

    overlay.querySelector('#am-reader-zoom-close').addEventListener('click',close);
    overlay.querySelector('#am-reader-zoom-out').addEventListener('click',()=>setScale(scale-0.5));
    overlay.querySelector('#am-reader-zoom-reset').addEventListener('click',()=>setScale(1));
    overlay.querySelector('#am-reader-zoom-in').addEventListener('click',()=>setScale(scale+0.5));
    viewport.addEventListener('pointerdown',onPointerDown);
    viewport.addEventListener('pointermove',onPointerMove,{passive:false});
    viewport.addEventListener('pointerup',onPointerUp);
    viewport.addEventListener('pointercancel',onPointerUp);
  }

  function decorateReader(){
    installStyle();
    const stack=document.querySelector('.comic-stack');
    if(!stack)return;
    if(!document.getElementById('am-reader-zoom-entry-hint')){
      const hint=document.createElement('div');
      hint.id='am-reader-zoom-entry-hint';
      hint.className='am-reader-zoom-entry-hint';
      hint.textContent='Ketuk halaman untuk membuka Zoom Reader • pinch 2 jari hingga 5×';
      stack.parentNode?.insertBefore(hint,stack);
    }
    stack.querySelectorAll('img.comic-page').forEach(img=>{
      if(img.dataset.amZoomReady==='1')return;
      img.dataset.amZoomReady='1';
      img.setAttribute('role','button');
      img.setAttribute('tabindex','0');
      img.setAttribute('aria-label',`${img.alt||'Halaman komik'} — buka pembesar`);
      img.addEventListener('click',()=>open(img));
      img.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){event.preventDefault();open(img)}
      });
    });
  }

  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&overlay)close();
  });

  const schedule=()=>requestAnimationFrame(decorateReader);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  schedule();
})();
