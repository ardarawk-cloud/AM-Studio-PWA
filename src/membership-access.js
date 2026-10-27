import {MemberError,iso,memberActive,optionalMember,json,equal,auditStatement} from './membership-auth.js';
import {mergeRegisteredCatalog} from './publisher-registry.js';

export function assetIdentity(path) {
  let p;try{p=decodeURIComponent(path)}catch{throw new MemberError('INVALID_ASSET_PATH',400)}
  if(p.includes('\\')||p.includes('\0')||p.split('/').includes('..')||/%[0-9a-f]{2}/i.test(p))throw new MemberError('INVALID_ASSET_PATH',400);
  const m=p.match(/^\/(?:media\/)?comics\/(?:comics\/)?([a-z0-9-]+)\/ep(\d{3})(?:\/|$)(.*)/i);
  if(!m)return null;
  const page=m[3].match(/^page-(\d{2,3})\.(?:jpe?g|png|webp|avif)$/i);
  return {comic_id:m[1].toLowerCase(),episode:Number(m[2]),page:page?Number(page[1]):null};
}
export async function catalogAccess(db) {
  const policy=await db.prepare('SELECT * FROM catalog_access_settings WHERE id=1').first();
  if(!policy)throw new MemberError('CATALOG_ACCESS_NOT_CONFIGURED',503);
  return {...policy,premium_from_episode:policy.free_through_episode+1,scope:'AM_STUDIO_CATALOG'};
}
export function resolveAccess(comic,episode,explicit,catalog) {
  const defaults={comic_id:comic,episode,visibility:'FREE',preview_pages:'[]',verified:0,source:'LEGACY_FREE'};
  if(catalog?.enabled&&catalog.verified===1&&episode<=catalog.free_through_episode)return {...defaults,verified:1,source:'CATALOG_PREVIEW'};
  if(explicit)return {...explicit,source:'EPISODE_OVERRIDE'};
  if(catalog?.enabled){
    if(catalog.verified!==1)throw new MemberError('CATALOG_PREVIEW_NOT_VERIFIED',503);
    return {...defaults,visibility:'PREMIUM',verified:1,source:'CATALOG_MEMBERSHIP'};
  }
  return defaults;
}
export async function accessPolicy(db,comic,episode) {
  const explicit=await db.prepare('SELECT * FROM comic_access WHERE comic_id=? AND episode=?').bind(comic,episode).first();
  return resolveAccess(comic,episode,explicit,await catalogAccess(db));
}
export async function mayRead(db,req,id) {
  const lock=await db.prepare("SELECT r.status FROM publisher_locks l JOIN publisher_releases r ON r.id=l.release_id WHERE l.comic_id=? AND l.episode=? AND r.status!='PUBLISHED'").bind(id.comic_id,id.episode).first();
  if(lock)return {allowed:false,premium:false,publishing:true};
  const policy=await accessPolicy(db,id.comic_id,id.episode);
  if(policy.visibility!=='PREMIUM')return {allowed:true,premium:false};
  if(policy.verified!==1)throw new MemberError('PREMIUM_POLICY_INVALID',503);
  const preview=JSON.parse(policy.preview_pages||'[]');
  if(id.page&&preview.includes(id.page))return {allowed:true,premium:true,preview:true};
  const user=await optionalMember(db,req);
  const allowed=user&&await memberActive(db,user.user_id);
  return {allowed:!!allowed,premium:true};
}
export async function protectAsset(req,env) {
  const id=assetIdentity(new URL(req.url).pathname);if(!id)return null;
  if(!env.MEMBERSHIP_DB)return json({ok:false,error:'MEMBERSHIP_DATABASE_UNAVAILABLE'},503);
  const decision=await mayRead(env.MEMBERSHIP_DB,req,id);
  if(!decision.allowed)return json({ok:false,error:decision.publishing?'EPISODE_PUBLICATION_PENDING':'MEMBERSHIP_REQUIRED',membership_url:'/membership',...id},decision.publishing?404:402);
  return {premium:decision.premium};
}
export async function configureAccess(db,body,actor,base,req,env,ctx,preparing=false) {
  const comic=String(body.comic_id||''),episode=Number(body.episode),visibility=body.visibility;
  if(!/^[a-z0-9-]{1,80}$/.test(comic)||!Number.isInteger(episode)||episode<1||episode>999||!['FREE','PREMIUM'].includes(visibility))throw new MemberError('ACCESS_POLICY_INVALID');
  const pages=body.preview_pages;
  if(!Array.isArray(pages)||pages.length>999||pages.some(n=>!Number.isInteger(n)||n<1||n>999)||new Set(pages).size!==pages.length)throw new MemberError('PREVIEW_PAGES_INVALID');
  if(typeof body.reason!=='string'||body.reason.trim().length<10)throw new MemberError('AUDIT_REASON_REQUIRED');
  if(visibility==='PREMIUM'&&body.preview_verified!==true)throw new MemberError('PREVIEW_VERIFICATION_REQUIRED',409);
  const catalog=await catalogAccess(db);
  if(visibility==='PREMIUM'&&catalog.enabled&&episode<=catalog.free_through_episode)throw new MemberError('EPISODE_IS_PUBLIC_PREVIEW',409);
  const settings=await db.prepare('SELECT premium_storage_verified FROM billing_settings WHERE id=1').first();
  if(visibility==='PREMIUM'&&!settings?.premium_storage_verified)throw new MemberError('PREMIUM_STORAGE_NOT_VERIFIED',409);
  if(visibility==='PREMIUM'&&!preparing) {
    if(!env.COMIC_ASSETS)throw new MemberError('PRIVATE_COMIC_STORAGE_REQUIRED',409);
    const inventory=await env.COMIC_ASSETS.list({prefix:`comics/${comic}/ep${String(episode).padStart(3,'0')}/`,limit:1000});
    const available=new Set((inventory.objects||[]).map(o=>o.key.match(/\/page-(\d{2,3})\.(?:jpe?g|png|webp|avif)$/i)?.[1]).filter(Boolean).map(Number));
    if(!available.size||inventory.truncated||pages.some(n=>!available.has(n)))throw new MemberError('PREMIUM_ASSET_OR_PREVIEW_NOT_VERIFIED',409);
  }
  const response=await base.fetch(new Request(new URL('/catalog.json?channel=owner',req.url)),env,ctx);
  const listing=mergeRegisteredCatalog(await response.json());
  if(!listing.series?.some(s=>s.id===comic))throw new MemberError('COMIC_ID_NOT_IN_EXISTING_CATALOG',404);
  const before=await accessPolicy(db,comic,episode),now=iso();
  const after={comic_id:comic,episode,visibility,preview_pages:JSON.stringify([...pages].sort((a,b)=>a-b)),verified:1,updated_at:now};
  await db.batch([db.prepare('INSERT INTO comic_access VALUES(?,?,?,?,?,?) ON CONFLICT(comic_id,episode) DO UPDATE SET visibility=excluded.visibility,preview_pages=excluded.preview_pages,verified=excluded.verified,updated_at=excluded.updated_at').bind(...Object.values(after)),auditStatement(db,actor,'COMIC_ACCESS_UPDATED',`${comic}:${episode}`,before,after,body.reason)]);
  return after;
}
export async function publisherPolicy(req,env,base,ctx) {
  if(new URL(req.url).pathname!=='/api/assets/meta'||req.method!=='POST')return null;
  const body=await req.clone().json();
  if(!Object.hasOwn(body,'visibility'))return null;
  if(!env.AM_STUDIO_ADMIN_KEY||!equal(req.headers.get('x-am-studio-admin-key')||'',env.AM_STUDIO_ADMIN_KEY))throw new MemberError('ADMIN_AUTH_REQUIRED',401);
  return configureAccess(env.MEMBERSHIP_DB,{comic_id:body.seriesId,episode:body.episode,visibility:body.visibility,preview_pages:body.previewPages,preview_verified:body.previewVerified,reason:body.accessReason},'PUBLISHER',base,req,env,ctx);
}
export const membershipServiceWorker=`const CACHE='am-studio-public-v1';const STATIC=['/styles.css','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('am-studio-')&&k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;
if(!STATIC.includes(u.pathname)){e.respondWith(fetch(e.request,{cache:'no-store'}));return;}
e.respondWith(fetch(e.request).then(r=>{if(r.ok)e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,r.clone())));return r}).catch(()=>caches.match(e.request)));});`;
