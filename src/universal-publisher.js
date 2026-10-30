import {createHash,randomUUID} from 'node:crypto';
import {MemberError,iso,hash} from './membership-auth.js';
import {publishingProfile,mergeRegisteredCatalog} from './publisher-registry.js';
import {invalidateInventoryCache} from './asset-runtime.js';
import {invalidatePublisherInventory} from './owner-lite-runtime.js';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_BYTES=20*1024*1024;
const TYPES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif'};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export const inboxKey=id=>'system/publisher/inbox/'+id+'.json';
const episodePrefix=(comic,episode)=>'comics/'+comic+'/ep'+String(episode).padStart(3,'0')+'/';

export function validateManifest(value,id){
  if(!UUID.test(id)||!value||value.version!==1||value.id!==id)throw new MemberError('PUBLISHER_MANIFEST_INVALID',422);
  if(typeof value.channel_id!=='string'||!value.channel_id)throw new MemberError('PUBLISHER_CHANNEL_REQUIRED',422);
  const profile=publishingProfile(value.comic_id,value.channel_id);
  if(profile.comic_id!==value.comic_id)throw new MemberError('PUBLISHER_USE_CANONICAL_COMIC_ID',422);
  if(value.owner_approved!==true||value.canon_state!=='CANON_FINAL'||value.qc!=='QC_PASS')throw new MemberError('PUBLISHER_APPROVAL_AND_QC_REQUIRED',409);
  if(typeof value.approval_reference!=='string'||value.approval_reference.trim().length<10)throw new MemberError('PUBLISHER_APPROVAL_REFERENCE_REQUIRED',422);
  if(typeof value.reason!=='string'||value.reason.trim().length<10)throw new MemberError('AUDIT_REASON_REQUIRED',422);
  if(!['COVER','EPISODE'].includes(value.type))throw new MemberError('PUBLISHER_RELEASE_TYPE_INVALID',422);
  const episode=Number(value.episode),pages=value.pages;
  if(!Number.isInteger(episode)||episode<0||episode>999||value.type==='COVER'&&episode!==0||value.type==='EPISODE'&&episode<1)throw new MemberError('PUBLISHER_EPISODE_INVALID',422);
  if(!Array.isArray(pages)||pages.length>999||value.type==='EPISODE'&&!pages.length||value.type==='COVER'&&pages.length||Number(value.page_count)!==pages.length)throw new MemberError('PUBLISHER_PAGE_COUNT_INVALID',422);
  if(pages.some((p,i)=>p.number!==i+1))throw new MemberError('PUBLISHER_PAGE_SEQUENCE_INVALID',422);
  if(value.type==='COVER'&&!value.cover)throw new MemberError('PUBLISHER_COVER_REQUIRED',422);
  if(typeof value.title!=='string'||value.title.trim().length<2||value.title.length>180)throw new MemberError('PUBLISHER_TITLE_INVALID',422);
  const assets=[...(value.cover?[{...value.cover,kind:'COVER'}]:[]),...pages.map(p=>({...p,kind:'PAGE'}))].map((a,index)=>{
    if(!TYPES[a.content_type]||!Number.isSafeInteger(a.size)||a.size<1||a.size>MAX_BYTES||!/^[a-f0-9]{64}$/.test(a.sha256||''))throw new MemberError('PUBLISHER_ASSET_DESCRIPTOR_INVALID',422);
    const extension=TYPES[a.content_type],destination=a.kind==='COVER'?'comics/'+profile.comic_id+'/cover.'+extension:episodePrefix(profile.comic_id,episode)+'page-'+String(a.number).padStart(2,'0')+'.'+extension;
    return {...a,index,destination,staged_key:'system/publisher/staging/'+id+'/'+index+'.'+extension};
  });
  return {...value,episode,profile,assets};
}

async function approvedJob(env,id){
  if(!UUID.test(id))throw new MemberError('PUBLISHER_RELEASE_NOT_FOUND',404);
  if(!env.COMIC_ASSETS)throw new MemberError('PRIVATE_COMIC_STORAGE_REQUIRED',503);
  const object=await env.COMIC_ASSETS.get(inboxKey(id));
  if(!object)throw new MemberError('PUBLISHER_RELEASE_NOT_FOUND',404);
  if(object.size>196608)throw new MemberError('PUBLISHER_MANIFEST_TOO_LARGE',413);
  const raw=await object.text();
  let body;try{body=JSON.parse(raw)}catch{throw new MemberError('PUBLISHER_MANIFEST_INVALID',422)}
  return {manifest:validateManifest(body,id),manifestHash:hash(raw)};
}

async function releaseRow(db,id){return db.prepare('SELECT * FROM publisher_releases WHERE id=?').bind(id).first()}
async function verifiedBytes(object,descriptor){
  if(!object||object.size!==descriptor.size||object.size>MAX_BYTES)throw new MemberError('PUBLISHER_SOURCE_MISSING_OR_SIZE_MISMATCH',409);
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.byteLength!==descriptor.size||digest(bytes)!==descriptor.sha256)throw new MemberError('PUBLISHER_SOURCE_HASH_MISMATCH',422);
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const webp=bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80;
  const avif=bytes[4]===102&&bytes[5]===116&&bytes[6]===121&&bytes[7]===112&&new TextDecoder().decode(bytes.slice(8,32)).includes('avif');
  if(!({'image/png':png,'image/jpeg':jpeg,'image/webp':webp,'image/avif':avif})[descriptor.content_type])throw new MemberError('PUBLISHER_IMAGE_TYPE_MISMATCH',422);
  return bytes;
}

export async function publisherStatus(env,id){
  const db=env.MEMBERSHIP_DB,row=await releaseRow(db,id);
  if(row?.status==='PUBLISHED')return JSON.parse(row.receipt_json);
  const {manifest,manifestHash}=await approvedJob(env,id);
  if(row&&row.manifest_sha256!==manifestHash)throw new MemberError('PUBLISHER_MANIFEST_CHANGED',409);
  const assets=[];
  for(const a of manifest.assets){
    const source=await env.COMIC_ASSETS.head(a.reuse_existing?a.destination:a.staged_key);
    assets.push({index:a.index,label:a.kind==='COVER'?'Cover':'Halaman '+a.number,size:a.size,sha256:a.sha256,content_type:a.content_type,ready:source?.size===a.size});
  }
  return {ok:true,id,comic_id:manifest.comic_id,channel_id:manifest.channel_id,title:manifest.title,episode:manifest.episode,status:row?.status||'AWAITING_UPLOAD',next_asset:row?.next_asset||0,assets,error:row?.error_code||null};
}

// Agent requests pin both IDs. Keep existing owner-browser clients compatible.
function assertRequestTarget(req,release){
  const comic=req.headers.get('x-am-comic-id'),channel=req.headers.get('x-am-channel-id');
  if((comic!==null||channel!==null)&&(comic!==release.comic_id||channel!==release.channel_id))throw new MemberError('PUBLISHER_REQUEST_TARGET_MISMATCH',409);
}

// No public endpoint can create an approval or choose a destination. The inbox
// is written through the owner's authenticated Cloudflare/R2 connector. An
// upload must match the exact size, SHA-256 and image type approved there.
export async function uploadPublisherSource(req,env,id,index){
  const {manifest,manifestHash}=await approvedJob(env,id),a=manifest.assets[index];
  assertRequestTarget(req,manifest);
  if(!a||a.reuse_existing)throw new MemberError('PUBLISHER_ASSET_NOT_UPLOADABLE',404);
  const row=await releaseRow(env.MEMBERSHIP_DB,id);
  if(row&&row.manifest_sha256!==manifestHash)throw new MemberError('PUBLISHER_MANIFEST_CHANGED',409);
  if(row?.status==='PUBLISHED')throw new MemberError('PUBLISHER_RELEASE_ALREADY_PUBLISHED',409);
  const claimed=Number(req.headers.get('content-length')||0);
  if(claimed&&claimed!==a.size)throw new MemberError('PUBLISHER_SOURCE_SIZE_MISMATCH',422);
  const reader=req.body?.getReader();if(!reader)throw new MemberError('EMPTY_REQUEST');
  const chunks=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>a.size){await reader.cancel();throw new MemberError('PUBLISHER_SOURCE_SIZE_MISMATCH',413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.byteLength}
  await verifiedBytes({size,arrayBuffer:async()=>bytes.buffer},a);
  await env.COMIC_ASSETS.put(a.staged_key,bytes,{httpMetadata:{contentType:a.content_type,cacheControl:'no-store'},customMetadata:{sha256:a.sha256,releaseId:id,source:'APPROVED_PUBLISHER_STAGING'}});
  return {ok:true,id,index,size,sha256:a.sha256,staged:true};
}

// Authenticated Cloudflare R2 connector can stage bounded binary parts when a
// production conversation's local runtime has no outbound network access.
// Only a previously approved manifest and its exact original digest are accepted.
export async function assemblePublisherSource(req,env,id,index){
  const {manifest,manifestHash}=await approvedJob(env,id),a=manifest.assets[index];
  assertRequestTarget(req,manifest);
  if(!a||a.reuse_existing)throw new MemberError('PUBLISHER_ASSET_NOT_UPLOADABLE',404);
  const row=await releaseRow(env.MEMBERSHIP_DB,id);
  if(row&&row.manifest_sha256!==manifestHash)throw new MemberError('PUBLISHER_MANIFEST_CHANGED',409);
  if(row?.status==='PUBLISHED')throw new MemberError('PUBLISHER_RELEASE_ALREADY_PUBLISHED',409);
  const PART_BYTES=196608,parts=Math.ceil(a.size/PART_BYTES),data=new Uint8Array(a.size);
  for(let n=0;n<parts;n++){
    const key='system/publisher/staging-parts/'+id+'/'+index+'/'+String(n).padStart(3,'0')+'.bin';
    const part=await env.COMIC_ASSETS.get(key),expected=Math.min(PART_BYTES,a.size-n*PART_BYTES);
    if(!part||part.size!==expected)throw new MemberError('PUBLISHER_PART_MISSING_OR_SIZE_MISMATCH',409);
    data.set(new Uint8Array(await part.arrayBuffer()),n*PART_BYTES);
  }
  await verifiedBytes({size:data.length,arrayBuffer:async()=>data.buffer},a);
  await env.COMIC_ASSETS.put(a.staged_key,data,{httpMetadata:{contentType:a.content_type,cacheControl:'no-store'},customMetadata:{sha256:a.sha256,releaseId:id,source:'APPROVED_PUBLISHER_PART_ASSEMBLY'}});
  return {ok:true,id,index,size:data.length,sha256:a.sha256,staged:true,parts};
}

async function verifyFinalAssets(env,manifest){
  for(const a of manifest.assets){
    const object=await env.COMIC_ASSETS.head(a.destination);
    if(!object||object.size!==a.size||object.customMetadata?.sha256!==a.sha256)throw new MemberError('PUBLISHER_FINAL_ASSET_NOT_VERIFIED',409);
  }
}

export async function processPublisherRelease(req,env,legacy,ctx,id){
  const db=env.MEMBERSHIP_DB,old=await releaseRow(db,id);
  if(old?.status==='PUBLISHED'){const receipt=JSON.parse(old.receipt_json);assertRequestTarget(req,receipt);return receipt}
  const {manifest,manifestHash}=await approvedJob(env,id);
  assertRequestTarget(req,manifest);
  if(old&&old.manifest_sha256!==manifestHash)throw new MemberError('PUBLISHER_MANIFEST_CHANGED',409);
  const now=iso(),lease=randomUUID(),until=new Date(Date.now()+60000).toISOString();
  await db.prepare("INSERT OR IGNORE INTO publisher_releases(id,channel_id,comic_id,episode,manifest_sha256,status,created_at,updated_at) VALUES(?,?,?,?,?,'PROCESSING',?,?)").bind(id,manifest.channel_id,manifest.comic_id,manifest.episode,manifestHash,now,now).run();
  const claim=await db.prepare("UPDATE publisher_releases SET lease_token=?,lease_expires_at=?,status='PROCESSING',error_code=NULL,updated_at=? WHERE id=? AND status!='PUBLISHED' AND (lease_expires_at IS NULL OR lease_expires_at<=?)").bind(lease,until,now,id,now).run();
  if(!claim.meta.changes)return {ok:true,id,status:'PROCESSING',retry_after:2};
  try{
    const conflict=await db.prepare("SELECT l.release_id,r.status,r.receipt_json FROM publisher_locks l JOIN publisher_releases r ON r.id=l.release_id WHERE l.comic_id=? AND l.episode=? AND l.release_id!=?").bind(manifest.comic_id,manifest.episode,id).first();
    let supersedingAppend=false;
    if(conflict){
      if(conflict.status!=='PUBLISHED'||manifest.type!=='EPISODE')throw new MemberError('PUBLISHER_EPISODE_HAS_EXISTING_RELEASE',409);
      let previous;try{previous=JSON.parse(conflict.receipt_json||'{}')}catch{throw new MemberError('PUBLISHER_PREVIOUS_RECEIPT_INVALID',409)}
      const oldPages=(previous.assets||[]).filter(a=>a.kind==='PAGE').sort((a,b)=>Number(a.number)-Number(b.number));
      if(previous.comic_id!==manifest.comic_id||Number(previous.episode)!==manifest.episode||oldPages.length<1||oldPages.length>=manifest.pages.length)throw new MemberError('PUBLISHER_EPISODE_HAS_EXISTING_RELEASE',409);
      for(let n=0;n<oldPages.length;n++){
        const prior=oldPages[n],next=manifest.assets.find(a=>a.kind==='PAGE'&&a.number===n+1);
        if(!next?.reuse_existing||next.size!==prior.size||next.sha256!==prior.sha256||prior.url!=='https://comics.nadmo.id/media/'+next.destination)throw new MemberError('PUBLISHER_APPEND_BASE_MISMATCH',409);
      }
      supersedingAppend=true;
      await db.prepare('UPDATE publisher_locks SET release_id=? WHERE comic_id=? AND episode=? AND release_id=?').bind(id,manifest.comic_id,manifest.episode,conflict.release_id).run();
    }else{
      await db.prepare('INSERT OR IGNORE INTO publisher_locks VALUES(?,?,?)').bind(manifest.comic_id,manifest.episode,id).run();
    }
    const lock=await db.prepare('SELECT release_id FROM publisher_locks WHERE comic_id=? AND episode=?').bind(manifest.comic_id,manifest.episode).first();
    if(lock?.release_id!==id)throw new MemberError('PUBLISHER_EPISODE_HAS_EXISTING_RELEASE',409);
    const row=await releaseRow(db,id),end=supersedingAppend?manifest.assets.length:Math.min(row.next_asset+4,manifest.assets.length);
    for(let index=row.next_asset;index<end;index++){
      const a=manifest.assets[index];
      if(a.kind==='COVER'){
        const variants=await env.COMIC_ASSETS.list({prefix:'comics/'+manifest.comic_id+'/cover.',limit:20});
        if(variants.truncated||(variants.objects||[]).some(o=>o.key!==a.destination))throw new MemberError('PUBLISHER_COVER_VARIANT_CONFLICT',409);
      }
      const source=await env.COMIC_ASSETS.get(a.reuse_existing?a.destination:a.staged_key);
      const bytes=await verifiedBytes(source,a);
      const existing=await env.COMIC_ASSETS.get(a.destination);
      if(existing){await verifiedBytes(existing,a)}
      await env.COMIC_ASSETS.put(a.destination,bytes,{httpMetadata:{contentType:a.content_type,cacheControl:'no-store'},customMetadata:{sha256:a.sha256,releaseId:id,source:'UNIVERSAL_COMICS_PUBLISHER'}});
      const updated=await db.prepare('UPDATE publisher_releases SET next_asset=?,updated_at=?,lease_expires_at=? WHERE id=? AND lease_token=?').bind(index+1,iso(),new Date(Date.now()+60000).toISOString(),id,lease).run();
      if(!updated.meta.changes)return {ok:true,id,status:'PROCESSING',retry_after:2};
    }
    if(end<manifest.assets.length){
      await db.prepare('UPDATE publisher_releases SET lease_token=NULL,lease_expires_at=NULL WHERE id=? AND lease_token=?').bind(id,lease).run();
      return {ok:true,id,status:'PROCESSING',next_asset:end,total_assets:manifest.assets.length};
    }
    await verifyFinalAssets(env,manifest);
    if(manifest.type==='EPISODE'){
      const prefix=episodePrefix(manifest.comic_id,manifest.episode),listed=await env.COMIC_ASSETS.list({prefix,limit:1000});
      const pageKeys=(listed.objects||[]).filter(o=>/\/page-\d{2,3}\.(?:jpe?g|png|webp|avif)$/i.test(o.key));
      if(listed.truncated||pageKeys.length!==manifest.pages.length)throw new MemberError('PUBLISHER_EXTRA_OR_MISSING_PAGES',409);
      const metadata={seriesId:manifest.comic_id,episode:manifest.episode,title:manifest.title,pageCount:manifest.pages.length,ownerApproved:true,canonState:'CANON_FINAL',qc:'QC_PASS',releaseId:id,updatedAt:iso()};
      await env.COMIC_ASSETS.put(prefix+'meta.json',JSON.stringify(metadata),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'},customMetadata:{source:'UNIVERSAL_COMICS_PUBLISHER',pageCount:String(manifest.pages.length),episodeTitle:manifest.title,releaseId:id}});
    }
    const seriesKey='comics/'+manifest.comic_id+'/series.json';
    if(!await env.COMIC_ASSETS.head(seriesKey)){
      const series={id:manifest.comic_id,title:manifest.profile.title,genre:manifest.profile.genre,code:manifest.profile.profile_code||manifest.comic_id,tag:'AM STUDIO Comics',desc:'Komik AM STUDIO.',ownerCreated:true,updatedAt:iso()};
      await env.COMIC_ASSETS.put(seriesKey,JSON.stringify(series),{httpMetadata:{contentType:'application/json',cacheControl:'no-store'},customMetadata:{source:'UNIVERSAL_COMICS_PUBLISHER',seriesTitle:series.title}});
    }
    invalidateInventoryCache();invalidatePublisherInventory();
    const headers={accept:'application/json'},catalog=mergeRegisteredCatalog(await (await legacy.fetch(new Request(new URL('/catalog.json?channel=play',req.url),{headers}),env,ctx)).json());
    if(!catalog.series.some(s=>s.id===manifest.comic_id))throw new MemberError('PUBLISHER_CATALOG_VERIFICATION_FAILED',409);
    const cover=manifest.assets.find(a=>a.kind==='COVER');
    if(cover&&catalog.series.find(s=>s.id===manifest.comic_id)?.cover?.asset!=='/media/'+cover.destination)throw new MemberError('PUBLISHER_COVER_VERIFICATION_FAILED',409);
    if(manifest.type==='EPISODE'){
      const registry=await (await legacy.fetch(new Request(new URL('/reader-assets.json?channel=play',req.url),{headers}),env,ctx)).json();
      const episode=registry.episodes?.find(e=>e.seriesId===manifest.comic_id&&e.episode===manifest.episode);
      const expected=manifest.assets.filter(a=>a.kind==='PAGE').map(a=>'/media/'+a.destination);
      if(!episode||episode.pageCount!==expected.length||JSON.stringify(episode.pages)!==JSON.stringify(expected))throw new MemberError('PUBLISHER_READER_VERIFICATION_FAILED',409);
    }
    const receipt={ok:true,id,status:'PUBLISHED',comic_id:manifest.comic_id,channel_id:manifest.channel_id,episode:manifest.episode,title:manifest.title,page_count:manifest.pages.length,manifest_sha256:manifestHash,verified_at:iso(),reader_url:'https://comics.nadmo.id/?series='+manifest.comic_id+(manifest.episode?'&episode='+manifest.episode:''),assets:manifest.assets.map(a=>({kind:a.kind,number:a.number||null,url:'https://comics.nadmo.id/media/'+a.destination,size:a.size,sha256:a.sha256}))};
    await db.batch([
      db.prepare("UPDATE publisher_releases SET status='PUBLISHED',receipt_json=?,lease_token=NULL,lease_expires_at=NULL,error_code=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(JSON.stringify(receipt),receipt.verified_at,id,lease),
      db.prepare("INSERT OR IGNORE INTO audit_logs(id,actor,action,target,after_json,reason,created_at) SELECT ?,'APPROVED_PUBLISHER','COMIC_RELEASE_VERIFIED',?,?,?,? WHERE EXISTS(SELECT 1 FROM publisher_releases WHERE id=? AND status='PUBLISHED')").bind('publisher_'+id,manifest.comic_id+':'+manifest.episode,JSON.stringify({release_id:id,manifest_sha256:manifestHash,page_count:manifest.pages.length}),manifest.reason,receipt.verified_at,id)
    ]);
    const saved=await releaseRow(db,id);
    return saved.status==='PUBLISHED'?JSON.parse(saved.receipt_json):{ok:true,id,status:'PROCESSING',retry_after:2};
  }catch(error){
    const code=error instanceof MemberError?error.message:'PUBLISHER_PROCESSING_FAILED';
    await db.prepare("UPDATE publisher_releases SET status='FAILED',error_code=?,lease_token=NULL,lease_expires_at=NULL,updated_at=? WHERE id=? AND lease_token=?").bind(code,iso(),id,lease).run();
    throw error;
  }
}

export async function unpublishedEpisodes(db){
  return (await db.prepare("SELECT l.comic_id,l.episode FROM publisher_locks l JOIN publisher_releases r ON r.id=l.release_id WHERE r.status!='PUBLISHED'").all()).results;
}
