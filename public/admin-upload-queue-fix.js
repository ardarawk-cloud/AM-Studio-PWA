(()=>{
  let queued=[];
  const fingerprint=f=>`${f.name}|${f.size}|${f.lastModified}`;
  const sortFiles=arr=>[...arr].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
  function mergeFiles(input,newFiles){
    const map=new Map(queued.map(f=>[fingerprint(f),f]));
    for(const f of newFiles||[])map.set(fingerprint(f),f);
    queued=sortFiles([...map.values()]);
    try{
      const dt=new DataTransfer();
      queued.forEach(f=>dt.items.add(f));
      input.files=dt.files;
    }catch(e){
      console.warn('AM STUDIO queue: DataTransfer unavailable',e);
    }
    const picked=document.getElementById('amaPicked');
    const start=Number(document.getElementById('amaStart')?.value)||1;
    if(picked&&queued.length)picked.textContent=`${queued.length} file di antrean • akan menjadi Page ${start}–${start+queued.length-1} • boleh pilih file lagi`;
  }
  function attach(){
    const input=document.getElementById('amaPages');
    if(!input||input.dataset.amQueueFix==='1')return;
    input.dataset.amQueueFix='1';
    input.addEventListener('change',()=>{
      const selected=[...(input.files||[])];
      mergeFiles(input,selected);
    },true);
    const picked=document.getElementById('amaPicked');
    if(picked)picked.insertAdjacentHTML('afterend','<div class="ama-note" id="amaQueueHint" style="margin-top:6px;color:#72e7ad">Android fallback: jika multi-select gagal, pilih 1 file lalu buka Pilih File lagi. Antrean tidak hilang.</div><button class="ama-btn ghost" id="amaClearQueue" type="button" style="margin-top:8px">KOSONGKAN ANTREAN PAGE</button>');
    document.getElementById('amaClearQueue')?.addEventListener('click',()=>{
      queued=[];
      input.value='';
      if(picked)picked.textContent='Belum ada page dipilih.';
    });
    const status=document.getElementById('amaStatus');
    if(status){
      new MutationObserver(()=>{
        if(/SELESAI/i.test(status.textContent||'')){
          queued=[];
          input.value='';
        }
      }).observe(status,{childList:true,subtree:true,characterData:true});
    }
  }
  new MutationObserver(attach).observe(document.documentElement,{childList:true,subtree:true});
  attach();
})();
