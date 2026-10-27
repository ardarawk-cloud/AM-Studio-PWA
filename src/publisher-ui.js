import {randomBytes} from 'node:crypto';

function publicationApp(){
  const id=new URLSearchParams(location.search).get('id')||'',output=document.getElementById('status'),files=document.getElementById('files'),process=document.getElementById('process'),list=document.getElementById('assets'),reader=document.getElementById('reader');
  let release=null,busy=false;
  const api=async(path,options={})=>{const response=await fetch(path,{cache:'no-store',...options});const data=await response.json();if(!response.ok)throw new Error(data.error||'Permintaan belum berhasil.');return data};
  function draw(data){
    release=data;output.textContent=data.status==='PUBLISHED'?'TERBIT · '+data.title:data.status==='FAILED'?'Belum terbit: '+data.error:data.title+' · '+data.status;
    document.getElementById('destination').textContent=data.comic_id+' · '+(data.episode?'Episode '+data.episode:'Cover');
    list.replaceChildren();for(const a of data.assets||[]){const item=document.createElement('li');item.textContent=(a.label||a.kind)+(data.status==='PUBLISHED'?' — terverifikasi':a.ready?' — siap':' — menunggu file asli');list.append(item)}
    if(data.status==='PUBLISHED'){files.disabled=true;process.disabled=true;reader.href=data.reader_url;reader.hidden=false;reader.textContent='Lihat di katalog'}
  }
  async function refresh(){draw(await api('/api/publisher/releases/'+encodeURIComponent(id)))}
  files.onchange=async()=>{
    if(busy||!release)return;busy=true;process.disabled=true;
    try{
      for(const file of files.files){
        output.textContent='Memeriksa file asli…';
        const bytes=await file.arrayBuffer(),sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
        const asset=release.assets.find(a=>a.sha256===sha&&a.size===file.size);
        if(!asset)throw new Error('File ini tidak cocok dengan paket penerbitan yang disetujui.');
        output.textContent='Mengunggah '+asset.label+'…';
        await api('/api/publisher/uploads/'+encodeURIComponent(id)+'/'+asset.index,{method:'POST',headers:{'content-type':'application/octet-stream'},body:file});
      }
      await refresh();
    }catch(error){output.textContent=error.message}finally{busy=false;process.disabled=release?.status==='PUBLISHED'}
  };
  process.onclick=async()=>{
    if(busy)return;busy=true;process.disabled=true;files.disabled=true;
    try{
      for(let count=0;count<260;count++){
        const data=await api('/api/publisher/process/'+encodeURIComponent(id),{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
        if(data.status==='PUBLISHED'){draw(data);return}
        output.textContent='Memverifikasi penerbitan… '+(data.next_asset||0)+' / '+(data.total_assets||'?');
        if(data.retry_after){output.textContent='Proses masih berjalan. Periksa kembali sesaat lagi.';return}
      }
      output.textContent='Paket belum selesai. Tekan proses untuk melanjutkan.';
    }catch(error){output.textContent='BELUM TERBIT · '+error.message}finally{busy=false;process.disabled=release?.status==='PUBLISHED';files.disabled=release?.status==='PUBLISHED'}
  };
  if(!id){output.textContent='Buka halaman ini dari paket penerbitan yang sudah disiapkan.';files.disabled=true;process.disabled=true}else refresh().catch(error=>{output.textContent=error.message;files.disabled=true;process.disabled=true});
}

export function publicationDocument(){
  const nonce=randomBytes(16).toString('base64');
  const script='(()=>{const __name=(value)=>value;('+publicationApp.toString()+')();})();';
  return new Response('<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Penerbitan · AM STUDIO</title><style nonce="'+nonce+'">:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#07090d;color:#fafafa;font:16px/1.6 system-ui}main{max-width:650px;margin:auto;padding:28px 20px}a{color:#efbd60}h1{line-height:1.15;font-size:36px}.card{background:#11151d;border:1px solid #344055;border-radius:18px;padding:24px;margin:22px 0}button,.upload{display:block;width:100%;border:0;border-radius:12px;background:#d92d38;color:#fff;text-align:center;padding:15px;font:700 16px system-ui;cursor:pointer;margin:16px 0}input{max-width:100%}button:disabled{opacity:.5}#status{white-space:pre-wrap}small{color:#adb7c8}li{margin:8px 0}</style></head><body><main><a href="/">AM STUDIO Comics</a><h1>Penerbitan komik.</h1><p id="destination"></p><div class="card"><p id="status" role="status" aria-live="polite">Memeriksa paket…</p><ul id="assets"></ul><label class="upload" for="files">Unggah file asli</label><input id="files" type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif"><button id="process">Proses publikasi</button><a id="reader" hidden>Lihat di katalog</a></div><small>File dipertahankan dalam bentuk aslinya. Status TERBIT diberikan setelah aset, katalog, dan reader terverifikasi.</small></main><script nonce="'+nonce+'">'+script+'</script></body></html>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store, private','content-security-policy':"default-src 'self'; script-src 'nonce-"+nonce+"'; style-src 'nonce-"+nonce+"'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'x-content-type-options':'nosniff'}});
}

function ownerPreviewApp(){
  fetch('/api/membership',{cache:'no-store'}).then(r=>r.json()).then(config=>{
    const cutoff=config.preview?.free_through_episode;if(!Number.isInteger(cutoff))return;
    const input=document.getElementById('episode');if(!input)return;
    const note=document.createElement('p');note.id='catalog-preview-policy';note.style.cssText='color:#e4b955;font:13px/1.6 system-ui';
    const update=()=>{note.textContent=Number(input.value)<=cutoff?'Episode ini gratis untuk semua pembaca. Preview tersedia sampai episode '+cutoff+'.':'Episode ini tersedia untuk member aktif. Preview gratis sampai episode '+cutoff+'.'};
    input.closest('.row')?.after(note);input.addEventListener('input',update);update();
  }).catch(()=>{});
}
export const ownerPreviewClient='(()=>{const __name=(value)=>value;('+ownerPreviewApp.toString()+')();})();';
