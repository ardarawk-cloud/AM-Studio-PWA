(()=>{
  const API='/api/meta';
  let panel=null;
  let currentPage=null;

  const css=`
  #am-page-control-launch{position:fixed;right:14px;bottom:82px;z-index:9998;border:1px solid #364154;background:#101722;color:#fff;border-radius:16px;padding:11px 13px;font:800 12px system-ui;box-shadow:0 12px 34px #0008}
  #am-page-control{position:fixed;inset:0;z-index:9999;background:#05070bf2;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:auto;display:none}
  #am-page-control.open{display:block}.amctl-shell{max-width:700px;margin:auto;padding:16px 16px 96px}.amctl-top{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:0;background:#05070bf2;backdrop-filter:blur(12px);padding:10px 0;z-index:3}.amctl-title b{display:block;font-size:18px}.amctl-title small{color:#98a2b3}.amctl-close,.amctl-btn{border:1px solid #2d3849;background:#111823;color:#fff;border-radius:12px;padding:10px 12px;font-weight:800}.amctl-btn{width:100%;text-align:left}.amctl-status,.amctl-card{border:1px solid #283142;background:#0e141d;border-radius:18px;padding:14px;margin:10px 0}.amctl-status.ok{border-color:#25533e}.amctl-status.bad{border-color:#653438}.amctl-grid{display:grid;gap:9px}.amctl-page{display:flex;justify-content:space-between;align-items:center;gap:10px}.amctl-page span{min-width:0}.amctl-page b,.amctl-page small{display:block}.amctl-page small,.amctl-muted{color:#98a2b3}.amctl-post{border-top:1px solid #263143;padding:13px 0}.amctl-post:first-child{border-top:0}.amctl-post p{white-space:pre-wrap;line-height:1.45;margin:8px 0;color:#d6dbe4}.amctl-meta{font-size:11px;color:#98a2b3;display:flex;gap:10px;flex-wrap:wrap}.amctl-back{margin-bottom:10px}.amctl-pill{display:inline-flex;border:1px solid #334155;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800}.amctl-lock{color:#f1c56b}.amctl-error{color:#ff9d97}.amctl-empty{padding:22px;text-align:center;color:#98a2b3}`;

  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);

  const launch=document.createElement('button');
  launch.id='am-page-control-launch';
  launch.textContent='META • PAGE CONTROL';
  document.body.appendChild(launch);

  panel=document.createElement('section');
  panel.id='am-page-control';
  panel.innerHTML=`<div class="amctl-shell"><div class="amctl-top"><div class="amctl-title"><b>AM STUDIO Page Control</b><small>ARDA ACC HUB • read/control monitor</small></div><button class="amctl-close">Tutup</button></div><div id="amctl-body"><div class="amctl-empty">Memuat controller…</div></div></div>`;
  document.body.appendChild(panel);

  const body=()=>panel.querySelector('#amctl-body');
  panel.querySelector('.amctl-close').onclick=()=>panel.classList.remove('open');
  launch.onclick=()=>{panel.classList.add('open');loadHome()};

  async function j(path){
    const r=await fetch(path,{cache:'no-store'});
    let x={};try{x=await r.json()}catch{}
    if(!r.ok||x.ok===false)throw new Error(x.metaError?.message||x.error||`HTTP ${r.status}`);
    return x;
  }

  function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

  async function loadHome(){
    currentPage=null;
    body().innerHTML='<div class="amctl-empty">Menghubungkan ARDA ACC HUB…</div>';
    try{
      const [status,pages]=await Promise.all([j(`${API}/status`),j(`${API}/pages`)]);
      const list=Array.isArray(pages.data)?pages.data:[];
      body().innerHTML=`<div class="amctl-status ${status.tokenConfigured?'ok':'bad'}"><b>${status.tokenConfigured?'● Controller ONLINE':'● Controller belum siap'}</b><div class="amctl-meta"><span>Graph ${esc(status.graphVersion)}</span><span>${esc(status.scope)}</span><span>${esc(status.mode)}</span></div><div class="amctl-meta amctl-lock">WRITE ACTIONS: ${esc(status.writeActions)}</div></div><div class="amctl-card"><b>Facebook Pages</b><div class="amctl-muted">${list.length} Page AM STUDIO terdeteksi</div><div class="amctl-grid" style="margin-top:12px">${list.length?list.map(p=>`<button class="amctl-btn amctl-page" data-page="${esc(p.id)}"><span><b>${esc(p.name)}</b><small>ID ${esc(p.id)}</small></span><span>›</span></button>`).join(''):'<div class="amctl-empty">Belum ada Page AM STUDIO.</div>'}</div></div>`;
      body().querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>loadPage(b.dataset.page,list.find(x=>x.id===b.dataset.page)));
    }catch(e){body().innerHTML=`<div class="amctl-status bad"><b>Controller error</b><p class="amctl-error">${esc(e.message)}</p><button class="amctl-btn" id="amctl-retry">Coba lagi</button></div>`;body().querySelector('#amctl-retry').onclick=loadHome}
  }

  async function loadPage(id,page){
    currentPage=page||{id,name:'AM STUDIO'};
    body().innerHTML=`<button class="amctl-btn amctl-back" id="amctl-back">‹ Semua Page</button><div class="amctl-card"><b>${esc(currentPage.name)}</b><div class="amctl-muted">Mengambil post & engagement…</div></div>`;
    body().querySelector('#amctl-back').onclick=loadHome;
    try{
      const x=await j(`${API}/pages/${encodeURIComponent(id)}/engagement?limit=10`);
      const posts=Array.isArray(x.data?.data)?x.data.data:[];
      body().innerHTML=`<button class="amctl-btn amctl-back" id="amctl-back">‹ Semua Page</button><div class="amctl-card"><div class="amctl-page"><span><b>${esc(x.page?.name||currentPage.name)}</b><small>ID ${esc(id)}</small></span><span class="amctl-pill">${posts.length} post</span></div><div class="amctl-muted" style="margin-top:8px">Monitoring konten & engagement. Edit/hapus/publish dari panel ini masih dikunci.</div></div><div class="amctl-card">${posts.length?posts.map(post=>{const reactions=post.reactions?.summary?.total_count??0;const comments=post.comments?.summary?.total_count??0;return `<article class="amctl-post"><div class="amctl-meta"><span>${esc(post.created_time||'')}</span><span>♥ ${reactions}</span><span>💬 ${comments}</span></div><p>${esc(post.message||'(post tanpa teks)')}</p>${post.permalink_url?`<a class="amctl-pill" href="${esc(post.permalink_url)}" target="_blank" rel="noopener">Buka Facebook ↗</a>`:''}</article>`}).join(''):'<div class="amctl-empty">Belum ada post yang terbaca.</div>'}</div>`;
      body().querySelector('#amctl-back').onclick=loadHome;
    }catch(e){body().innerHTML=`<button class="amctl-btn amctl-back" id="amctl-back">‹ Semua Page</button><div class="amctl-status bad"><b>Gagal membaca Page</b><p class="amctl-error">${esc(e.message)}</p></div>`;body().querySelector('#amctl-back').onclick=loadHome}
  }
})();
