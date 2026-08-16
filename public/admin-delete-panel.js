(()=>{
  if(document.documentElement.dataset.amDistribution==='play')return;

  let attempts=0;
  function boot(){
    const panel=document.querySelector('#am-admin-panel');
    if(!panel){if(attempts++<120)setTimeout(boot,100);return;}
    if(panel.querySelector('#amaDeleteZone'))return;

    const shell=panel.querySelector('.ama-shell');
    const status=panel.querySelector('#amaStatus');
    const series=panel.querySelector('#amaSeries');
    const episode=panel.querySelector('#amaEpisode');
    if(!shell||!series||!episode){if(attempts++<120)setTimeout(boot,100);return;}

    const zone=document.createElement('div');
    zone.className='ama-card';
    zone.id='amaDeleteZone';
    zone.style.borderColor='#69363d';
    zone.innerHTML=`
      <b style="color:#ffaaa4">Hapus / Reset Upload</b>
      <div class="ama-note" style="margin-top:6px">Untuk buang asset yang salah lalu upload ulang. Catalog komik tetap ada; yang dihapus hanya file upload di storage.</div>
      <div class="ama-grid" style="margin-top:12px">
        <button class="ama-btn danger" id="amaDeleteEpisode">HAPUS EPISODE TERPILIH</button>
        <button class="ama-btn danger" id="amaDeleteSeries">HAPUS SELURUH KOMIK</button>
      </div>
      <div class="ama-note" style="margin-top:8px">Hapus seluruh komik = cover + semua episode asset pada series yang dipilih.</div>`;

    const statusCard=status?.closest('.ama-card');
    if(statusCard)shell.insertBefore(zone,statusCard);else shell.appendChild(zone);

    const adminKey=()=>sessionStorage.getItem('am_admin_key')||'';
    const currentSeries=()=>({id:series.value,title:series.options[series.selectedIndex]?.textContent||series.value});
    const setStatus=(html)=>{if(status)status.innerHTML=html;};

    async function remove(url,confirmation){
      const r=await fetch(url,{
        method:'DELETE',
        cache:'no-store',
        headers:{
          'x-am-studio-admin-key':adminKey(),
          'x-am-delete-confirmation':confirmation,
          'accept':'application/json'
        }
      });
      let data={};try{data=await r.json()}catch{}
      if(!r.ok||data.ok===false)throw new Error(data.error||`HTTP ${r.status}`);
      return data;
    }

    zone.querySelector('#amaDeleteEpisode').onclick=async()=>{
      if(!adminKey())return alert('Unlock Admin dulu.');
      const s=currentSeries(),ep=Number(episode.value);
      if(!s.id||!Number.isInteger(ep)||ep<1)return alert('Pilih komik dan episode yang benar.');
      const phrase=`HAPUS EPISODE ${ep}`;
      const typed=prompt(`${s.title}\n\nIni akan menghapus semua page + metadata Episode ${ep}.\nKetik persis: ${phrase}`,'');
      if(typed!==phrase)return;
      try{
        setStatus(`Menghapus ${s.title} • Episode ${ep}...`);
        const x=await remove(`/api/assets/series/${encodeURIComponent(s.id)}/episodes/${ep}`,`${s.id}:${ep}`);
        setStatus(`<span class="ama-ok">✓ EPISODE DIHAPUS</span>\n${s.title} • Episode ${ep}\n${x.deletedCount||0} file dihapus. Siap upload ulang.`);
        window.dispatchEvent(new Event('am-admin-assets-changed'));
      }catch(e){setStatus(`<span class="ama-bad">GAGAL HAPUS EPISODE</span>\n${String(e.message||e)}`);}
    };

    zone.querySelector('#amaDeleteSeries').onclick=async()=>{
      if(!adminKey())return alert('Unlock Admin dulu.');
      const s=currentSeries();
      if(!s.id)return alert('Pilih komik dulu.');
      const phrase=`HAPUS ${s.id.toUpperCase()}`;
      const typed=prompt(`${s.title}\n\nPERINGATAN: cover + SEMUA episode upload komik ini akan dihapus.\nKetik persis: ${phrase}`,'');
      if(typed!==phrase)return;
      try{
        setStatus(`Menghapus seluruh asset ${s.title}...`);
        const x=await remove(`/api/assets/series/${encodeURIComponent(s.id)}`,s.id);
        setStatus(`<span class="ama-ok">✓ KOMIK DI-RESET</span>\n${s.title}\n${x.deletedCount||0} file dihapus dari storage. Series tetap ada di catalog dan sekarang siap upload ulang dari Page 1.`);
        window.dispatchEvent(new Event('am-admin-assets-changed'));
      }catch(e){setStatus(`<span class="ama-bad">GAGAL RESET KOMIK</span>\n${String(e.message||e)}`);}
    };
  }

  boot();
})();
