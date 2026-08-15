(()=>{
  let queued=[];
  let busy=false;
  const fingerprint=f=>`${f.name}|${f.size}|${f.lastModified}`;
  const sortFiles=arr=>[...arr].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
  const $=id=>document.getElementById(id);
  const pad=(n,w=2)=>String(n).padStart(w,'0');
  function adminKey(){return sessionStorage.getItem('am_admin_key')||''}
  function updateUi(message=''){
    const picked=$('amaPicked'),start=Number($('amaStart')?.value)||1;
    if(picked){
      picked.textContent=queued.length
        ?`${queued.length} file di antrean • akan menjadi Page ${start}–${start+queued.length-1} • pilih 1 file lagi jika belum selesai`
        :(message||'Belum ada page dipilih.');
    }
  }
  function mergeFiles(newFiles){
    const map=new Map(queued.map(f=>[fingerprint(f),f]));
    for(const f of newFiles||[])map.set(fingerprint(f),f);
    queued=sortFiles([...map.values()]);
    updateUi();
  }
  async function json(url,opt={}){
    const r=await fetch(url,{cache:'no-store',...opt});let x={};try{x=await r.json()}catch{}
    if(!r.ok||x.ok===false)throw new Error(x.error||`HTTP ${r.status}`);return x;
  }
  async function sendFile(file,keyName){
    const key=adminKey();if(!key)throw new Error('ADMIN_KEY_BELUM_UNLOCK');
    return json('/api/assets/upload?key='+encodeURIComponent(keyName),{method:'POST',headers:{'x-am-studio-admin-key':key,'content-type':file.type||'image/jpeg'},body:file});
  }
  async function saveMeta(payload){
    const key=adminKey();if(!key)throw new Error('ADMIN_KEY_BELUM_UNLOCK');
    return json('/api/assets/meta',{method:'POST',headers:{'x-am-studio-admin-key':key,'content-type':'application/json'},body:JSON.stringify(payload)});
  }
  async function uploadQueue(ev){
    if(!queued.length||busy)return;
    ev.preventDefault();ev.stopImmediatePropagation();
    const series=$('amaSeries'),episode=$('amaEpisode'),total=$('amaTotal'),title=$('amaTitle'),start=$('amaStart'),cover=$('amaCover'),status=$('amaStatus'),bar=$('amaBar'),button=$('amaUpload');
    const seriesId=series?.value||'',seriesTitle=series?.selectedOptions?.[0]?.textContent||seriesId,ep=Number(episode?.value),first=Number(start?.value)||1,pageCount=Number(total?.value)||0,episodeTitle=title?.value?.trim()||`Episode ${pad(ep,3)}`;
    if(!adminKey())return alert('Unlock Admin dulu.');
    if(!seriesId||!ep)return alert('Pilih series dan episode.');
    if(!confirm(`Upload ${queued.length} page ke ${seriesTitle} • Episode ${ep}?`))return;
    busy=true;if(button)button.disabled=true;
    const coverFile=cover?.files?.[0]||null,totalSteps=queued.length+(coverFile?1:0)+1;let done=0;
    const tick=t=>{done++;if(bar)bar.style.width=Math.round(done/totalSteps*100)+'%';if(status)status.textContent=t};
    try{
      if(coverFile){await sendFile(coverFile,`comics/${seriesId}/cover.jpg`);tick('✓ Cover uploaded')}
      for(let i=0;i<queued.length;i++){
        const pageNo=first+i;
        await sendFile(queued[i],`comics/${seriesId}/ep${pad(ep,3)}/page-${pad(pageNo)}.jpg`);
        tick(`✓ Uploaded Page ${pageNo} (${i+1}/${queued.length})`);
      }
      const inferred=Math.max(pageCount,first+queued.length-1);
      await saveMeta({seriesId,episode:ep,title:episodeTitle,pageCount:inferred||undefined,ownerApproved:true});tick('✓ Metadata episode saved');
      if(status)status.innerHTML=`<span class="ama-ok">✓ SELESAI</span>\n${seriesTitle} • Episode ${pad(ep,3)}\n${queued.length} page berhasil diupload dari antrean APK lama.`;
      queued=[];if($('amaPages'))$('amaPages').value='';if(cover)cover.value='';updateUi();
    }catch(e){if(status)status.innerHTML=`<span class="ama-bad">GAGAL</span>\n${String(e.message||e)}`}
    finally{busy=false;if(button)button.disabled=false}
  }
  function attach(){
    const input=$('amaPages');if(!input||input.dataset.amQueueFix==='2')return;
    input.dataset.amQueueFix='2';
    const label=input.closest('div')?.querySelector('.ama-label');if(label)label.textContent='FILE PAGE — APK lama: pilih 1 file tiap kali';
    input.addEventListener('change',()=>{
      const selected=[...(input.files||[])];
      if(!selected.length){updateUi('Picker APK lama tidak mengembalikan file. Coba pilih SATU gambar saja, bukan banyak sekaligus.');return;}
      mergeFiles(selected);
      input.value='';
    },true);
    const picked=$('amaPicked');
    if(picked&&!$('amaQueueHint'))picked.insertAdjacentHTML('afterend','<div class="ama-note" id="amaQueueHint" style="margin-top:6px;color:#72e7ad">MODE APK LAMA: pilih SATU gambar → kembali → pilih lagi. Antrean akan naik 1, 2, 3… sampai selesai.</div><button class="ama-btn ghost" id="amaClearQueue" type="button" style="margin-top:8px">KOSONGKAN ANTREAN PAGE</button>');
    $('amaClearQueue')?.addEventListener('click',()=>{queued=[];input.value='';updateUi()});
    $('amaUpload')?.addEventListener('click',uploadQueue,true);
  }
  new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
  attach();
})();
