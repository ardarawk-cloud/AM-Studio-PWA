import base from './play-firewall-runtime.js';

const UPLOAD_TOKEN='aQ31gfD6kY1R0RBnEScCReNi7BPeWZi7RC82WpbqfvI';
const ROUTE='/api/internal/royal-gambler-upload';

function unauthorized(){
  return Response.json({ok:false,error:'UPLOAD_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}});
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===ROUTE&&request.method==='POST'){
      if(request.headers.get('x-rg-upload-token')!==UPLOAD_TOKEN)return unauthorized();
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
    if(url.pathname===ROUTE&&request.method==='GET'){
      if(request.headers.get('x-rg-upload-token')!==UPLOAD_TOKEN)return unauthorized();
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
