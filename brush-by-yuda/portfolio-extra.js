(function(){
  const current=document.currentScript&&document.currentScript.src?document.currentScript.src:'';
  const base=current?current.slice(0,current.lastIndexOf('/')+1):'';
  const atlas=base+'gallery-atlas.jpg';

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
  const categories=['All','Payas Agung','Bali Classic','Bali Modif','Casual','Character','Graduations','Others'];

  const gallery=document.querySelector('.portfolio .gallery');
  const categoryRow=document.querySelector('.portfolio .categoryRow');
  if(!gallery||!categoryRow)return;

  gallery.querySelectorAll('.work').forEach(function(card){
    card.dataset.category='Featured';
  });

  items.forEach(function(item,index){
    const category=item[0];
    const title=item[1];
    const sourceIndex=item[2];
    const col=sourceIndex%4;
    const row=Math.floor(sourceIndex/4);

    const figure=document.createElement('figure');
    figure.className='work';
    figure.dataset.category=category;

    const frame=document.createElement('div');
    frame.className='photoFrame';
    frame.style.aspectRatio='3 / 4';
    frame.style.overflow='hidden';
    frame.style.position='relative';

    const photo=document.createElement('img');
    photo.src=atlas;
    photo.alt=category+' makeup by Brush by Yuda Christ';
    photo.decoding='async';
    photo.loading='lazy';
    photo.style.position='absolute';
    photo.style.maxWidth='none';
    photo.style.width='400%';
    photo.style.height='400%';
    photo.style.left=(-col*100)+'%';
    photo.style.top=(-row*100)+'%';
    photo.style.objectFit='fill';

    const number=document.createElement('span');
    number.className='photoIndex';
    number.textContent=String(index+7).padStart(2,'0');

    const caption=document.createElement('figcaption');
    caption.innerHTML='<small>'+category+'</small><strong>'+title+'</strong><span>Original work by Brush by Yuda Christ.</span>';

    frame.appendChild(photo);
    frame.appendChild(number);
    figure.appendChild(frame);
    figure.appendChild(caption);
    gallery.appendChild(figure);
  });

  categoryRow.innerHTML='';
  categories.forEach(function(category,index){
    const button=document.createElement('button');
    button.type='button';
    button.className='pill';
    button.textContent=category;
    button.style.cursor='pointer';
    if(index===0){
      button.style.background='var(--ink)';
      button.style.color='#fff';
    }
    button.addEventListener('click',function(){
      categoryRow.querySelectorAll('.pill').forEach(function(item){
        item.style.background='rgba(255,255,255,.22)';
        item.style.color='#655d55';
      });
      button.style.background='var(--ink)';
      button.style.color='#fff';
      gallery.querySelectorAll('.work').forEach(function(card){
        card.style.display=category==='All'||card.dataset.category===category?'':'none';
      });
    });
    categoryRow.appendChild(button);
  });
})();