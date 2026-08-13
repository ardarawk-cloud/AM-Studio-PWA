(()=>{
  const css=`
  #am-asset-upload-launch{position:fixed;left:14px;bottom:82px;z-index:9997;border:1px solid #364154;background:#101722;color:#fff;border-radius:16px;padding:11px 13px;font:800 12px system-ui;box-shadow:0 12px 34px #0008}
  #am-asset-upload{position:fixed;inset:0;z-index:10001;background:#05070bf5;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif;overflow:auto;display:none}
  #am-asset-upload.open{display:block}.amau-shell{max-width:700px;margin:auto;padding:16px 16px 110px}.amau-top{display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#05070bf2;padding:10px 0;z-index:3}.amau-card{border:1px solid #283142;background:#0e141d;border-radius:18px;padding:14px;margin:10px 0}.amau-btn,.amau-input{width:100%;border:1px solid #334155;background:#111823;color:#fff;border-radius:12px;padding:12px;font:inherit}.amau-btn{font-weight:850}.amau-close{width:auto}.amau-label{display:block;font-size:12px;font-weight:800;margin:12px 0 7px}.amau-muted{color:#98a2b3;font-size:12px;line-height:1.5}.amau-ok{color:#72e7ad}.amau-bad{color:#ff9d97}.amau-progress{white-space:pre-wrap;font-size:12px;line-height:1.55;color:#d6dbe4}.amau-bar{height:8px;background:#1d2735;border-radius:999px;overflow:hidden;margin:10px 0}.amau-bar>i{display:block;height:100%;width:0;background:#72e7ad;transition:width .2s}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const launch=document.createElement('button');launch.id='am-asset-upload-launch';launch.textContent='COMIC • ASSET UPLOAD';document.body.appendChild(launch);
  const panel=document.createElement('section');panel.id='am-asset-upload';panel.innerHTML=`<div class="amau-shell"><div class="amau-top"><div><b>AMU Reader Asset Upload</b><div class="amau-muted">R2 • Original image pipeline</div></div><button class="amau-btn amau-close" id="amauClose">Tutup</button></div><div class="amau-card"><b>Episode 001 — The Last Normal Day</b><p class="amau-muted">Cover dipisahkan dari episode. Pilih Cover resmi di kolom pertama, lalu 16 Page di kolom kedua. Page akan diurutkan otomatis berdasarkan nama file.</p><label class="amau-label">COVER — gambar cover pilihan Arda</label><input class="amau-input" id="amauCover" type="file" accept="image/jpeg,image/png,image/webp,image/avif"><label class="amau-label">PAGE 1–16 — pilih semua 16 sekaligus</label><input class="amau-input" id="amauPages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif"><div class="amau-muted" id="amauPicked" style="margin-top:9px">Belum ada file dipilih.</div><button class="amau-btn" id="amauUpload" style="margin-top:14px">UPLOAD COVER + 16 PAGE KE READER</button></div><div class="amau-card" id="amauState"><div class="amau-muted">Belum mulai.</div></div></div>`;document.body.appendChild(panel);
  const $=s=>panel.querySelector(s),cover=$('#amauCover'),pages=$('#amauPages'),picked=$('#amauPicked'),state=$('#amauState'),upload=$('#amauUpload');
  $('#amauClose').onclick=()=>panel.classList.remove('open');launch.onclick=()=>panel.classList.add('open');
  function sortedPages(){return [...(pages.files||[])].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}))}
  function refreshPicked(){const p=sortedPages();picked.textContent=`Cover: ${cover.files?.[0]?.name||'belum dipilih'} • Pages: ${p.length}/16${p.length?` • ${p[0].name} → ${p[p.length-1].name}`:''}`}
  cover.onchange=refreshPicked;pages.onchange=refreshPicked;
  async function send(file,key){
    const adminKey=sessionStorage.getItem('am_admin_key')||'';
    if(!adminKey)throw new Error('ADMIN_KEY_BELUM_UNLOCK — buka META • PAGE CONTROL lalu Unlock Admin.');
    const r=await fetch('/api/assets/upload?key='+encodeURIComponent(key),{method:'POST',headers:{'x-am-studio-admin-key':adminKey,'content-type':file.type||'image/jpeg'},body:file});
    let x={};try{x=await r.json()}catch{}
    if(!r.ok||x.ok===false)throw new Error(x.error||`HTTP ${r.status}`);
    return x;
  }
  async function verify(){
    const adminKey=sessionStorage.getItem('am_admin_key')||'';
    const r=await fetch('/api/assets/list?prefix='+encodeURIComponent('comics/amu/'),{cache:'no-store',headers:{'x-am-studio-admin-key':adminKey}});let x={};try{x=await r.json()}catch{};return x;
  }
  upload.onclick=async()=>{
    const c=cover.files?.[0],p=sortedPages();
    if(!c)return alert('Pilih COVER dulu.');
    if(p.length!==16)return alert(`Page harus tepat 16 file. Sekarang terpilih ${p.length}.`);
    if(!confirm('Upload Cover + Page 1–16 ke AM STUDIO Reader sekarang?'))return;
    upload.disabled=true;cover.disabled=true;pages.disabled=true;
    state.innerHTML='<div class="amau-progress" id="amauLog">Menyiapkan upload…</div><div class="amau-bar"><i id="amauBar"></i></div>';
    const log=$('#amauLog'),bar=$('#amauBar');let done=0;const total=17;
    const tick=(text)=>{done++;bar.style.width=`${Math.round(done/total*100)}%`;log.textContent=text};
    try{
      await send(c,'comics/amu/cover.jpg');tick(`✓ Cover\n0/16 page`);
      for(let i=0;i<p.length;i++){
        const n=String(i+1).padStart(2,'0');
        await send(p[i],`comics/amu/ep001/page-${n}.jpg`);
        tick(`✓ Cover\n✓ Page 1–${i+1}/16\nUploading ${i<15?'next page…':'verification…'}`);
      }
      const v=await verify();
      const required=['comics/amu/cover.jpg',...Array.from({length:16},(_,i)=>`comics/amu/ep001/page-${String(i+1).padStart(2,'0')}.jpg`)];
      const have=new Set((v.objects||[]).map(x=>x.key)),missing=required.filter(k=>!have.has(k));
      if(missing.length)throw new Error(`UPLOAD_INCOMPLETE: ${missing.length} asset belum terdeteksi.`);
      state.innerHTML=`<b class="amau-ok">✓ READER ASSET COMPLETE</b><p class="amau-muted">Cover + Page 1–16 sudah tersimpan di R2. Tutup panel lalu refresh Library → Arda Moron Universe → Episode 1.</p>`;
    }catch(e){state.innerHTML=`<b class="amau-bad">UPLOAD GAGAL</b><p class="amau-progress">${String(e.message||e)}</p><p class="amau-muted">File yang sudah berhasil masuk tidak dihapus. Jalankan lagi setelah masalah diperbaiki.</p>`}
    finally{upload.disabled=false;cover.disabled=false;pages.disabled=false}
  };
})();
