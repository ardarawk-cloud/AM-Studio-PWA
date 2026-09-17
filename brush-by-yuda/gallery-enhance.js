(function(){
  const atlas=window.BY_GALLERY_ATLAS;
  if(!atlas)return;

  const items=[
    ['Payas Agung','Royal Purple',0],
    ['Payas Agung','Golden Detail',1],
    ['Bali Classic','Traditional Couple',2],
    ['Bali Classic','Heritage Beauty',3],
    ['Bali Modif','Modern Maroon',4],
    ['Bali Modif','Modern Lace',5],
    ['Casual','Soft Glam',6],
    ['Casual','Beach Beauty',7],
    ['Character','Blue Crystal',8],
    ['Character','Editorial Detail',9],
    ['Graduations','Formal Navy',10],
    ['Graduations','Formal Portrait',11],
    ['Others','Hair & Beauty',12],
    ['Casual','Event Glam',13]
  ];

  const cats=['All','Payas Agung','Bali Classic','Bali Modif','Casual','Character','Graduations','Others'];
  const style=document.createElement('style');
  style.textContent=`
    .byFullGallery{margin-top:72px;padding-top:48px;border-top:1px solid var(--line)}
    .byGalleryHead{display:grid;grid-template-columns:1fr .9fr;gap:28px;align-items:end;margin-bottom:26px}
    .byGalleryHead h3{margin:8px 0 0;font:500 clamp(40px,5vw,62px)/.92 var(--serif);letter-spacing:-.04em}
    .byGalleryHead p{margin:0;color:var(--muted);font-size:13px;line-height:1.7;max-width:520px}
    .byFilters{display:flex;gap:8px;overflow-x:auto;padding:0 0 18px;scrollbar-width:none}.byFilters::-webkit-scrollbar{display:none}
    .byFilter{flex:0 0 auto;border:1px solid var(--line);background:rgba(255,255,255,.28);color:#655d55;border-radius:999px;padding:10px 13px;font:700 9px/1 var(--sans);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .byFilter.active{background:var(--ink);color:#fff;border-color:var(--ink)}
    .byGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:24px 18px}
    .byCard{margin:0;min-width:0}
    .byShot{position:relative;width:100%;aspect-ratio:3/4;overflow:hidden;background:#ddd3ca;border-radius:2px;box-shadow:0 12px 30px rgba(44,31,20,.07)}
    .byShot img{position:absolute;display:block;max-width:none;width:400%;height:400%;object-fit:fill;user-select:none;pointer-events:none}
    .byCard figcaption{padding:11px 1px 0}.byCard small{display:block;font-size:8px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--gold)}.byCard strong{display:block;margin-top:4px;font:600 20px/.98 var(--serif)}
    @media(max-width:860px){.byGrid{grid-template-columns:repeat(3,minmax(0,1fr))}.byGalleryHead{grid-template-columns:1fr}}
    @media(max-width:680px){.byFullGallery{margin-top:52px;padding-top:38px}.byGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 12px}.byGalleryHead h3{font-size:42px}.byCard strong{font-size:18px}}
  `;
  document.head.appendChild(style);

  const old=document.querySelector('.byFullGallery');
  if(old)old.remove();

  const section=document.createElement('div');
  section.className='byFullGallery';
  section.innerHTML='<div class="byGalleryHead"><div><span class="eyebrow">Curated Gallery</span><h3>Beauty, in every expression.</h3></div><p>Selected work across Balinese ceremonial beauty, modern styling, soft glam, creative character looks and formal occasions.</p></div><div class="byFilters"></div><div class="byGrid"></div>';
  const host=document.querySelector('.portfolio .wrap')||document.querySelector('.portfolio')||document.body;
  host.appendChild(section);

  const filters=section.querySelector('.byFilters');
  const grid=section.querySelector('.byGrid');

  function render(cat){
    grid.innerHTML='';
    items.filter(function(x){return cat==='All'||x[0]===cat;}).forEach(function(item){
      const category=item[0],title=item[1],i=item[2];
      const col=i%4,row=Math.floor(i/4);
      const fig=document.createElement('figure');
      fig.className='byCard';
      fig.innerHTML='<div class="byShot"><img alt="'+category+' makeup by Brush by Yuda Christ" decoding="async"></div><figcaption><small>'+category+'</small><strong>'+title+'</strong></figcaption>';
      const img=fig.querySelector('img');
      img.src=atlas;
      img.style.left=(-col*100)+'%';
      img.style.top=(-row*100)+'%';
      grid.appendChild(fig);
    });
  }

  cats.forEach(function(cat,i){
    const b=document.createElement('button');
    b.className='byFilter'+(i===0?' active':'');
    b.type='button';
    b.textContent=cat;
    b.onclick=function(){
      filters.querySelectorAll('.byFilter').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      render(cat);
    };
    filters.appendChild(b);
  });

  render('All');
})();
