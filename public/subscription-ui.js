(()=>{
  if(window.__amSubscriptionUiV1)return;
  window.__amSubscriptionUiV1=true;
  if(document.documentElement.dataset.amDistribution!=='play')return;

  const state={plans:[],active:false,pending:false,expiryTime:'',basePlanId:'',error:''};
  let scheduled=false,refreshed=false;
  const bridge=()=>window.AmStudioBilling||null;
  const planLabel=id=>id==='yearly'?'TAHUNAN':'BULANAN';

  function formatExpiry(value){
    if(!value)return '';
    const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
    try{return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(d)}catch{return ''}
  }

  function installStyle(){
    if(document.getElementById('am-subscription-style'))return;
    const style=document.createElement('style');style.id='am-subscription-style';
    style.textContent='#amSubscriptionBox{margin-top:12px}#amSubscriptionBox .am-sub-head{display:flex;align-items:center;justify-content:space-between;gap:10px}#amSubscriptionBox .am-sub-status{font-size:12px;color:#aab4c3;margin-top:5px}#amSubscriptionBox .am-sub-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}#amSubscriptionBox .am-sub-btn{border:1px solid #344155;background:#121a26;color:#fff;border-radius:14px;padding:12px 9px;font:850 12px system-ui;min-height:48px}#amSubscriptionBox .am-sub-btn strong{display:block;font-size:13px}#amSubscriptionBox .am-sub-btn span{display:block;color:#aab4c3;font-size:10px;margin-top:2px}#amSubscriptionBox .am-sub-restore{margin-top:9px;width:100%;border:0;background:transparent;color:#aeb8c8;font:750 11px system-ui;padding:8px}#amSubscriptionBox .am-sub-active{color:#72e7ad;font-weight:900}#amSubscriptionBox .am-sub-error{color:#ff9d97}@media(max-width:380px){#amSubscriptionBox .am-sub-actions{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function ensureBox(){
    const root=document.getElementById('amNativePublicProfile');
    if(!root||document.getElementById('amSubscriptionBox')||!bridge())return;
    const box=document.createElement('div');box.className='box';box.id='amSubscriptionBox';root.appendChild(box);render();
  }

  function render(){
    const box=document.getElementById('amSubscriptionBox');if(!box)return;
    let status='Belum berlangganan',statusClass='am-sub-status';
    if(state.pending){status='Pembayaran sedang diproses';statusClass+=' am-sub-active'}
    else if(state.active){const exp=formatExpiry(state.expiryTime);status=exp?'Premium aktif sampai '+exp:'Premium aktif';statusClass+=' am-sub-active'}
    else if(state.error){status=state.error;statusClass+=' am-sub-error'}
    const plans=state.plans.map(p=>'<button class="am-sub-btn" type="button" data-am-subscribe="'+p.basePlanId+'"><strong>'+planLabel(p.basePlanId)+'</strong><span>'+(p.price||'')+'</span></button>').join('');
    box.innerHTML='<div class="am-sub-head"><b>Premium</b>'+(state.active?'<span class="pill">AKTIF</span>':'')+'</div><div class="'+statusClass+'">'+status+'</div>'+(!state.active&&plans?'<div class="am-sub-actions">'+plans+'</div>':'')+'<button class="am-sub-restore" type="button" id="amSubRestore">Pulihkan pembelian</button>';
    box.querySelectorAll('[data-am-subscribe]').forEach(btn=>{btn.onclick=()=>{state.error='';render();bridge()?.subscribe(btn.dataset.amSubscribe)}});
    box.querySelector('#amSubRestore')?.addEventListener('click',()=>{state.error='';render();bridge()?.restore()});
  }

  function onBilling(event){
    const d=event?.detail||{};
    if(d.type==='products'){state.plans=Array.isArray(d.plans)?d.plans:[];state.error=''}
    else if(d.type==='entitlement'){state.active=Boolean(d.active);state.pending=Boolean(d.pending);state.expiryTime=d.expiryTime||'';state.basePlanId=d.basePlanId||'';state.error=''}
    else if(d.type==='error'){state.error='Billing belum siap.'}
    schedule();
  }

  function run(){
    scheduled=false;installStyle();ensureBox();render();
    if(!refreshed&&bridge()){refreshed=true;try{bridge().refresh()}catch{}}
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(run)}
  addEventListener('am-billing-state',onBilling);addEventListener('pageshow',schedule);
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  schedule();
})();