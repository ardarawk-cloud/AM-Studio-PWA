(function(){
  const items=[
    ['Payas Agung','Royal Purple',6],
    ['Payas Agung','Golden Detail',7],
    ['Bali Classic','Traditional Couple',8],
    ['Bali Classic','Heritage Beauty',9],
    ['Bali Modif','Modern Maroon',10],
    ['Bali Modif','Modern Lace',11],
    ['Casual','Soft Glam',12],
    ['Casual','Beach Beauty',13],
    ['Character','Blue Crystal',14],
    ['Character','Editorial Detail',15],
    ['Graduations','Formal Navy',16],
    ['Graduations','Formal Portrait',17],
    ['Others','Hair & Beauty',18],
    ['Casual','Event Glam',19]
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
    const photoIndex=item[2];
    const source=window.BY_IMAGES&&window.BY_IMAGES[photoIndex];
    if(!source){
      console.error('Brush portfolio image missing',photoIndex);
      return;
    }

    const figure=document.createElement('figure');
    figure.className='work';
    figure.dataset.category=category;

    const frame=document.createElement('div');
    frame.className='photoFrame';
    frame.style.aspectRatio='3 / 4';

    const img=document.createElement('img');
    img.src=source;
    img.alt=category+' makeup by Brush by Yuda Christ';
    img.width=360;
    img.height=480;
    img.loading='lazy';
    img.decoding='async';
    img.style.width='100%';
    img.style.height='100%';
    img.style.objectFit='cover';
    img.style.display='block';

    const number=document.createElement('span');
    number.className='photoIndex';
    number.textContent=String(index+7).padStart(2,'0');

    const caption=document.createElement('figcaption');
    caption.innerHTML='<small>'+category+'</small><strong>'+title+'</strong><span>Original work by Brush by Yuda Christ.</span>';

    frame.appendChild(img);
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