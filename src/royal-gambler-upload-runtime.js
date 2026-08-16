import base from './play-firewall-runtime.js';

const UPLOAD_TOKEN='aQ31gfD6kY1R0RBnEScCReNi7BPeWZi7RC82WpbqfvI';
const ROUTE='/api/internal/royal-gambler-upload';
const PART_COUNTS={1:1,2:2,3:1,4:1,5:1,6:2,7:2,8:2,9:2,10:1,11:2,12:1};

function authorized(request,url){
  return request.headers.get('x-rg-upload-token')===UPLOAD_TOKEN||url.searchParams.get('token')===UPLOAD_TOKEN;
}
function unauthorized(){
  return Response.json({ok:false,error:'UPLOAD_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}});
}
function decodeBase64(value=''){
  const binary=atob(value);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return bytes;
}
async function importPageFromAssets(request,env,page){
  const count=PART_COUNTS[page];
  if(!count)throw new Error(`UNKNOWN_PAGE_${page}`);
  let encoded='';
  for(let part=0;part<count;part++){
    const path=`/rg-upload-staging/page-${String(page).padStart(2,'0')}/part-${String(part).padStart(2,'0')}.txt`;
    const u=new URL(path,request.url);
    const r=await env.ASSETS.fetch(new Request(u.toString()));
    if(!r.ok)throw new Error(`STAGING_PART_MISSING:${path}:${r.status}`);
    encoded+=(await r.text()).trim();
  }
  const bytes=decodeBase64(encoded);
  const key=`comics/royal-gambler/ep001/page-${String(page).padStart(2,'0')}.webp`;
  await env.COMIC_ASSETS.put(key,bytes,{
    httpMetadata:{contentType:'image/webp',cacheControl:'public, max-age=86400'},
    customMetadata:{source:'OWNER_UPLOAD_2026_08_17',page:String(page),seriesId:'royal-gambler'}
  });
  return {page,key,size:bytes.byteLength};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===ROUTE&&!authorized(request,url))return unauthorized();

    if(url.pathname===ROUTE&&request.method==='POST'){
      if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_STORAGE_NOT_BOUND'},{status:503});
      const form=await request.formData();
      const page=Number(form.get('page'));
      const file=form.get('file');
      if(!Number.isInteger(page)||page<1||page>12||!(file instanceof File)){
        return Response.json({ok:false,error:'INVALID_UPLOAD_PAYLOAD'},{status:400});
      }
      const ext=(String(file.type||'image/png').includes('webp')?'webp':String(file.type||'').includes('jpeg')?'jpg':'png');
      const key=`comics/royal-gambler/ep001/page-${String(page).padStart(2,'0')}.${ext}`;
      const bytes=await file.arrayBuffer();
      await env.COMIC_ASSETS.put(key,bytes,{
        httpMetadata:{contentType:file.type||'application/octet-stream',cacheControl:'public, max-age=86400'},
        customMetadata:{source:'OWNER_UPLOAD_2026_08_17',page:String(page),seriesId:'royal-gambler'}
      });
      return Response.json({ok:true,page,key,size:bytes.byteLength,contentType:file.type||null},{headers:{'cache-control':'no-store'}});
    }

    if(url.pathname===ROUTE&&request.method==='GET'&&url.searchParams.get('action')==='import'){
      if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_STORAGE_NOT_BOUND'},{status:503});
      try{
        const requested=url.searchParams.get('page');
        const pages=requested&&requested!=='all'?[Number(requested)]:Array.from({length:12},(_,i)=>i+1);
        const results=[];
        for(const page of pages)results.push(await importPageFromAssets(request,env,page));
        return Response.json({ok:true,imported:results},{headers:{'cache-control':'no-store'}});
      }catch(error){
        return Response.json({ok:false,error:String(error?.message||error)},{status:500,headers:{'cache-control':'no-store'}});
      }
    }

    if(url.pathname===ROUTE&&request.method==='GET'){
      const objects=[];
      let cursor;
      do{
        const r=await env.COMIC_ASSETS.list({prefix:'comics/royal-gambler/ep001/',limit:1000,cursor});
        objects.push(...r.objects.map(o=>({key:o.key,size:o.size,etag:o.etag})));
        cursor=r.truncated?r.cursor:undefined;
      }while(cursor);
      return Response.json({ok:true,objects},{headers:{'cache-control':'no-store'}});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};
