(()=>{
  if(window.__amCoverAssetsV1)return;
  window.__amCoverAssetsV1=true;
  function apply(){
    document.querySelectorAll('.card[data-open],.card[data-series],article[data-open],article[data-series]').forEach(card=>{
      const id=card.dataset.open||card.dataset.series;
      const cover=card.querySelector('.cover');
      if(!id||!cover||cover.dataset.amR2Cover==='1')return;
      cover.dataset.amR2Cover='1';
      cover.style.backgroundImage=`linear-gradient(180deg,rgba(5,7,11,.02) 28%,rgba(5,7,11,.88) 100%),url('/media/comics/${encodeURIComponent(id)}/cover.jpg')`;
      cover.style.backgroundSize='cover';
      cover.style.backgroundPosition='center';
      cover.style.backgroundRepeat='no-repeat';
    });
  }
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  schedule();
})();