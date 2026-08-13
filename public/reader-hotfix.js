(()=>{
  const style=document.createElement('style');
  style.textContent=`
    .shell{padding-bottom:180px!important;scroll-padding-bottom:180px!important}
    .nav{z-index:9000!important}
    .grid,.episodes{padding-bottom:24px}
    .comic-stack{margin-bottom:28px}
    .comic-page{display:block;width:100%;height:auto;background:#05070b}
    .c-amu{background-image:linear-gradient(180deg,rgba(5,7,11,.02) 20%,rgba(5,7,11,.82) 100%),url('/media/comics/amu/cover.jpg')!important;background-position:center 28%!important;background-size:cover!important;background-repeat:no-repeat!important}
    @media(max-width:390px){.shell{padding-bottom:190px!important}}
  `;
  document.head.appendChild(style);

  document.addEventListener('click',e=>{
    const card=e.target.closest?.('[data-open]');
    if(card?.dataset?.open)sessionStorage.setItem('am_current_series',card.dataset.open);
  },true);
})();
