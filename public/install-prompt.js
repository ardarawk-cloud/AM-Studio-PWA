(()=>{
  if(window.__amInstallPromptV1)return;
  window.__amInstallPromptV1=true;

  const params=new URLSearchParams(location.search);
  const inApp=/AMStudioAndroid\//i.test(navigator.userAgent)||params.get('native')==='android';
  if(inApp)return;
  if(sessionStorage.getItem('am_install_prompt_seen')==='1')return;

  async function boot(){
    let cfg=null;
    try{
      const r=await fetch('/download-target.json?t='+Date.now(),{cache:'no-store'});
      if(r.ok)cfg=await r.json();
    }catch{}
    if(!cfg||String(cfg.mode||'').toUpperCase()!=='DIRECT_APK'||!cfg.directApkUrl)return;

    sessionStorage.setItem('am_install_prompt_seen','1');

    const style=document.createElement('style');
    style.id='am-install-prompt-style';
    style.textContent=`
      #amInstallPrompt{position:fixed;inset:0;z-index:2147483000;background:rgba(2,5,10,.82);backdrop-filter:blur(12px);display:grid;place-items:center;padding:18px}
      #amInstallPrompt .am-ip-card{position:relative;width:min(100%,420px);background:#0b111c;border:1px solid #2d394b;border-radius:24px;padding:22px;box-shadow:0 28px 90px rgba(0,0,0,.6);color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
      #amInstallPrompt .am-ip-x{position:absolute;right:12px;top:12px;width:36px;height:36px;border-radius:999px;border:1px solid #38465a;background:#121a27;color:#fff;font-size:22px}
      #amInstallPrompt h2{font-size:25px;margin:2px 42px 7px 0}
      #amInstallPrompt p{color:#aab5c5;line-height:1.5;font-size:13px;margin:0 0 16px}
      #amInstallPrompt .am-ip-badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
      #amInstallPrompt .am-ip-badges span{font-size:10px;font-weight:850;padding:6px 8px;border:1px solid #314156;border-radius:999px;color:#dbe3ee;background:#111927}
      #amInstallPrompt .am-ip-download{display:block;text-align:center;text-decoration:none;background:#fff;color:#090d13;border-radius:15px;padding:14px 16px;font-size:15px;font-weight:950}
      #amInstallPrompt .am-ip-note{margin-top:11px;color:#8491a4;font-size:10.5px;line-height:1.45}
    `;
    document.head.appendChild(style);

    const modal=document.createElement('div');
    modal.id='amInstallPrompt';
    modal.innerHTML=`
      <div class="am-ip-card" role="dialog" aria-modal="true" aria-label="Download AM STUDIO">
        <button class="am-ip-x" type="button" aria-label="Tutup">×</button>
        <h2>AM STUDIO untuk Android</h2>
        <p>Baca lebih nyaman lewat aplikasi resmi AM STUDIO.</p>
        <div class="am-ip-badges">
          <span>APK RESMI</span><span>RELEASE SIGNED</span><span>PUBLIC READER</span><span>PERMISSION MINIMAL</span>
        </div>
        <a class="am-ip-download" href="${String(cfg.directApkUrl).replace(/"/g,'&quot;')}">DOWNLOAD APK</a>
        <div class="am-ip-note">Karena APK didistribusikan langsung, Android dapat meminta izin “Install unknown apps” untuk browser yang dipakai. Itu adalah peringatan standar sideload, bukan berarti APK terdeteksi berbahaya.</div>
      </div>`;

    const close=()=>modal.remove();
    modal.querySelector('.am-ip-x').onclick=close;
    modal.addEventListener('click',e=>{if(e.target===modal)close()});
    document.body.appendChild(modal);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();