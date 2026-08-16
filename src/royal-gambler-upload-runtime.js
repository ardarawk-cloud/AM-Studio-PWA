import base from './play-firewall-runtime.js';

const UPLOAD_TOKEN='aQ31gfD6kY1R0RBnEScCReNi7BPeWZi7RC82WpbqfvI';
const ROUTE='/api/internal/royal-gambler-upload';
const PAGE_ID='1280688068454987';
const GRAPH='v26.0';

function authorized(request,url){return request.headers.get('x-rg-upload-token')===UPLOAD_TOKEN||url.searchParams.get('token')===UPLOAD_TOKEN}
function unauthorized(){return Response.json({ok:false,error:'UPLOAD_AUTH_REQUIRED'},{status:401,headers:{'cache-control':'no-store'}})}
function metaToken(env){return env?.META_PAGE_ACCESS_TOKEN||env?.META_SYSTEM_USER_TOKEN||''}
async function graphPosts(env){
  const token=metaToken(env);if(!token)throw new Error('META_TOKEN_NOT_CONFIGURED');
  const u=new URL(`https://graph.facebook.com/${GRAPH}/${PAGE_ID}/posts`);
  u.searchParams.set('fields','id,message,created_time,permalink_url,full_picture,attachments{media_type,title,url}');
  u.searchParams.set('limit','100');u.searchParams.set('access_token',token);
  const r=await fetch(u);const d=await r.json();if(!r.ok||d?.error)throw new Error(d?.error?.message||`META_${r.status}`);
  return Array.isArray(d?.data)?d.data:[];
}
function pageFromMessage(message=''){
  const s=String(message);let m=s.match(/(?:halaman|page)\s*[-:#.]?\s*0*(\d{1,2})\b/i);if(m)return Number(m[1]);
  m=s.match(/issue\s*#?\s*1[^\n]{0,80}(?:halaman|page)\s*[-:#.]?\s*0*(\d{1,2})\b/i);return m?Number(m[1]):null;
}
async function scanMeta(env){
  const posts=await graphPosts(env);
  return posts.map(p=>({id:p.id,created_time:p.created_time||null,page:pageFromMessage(p.message),message:String(p.message||'').slice(0,500),full_picture:p.full_picture||null,permalink_url:p.permalink_url||null,attachments:p.attachments?.data||[]}));
}
async function importMeta(env){
  if(!env?.COMIC_ASSETS)throw new Error('COMIC_STORAGE_NOT_BOUND');
  const posts=await graphPosts(env);const byPage=new Map();
  for(const p of posts){const n=pageFromMessage(p.message);if(n>=1&&n<=12&&p.full_picture&&!byPage.has(n))byPage.set(n,p)}
  const missing=[];for(let n=1;n<=12;n++)if(!byPage.has(n))missing.push(n);
  if(missing.length)throw new Error(`META_PAGE_IMAGES_MISSING:${missing.join(',')}`);
  const out=[];
  for(let n=1;n<=12;n++){
    const p=byPage.get(n);const r=await fetch(p.full_picture);if(!r.ok)throw new Error(`IMAGE_FETCH_${n}_${r.status}`);
    const bytes=await r.arrayBuffer(),ct=r.headers.get('content-type')||'image/jpeg',ext=ct.includes('png')?'png':ct.includes('webp')?'webp':'jpg';
    const key=`comics/royal-gambler/ep001/page-${String(n).padStart(2,'0')}.${ext}`;
    await env.COMIC_ASSETS.put(key,bytes,{httpMetadata:{contentType:ct,cacheControl:'public, max-age=86400'},customMetadata:{source:'ROYAL_GAMBLER_FB_OWNER_PUBLICATION_RECOVERY',page:String(n),postId:p.id}});
    out.push({page:n,key,size:bytes.byteLength,postId:p.id});
  }
  return out;
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);if(url.pathname===ROUTE&&!authorized(request,url))return unauthorized();
    if(url.pathname===ROUTE&&request.method==='GET'&&url.searchParams.get('action')==='meta-scan'){
      try{return Response.json({ok:true,posts:await scanMeta(env)},{headers:{'cache-control':'no-store'}})}catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:500})}
    }
    if(url.pathname===ROUTE&&request.method==='GET'&&url.searchParams.get('action')==='meta-import'){
      try{return Response.json({ok:true,imported:await importMeta(env)},{headers:{'cache-control':'no-store'}})}catch(e){return Response.json({ok:false,error:String(e?.message||e)},{status:500})}
    }
    if(url.pathname===ROUTE&&request.method==='GET'){
      const objects=[];let cursor;do{const r=await env.COMIC_ASSETS.list({prefix:'comics/royal-gambler/ep001/',limit:1000,cursor});objects.push(...r.objects.map(o=>({key:o.key,size:o.size,etag:o.etag})));cursor=r.truncated?r.cursor:undefined}while(cursor);
      return Response.json({ok:true,objects},{headers:{'cache-control':'no-store'}});
    }
    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){if(base.scheduled)return base.scheduled(controller,env,ctx)}
};
