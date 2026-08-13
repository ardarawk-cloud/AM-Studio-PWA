import base from './hotfix-runtime.js';

const MEDIA_PREFIX='/media/';
const UPLOAD_PATH='/api/assets/upload';
const LIST_PATH='/api/assets/list';
const ALLOWED_KEY=/^comics\/[a-z0-9-]+\/(?:cover\.(?:jpg|jpeg|png|webp|avif)|ep\d{3}\/page-\d{2}\.(?:jpg|jpeg|png|webp|avif))$/i;

function adminOK(request,env){
  const key=request.headers.get('x-am-studio-admin-key')||'';
  return Boolean(env?.AM_STUDIO_ADMIN_KEY&&key===env.AM_STUDIO_ADMIN_KEY);
}

function safeKey(value=''){
  let key='';
  try{key=decodeURIComponent(String(value))}catch{return null}
  if(key.includes('..')||key.includes('\\')||!ALLOWED_KEY.test(key))return null;
  return key;
}

async function uploadAsset(request,env){
  if(!adminOK(request,env))return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401});
  if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const url=new URL(request.url);
  const key=safeKey(url.searchParams.get('key')||'');
  if(!key)return Response.json({ok:false,error:'INVALID_ASSET_KEY'},{status:400});
  if(!request.body)return Response.json({ok:false,error:'EMPTY_ASSET_BODY'},{status:400});
  const type=request.headers.get('content-type')||'application/octet-stream';
  const length=Number(request.headers.get('content-length')||0);
  if(length>20*1024*1024)return Response.json({ok:false,error:'ASSET_TOO_LARGE',maxBytes:20*1024*1024},{status:413});
  await env.COMIC_ASSETS.put(key,request.body,{httpMetadata:{contentType:type,cacheControl:'public, max-age=31536000, immutable'},customMetadata:{source:'OWNER_UPLOAD',uploadedAt:new Date().toISOString()}});
  const head=await env.COMIC_ASSETS.head(key);
  return Response.json({ok:true,key,size:head?.size??length,contentType:head?.httpMetadata?.contentType||type,uploadedAt:new Date().toISOString()},{headers:{'cache-control':'no-store'}});
}

async function listAssets(request,env){
  if(!adminOK(request,env))return Response.json({ok:false,error:'ADMIN_AUTH_REQUIRED'},{status:401});
  if(!env?.COMIC_ASSETS)return Response.json({ok:false,error:'COMIC_ASSETS_NOT_CONFIGURED'},{status:503});
  const url=new URL(request.url);
  const prefix=String(url.searchParams.get('prefix')||'comics/amu/').replace(/^\/+/, '');
  if(prefix.includes('..')||!prefix.startsWith('comics/'))return Response.json({ok:false,error:'INVALID_PREFIX'},{status:400});
  const data=await env.COMIC_ASSETS.list({prefix,limit:1000});
  return Response.json({ok:true,prefix,count:data.objects.length,objects:data.objects.map(o=>({key:o.key,size:o.size,uploaded:o.uploaded?.toISOString?.()||null}))},{headers:{'cache-control':'no-store'}});
}

async function media(request,env,key){
  if(!env?.COMIC_ASSETS)return new Response('Comic storage unavailable',{status:503});
  const clean=safeKey(key);
  if(!clean)return new Response('Not found',{status:404});
  const obj=await env.COMIC_ASSETS.get(clean);
  if(!obj)return new Response('Not found',{status:404,headers:{'cache-control':'no-store'}});
  const h=new Headers();
  if(typeof obj.writeHttpMetadata==='function')obj.writeHttpMetadata(h);
  if(!h.get('content-type'))h.set('content-type','application/octet-stream');
  h.set('cache-control','public, max-age=31536000, immutable');
  if(obj.httpEtag)h.set('etag',obj.httpEtag);
  h.set('x-am-asset-source','R2_COMIC_ASSETS');
  return new Response(obj.body,{headers:h});
}

async function injectAssetUploader(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  const html=await response.text();
  const src='/asset-upload.js?v=20260813a';
  const marker=`<script src="${src}" defer></script>`;
  let out=html.replace(/<script src="\/asset-upload\.js\?v=[^"]+" defer><\/script>/g,'');
  out=out.includes('</body>')?out.replace('</body>',`${marker}</body>`):`${out}${marker}`;
  const h=new Headers(response.headers);h.set('cache-control','no-store');
  return new Response(out,{status:response.status,statusText:response.statusText,headers:h});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===UPLOAD_PATH&&request.method==='POST')return uploadAsset(request,env);
    if(url.pathname===LIST_PATH&&request.method==='GET')return listAssets(request,env);
    if(url.pathname.startsWith(MEDIA_PREFIX)&&request.method==='GET')return media(request,env,url.pathname.slice(MEDIA_PREFIX.length));
    const response=await base.fetch(request,env,ctx);
    return injectAssetUploader(response);
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};
