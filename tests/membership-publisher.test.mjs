import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createMembershipWorker} from '../src/membership-runtime.js';
import {publisherRegistry,publishingProfile} from '../src/publisher-registry.js';
import {inboxKey} from '../src/universal-publisher.js';
import {newSession} from '../src/membership-auth.js';
import {invalidateInventoryCache} from '../src/asset-runtime.js';
import {invalidatePublisherInventory} from '../src/owner-lite-runtime.js';

class D1{
  constructor(){this.sql=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())this.sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'))}
  prepare(sql){const db=this.sql;let args=[];const p={bind(...v){args=v;return p},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},runSync(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}}},async run(){return p.runSync()}};return p}
  async batch(list){this.sql.exec('BEGIN IMMEDIATE');try{const r=list.map(p=>p.runSync());this.sql.exec('COMMIT');return r}catch(e){this.sql.exec('ROLLBACK');throw e}}
}
class R2{
  constructor(){this.objects=new Map();this.writes=0}
  async put(key,body,options={}){
    const bytes=typeof body==='string'?Buffer.from(body):Buffer.from(body);
    this.writes++;this.objects.set(key,{key,bytes:Buffer.from(bytes),size:bytes.length,customMetadata:options.customMetadata||{},httpMetadata:options.httpMetadata||{},uploaded:new Date()});return this.head(key);
  }
  async head(key){const o=this.objects.get(key);if(!o)return null;return {key:o.key,size:o.size,customMetadata:{...o.customMetadata},httpMetadata:{...o.httpMetadata},uploaded:o.uploaded}}
  async get(key){const o=this.objects.get(key);if(!o)return null;return {...await this.head(key),body:new Uint8Array(o.bytes),arrayBuffer:async()=>Uint8Array.from(o.bytes).buffer,text:async()=>o.bytes.toString(),writeHttpMetadata(h){for(const [name,value] of Object.entries(o.httpMetadata))h.set(name==='contentType'?'content-type':name==='cacheControl'?'cache-control':name,value)}}}
  async list({prefix='',limit=1000,cursor}={}){const all=[...this.objects.values()].filter(o=>o.key.startsWith(prefix)).sort((a,b)=>a.key.localeCompare(b.key)),start=Number(cursor||0),rows=all.slice(start,start+limit);return {objects:await Promise.all(rows.map(o=>this.head(o.key))),truncated:start+rows.length<all.length,cursor:String(start+rows.length)}}
}
const origin='https://comics.nadmo.id';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function fixture(){
  invalidateInventoryCache();invalidatePublisherInventory();
  const db=new D1(),r2=new R2(),env={MEMBERSHIP_DB:db,COMIC_ASSETS:r2,AM_STUDIO_ADMIN_KEY:'local-publisher-admin-key',BILLING_ENVIRONMENT:'PRODUCTION',ASSETS:{async fetch(req){const path=new URL(req.url).pathname;if(path==='/catalog.json')return Response.json({studio:{},series:[{id:'royal-gambler',title:'Royal Gambler',episodes:0,verifiedEpisodes:[],freeEpisodes:0}],excludedProjects:[{id:'arda-personal-fb'}]});if(path==='/reader-assets.json')return Response.json({registry:{},episodes:[]});return new Response('<html><body><div id="app"></div></body></html>',{headers:{'content-type':'text/html'}})}}};
  db.sql.exec('UPDATE billing_settings SET premium_storage_verified=1');
  const worker=createMembershipWorker(),ctx={waitUntil(p){void p.catch(()=>{})}};
  const call=(path,body,auth={})=>worker.fetch(new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(auth.cookie?{cookie:auth.cookie}:{}),...(auth.csrf?{'x-csrf-token':auth.csrf}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,ctx);
  async function account(name='test'){
    const response=await call('/api/member/register',{email:name+'@example.invalid',name,password:'reader-test-password-2026',accept_terms:true,terms_version:'2026-10-26',timezone:'Asia/Makassar'});assert.equal(response.status,200);
    const data=await response.json();return {id:data.user.id,csrf:data.csrf,cookie:response.headers.get('set-cookie').split(';')[0]};
  }
  async function admin(){const session=await newSession(db,null,'ADMIN');return {csrf:session.csrf,cookie:session.cookie.split(';')[0]}}
  async function member(auth,expires='2099-10-01T00:00:00.000Z'){await db.prepare("INSERT INTO subscriptions(id,user_id,plan_id,starts_at,ends_at,last_period_starts_at,status,updated_at) VALUES(?,?,'am-studio-comics-member','2020-01-01T00:00:00.000Z',?,'2020-01-01T00:00:00.000Z','ACTIVE',?)").bind('sub_'+auth.id,auth.id,expires,new Date().toISOString()).run()}
  async function job({comic='royal-gambler',episode=1,count=5,type='EPISODE',stage=true,cover=true}={}){
    const id=randomUUID(),profile=publishingProfile(comic),sources=[];
    const desc=(kind,number)=>{const bytes=Buffer.concat([png,Buffer.from([number||0])]);const d={size:bytes.length,sha256:sha(bytes),content_type:'image/png',...(number?{number}:{})};sources.push({kind,number,bytes,descriptor:d});return d};
    const manifest={version:1,id,type,comic_id:comic,channel_id:profile.channel_id,episode:type==='COVER'?0:episode,title:'Approved original comic release',page_count:type==='COVER'?0:count,cover:cover?desc('COVER',0):undefined,pages:type==='COVER'?[]:Array.from({length:count},(_,n)=>desc('PAGE',n+1)),owner_approved:true,canon_state:'CANON_FINAL',qc:'QC_PASS',approval_reference:'Owner approved source files for local integration test',reason:'Verify original bytes and automatic catalog publication'};
    await r2.put(inboxKey(id),JSON.stringify(manifest));
    if(stage)for(let index=0;index<sources.length;index++)await r2.put('system/publisher/staging/'+id+'/'+index+'.png',sources[index].bytes);
    return {id,manifest,sources};
  }
  async function process(job){return call('/api/publisher/process/'+job.id,{})}
  async function finish(job){for(let n=0;n<260;n++){const r=await process(job),d=await r.json();assert.ok([200,202].includes(r.status),JSON.stringify(d));if(d.status==='PUBLISHED')return d}throw new Error('Publisher did not finish')}
  return {db,r2,env,worker,ctx,call,account,admin,member,job,process,finish};
}

test('nine full preview episodes stay public and episode ten requires server membership on every URL mode',async()=>{
  const f=fixture();for(const n of [1,9])assert.equal((await f.call('/api/member/access?comic_id=royal-gambler&episode='+n+'&page=999')).status,200);
  for(const suffix of ['','?channel=owner','?channel=beta'])assert.equal((await f.call('/media/comics/royal-gambler/ep010/page-01.png'+suffix)).status,402);
  assert.equal((await f.call('/comics/royal-gambler/ep010/recovery/strip.b64')).status,402);
  const data=await (await f.call('/api/membership')).json();assert.equal(data.preview.free_through_episode,9);assert.equal(data.preview.premium_from_episode,10);assert.equal(data.checkout_available,false);
});
test('active membership grants episode ten; another account and expired membership cannot reuse access',async()=>{
  const f=fixture(),a=await f.account('member'),b=await f.account('other');await f.member(a);
  const path='/api/member/access?comic_id=royal-gambler&episode=10&page=1';
  assert.equal((await f.call(path,undefined,a)).status,200);assert.equal((await f.call(path,undefined,b)).status,402);
  f.db.sql.exec("UPDATE subscriptions SET ends_at='2020-02-01T00:00:00.000Z'");
  assert.equal((await f.call(path,undefined,a)).status,402);assert.equal((await f.call('/api/member/access?comic_id=royal-gambler&episode=9&page=1',undefined,a)).status,200);
});
test('administrator can edit the catalog cutoff with audit, but cannot lock an episode within the preview',async()=>{
  const f=fixture(),admin=await f.admin();
  const p={comic_id:'royal-gambler',episode:9,visibility:'PREMIUM',preview_pages:[],preview_verified:true,reason:'Attempt to lock the approved preview'};
  assert.equal((await f.call('/api/admin/billing/access',p,admin)).status,409);
  assert.equal((await f.call('/api/admin/billing/preview',{free_through_episode:8,preview_verified:true,reason:'Owner tested a changed preview boundary'},admin)).status,200);
  assert.equal((await f.call('/api/member/access?comic_id=royal-gambler&episode=9&page=1')).status,402);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='CATALOG_PREVIEW_UPDATED'").first()).n,1);
  assert.equal((await f.call('/api/admin/billing/preview',{free_through_episode:9,preview_verified:true,reason:'Member must not edit the preview'})).status,401);
});
test('an audited free exception after episode nine remains readable',async()=>{
  const f=fixture(),admin=await f.admin();
  assert.equal((await f.call('/api/admin/billing/access',{comic_id:'royal-gambler',episode:10,visibility:'FREE',preview_pages:[],preview_verified:true,reason:'Owner approved a free special episode'},admin)).status,200);
  assert.equal((await f.call('/api/member/access?comic_id=royal-gambler&episode=10&page=3')).status,200);
});
test('all registered channels have isolated passports and existing canonical IDs are retained',async()=>{
  const f=fixture(),r=publisherRegistry(),expected=r.profiles.length;assert.ok(expected>=15);assert.equal(new Set(r.profiles.map(p=>p.comic_id)).size,expected);assert.equal(new Set(r.profiles.map(p=>p.channel_id)).size,expected);
  assert.equal(publishingProfile('13-pintu-neraka').comic_id,'13');assert.equal(publishingProfile('arda-moron').comic_id,'amu');
  assert.throws(()=>publishingProfile('royal-gambler','ch-legendary-decks'),/CHANNEL_MISMATCH/);
  const catalog=await (await f.call('/catalog.json')).json();assert.equal(catalog.series.length,expected);assert.equal(catalog.series.find(s=>s.id==='wukong-rebooted').episodes,0);assert.equal(catalog.excludedProjects.length,0);
  for(const p of r.profiles)assert.equal((await f.call(p.passport_url)).status,200);
});
test('agent discovery exposes direct upload with the canonical target and required Origin',async()=>{
  const f=fixture();
  const health=await (await f.call('/api/publisher/health')).json();
  assert.equal(health.ok,true);assert.equal(health.transport,'DIRECT_ORIGINAL_BYTES');
  const passport=await (await f.call('/publisher/passports/wukong-rebooted.json')).json();
  assert.equal(passport.agent_upload.manual_file_selection_required,false);
  assert.equal(passport.agent_upload.headers.Origin,origin);
  assert.equal(passport.agent_upload.headers['X-AM-Comic-ID'],'wukong-rebooted');
});
test('agent target mismatch is rejected before staging, processing and receipt reuse',async()=>{
  const f=fixture(),j=await f.job({stage:false,type:'COVER'});
  const headers={origin,'x-am-comic-id':'wukong-rebooted','x-am-channel-id':'ch-wukong-rebooted'};
  for(const path of ['uploads/'+j.id+'/0','process/'+j.id]){
    const res=await f.worker.fetch(new Request(origin+'/api/publisher/'+path,{method:'POST',headers,body:j.sources[0].bytes}),f.env,f.ctx);
    assert.equal(res.status,409);assert.equal((await res.json()).error,'PUBLISHER_REQUEST_TARGET_MISMATCH');
  }
  assert.equal(await f.r2.head('system/publisher/staging/'+j.id+'/0.png'),null);
  assert.equal(await f.db.prepare('SELECT id FROM publisher_releases WHERE id=?').bind(j.id).first(),null);
  await f.r2.put('system/publisher/staging/'+j.id+'/0.png',j.sources[0].bytes);await f.finish(j);
  const res=await f.worker.fetch(new Request(origin+'/api/publisher/process/'+j.id,{method:'POST',headers,body:'{}'}),f.env,f.ctx);
  assert.equal(res.status,409);
});
test('missing channel and changed approved manifests cannot receive uploads',async()=>{
  const f=fixture(),j=await f.job({stage:false});
  delete j.manifest.channel_id;await f.r2.put(inboxKey(j.id),JSON.stringify(j.manifest));
  assert.equal((await f.process(j)).status,422);
  j.manifest.channel_id='ch-royal-gambler';await f.r2.put(inboxKey(j.id),JSON.stringify(j.manifest));
  await f.process(j);
  j.manifest.title='Changed after processing began';await f.r2.put(inboxKey(j.id),JSON.stringify(j.manifest));
  const res=await f.worker.fetch(new Request(origin+'/api/publisher/uploads/'+j.id+'/0',{method:'POST',headers:{origin},body:j.sources[0].bytes}),f.env,f.ctx);
  assert.equal(res.status,409);assert.equal((await res.json()).error,'PUBLISHER_MANIFEST_CHANGED');
});
test('public callers cannot create approval manifests or upload unapproved and mismatched bytes',async()=>{
  const f=fixture(),id=randomUUID();assert.equal((await f.call('/api/publisher/process/'+id,{})).status,404);
  const j=await f.job({stage:false});
  const req=new Request(origin+'/api/publisher/uploads/'+j.id+'/0',{method:'POST',headers:{origin},body:Buffer.alloc(j.sources[0].bytes.length)});
  assert.equal((await f.worker.fetch(req,f.env,f.ctx)).status,422);assert.equal(await f.r2.head('system/publisher/staging/'+j.id+'/0.png'),null);
  j.manifest.owner_approved=false;await f.r2.put(inboxKey(j.id),JSON.stringify(j.manifest));assert.equal((await f.process(j)).status,409);
});
test('approved uploads preserve original bytes and a partially copied release is invisible',async()=>{
  const f=fixture(),j=await f.job({stage:false});
  for(let n=0;n<j.sources.length;n++){
    const response=await f.worker.fetch(new Request(origin+'/api/publisher/uploads/'+j.id+'/'+n,{method:'POST',headers:{origin},body:j.sources[n].bytes}),f.env,f.ctx);assert.equal(response.status,200);
  }
  const first=await f.process(j);assert.equal(first.status,202);
  assert.equal((await f.call('/media/comics/royal-gambler/ep001/page-01.png')).status,404);
  assert.equal((await (await f.call('/reader-assets.json')).json()).episodes.length,0);
  const done=await f.finish(j);assert.equal(done.status,'PUBLISHED');assert.equal(done.page_count,5);
  const episode=(await (await f.call('/reader-assets.json')).json()).episodes.find(e=>e.seriesId==='royal-gambler');assert.equal(episode.pageCount,5);assert.equal(episode.access.visibility,'FREE');
  const image=await f.call('/media/comics/royal-gambler/ep001/page-01.png');assert.equal(image.status,200);assert.equal(sha(Buffer.from(await image.arrayBuffer())),j.sources[1].descriptor.sha256);
  const before=f.r2.writes;assert.deepEqual(await f.finish(j),done);assert.equal(f.r2.writes,before);assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='COMIC_RELEASE_VERIFIED'").first()).n,1);
});
test('missing source never becomes published; an exact reupload resumes at the last verified asset',async()=>{
  const f=fixture(),j=await f.job({count:2,stage:false});
  assert.equal((await f.process(j)).status,409);
  assert.equal((await (await f.call('/api/publisher/releases/'+j.id)).json()).status,'FAILED');
  assert.equal((await f.call('/media/comics/royal-gambler/ep001/page-01.png')).status,404);
  for(let n=0;n<j.sources.length;n++)await f.r2.put('system/publisher/staging/'+j.id+'/'+n+'.png',j.sources[n].bytes);
  assert.equal((await f.finish(j)).status,'PUBLISHED');
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM payments').first()).n,0);
});
test('episode ten publishing updates the catalog while direct assets remain private for nonmembers',async()=>{
  const f=fixture(),j=await f.job({episode:10,count:2});await f.finish(j);
  const catalog=await (await f.call('/catalog.json')).json(),comic=catalog.series.find(s=>s.id==='royal-gambler');
  assert.deepEqual(comic.verifiedEpisodes,[10]);assert.equal(comic.episodes,10);assert.equal(comic.accessByEpisode[10],'PREMIUM');
  assert.equal((await f.call('/media/comics/royal-gambler/cover.png')).status,200);
  assert.equal((await f.call('/media/comics/royal-gambler/ep010/page-01.png')).status,402);
  const a=await f.account();await f.member(a);
  const response=await f.call('/media/comics/royal-gambler/ep010/page-01.png?channel=owner',undefined,a);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('a channel with no old catalog entry publishes without any payment or episode reconfiguration',async()=>{
  const f=fixture(),j=await f.job({comic:'wukong-rebooted',count:2});await f.finish(j);
  const catalog=await (await f.call('/catalog.json')).json();assert.deepEqual(catalog.series.find(s=>s.id==='wukong-rebooted').verifiedEpisodes,[1]);
  assert.equal((await f.call('/media/comics/wukong-rebooted/ep001/page-01.png')).status,200);
});
test('a cover-only release creates the correct new catalog cover without inventing an episode',async()=>{
  const f=fixture(),j=await f.job({comic:'wukong-rebooted',type:'COVER'}),receipt=await f.finish(j);
  assert.equal(receipt.episode,0);assert.equal(receipt.page_count,0);
  const comic=(await (await f.call('/catalog.json')).json()).series.find(s=>s.id==='wukong-rebooted');
  assert.equal(comic.episodes,0);assert.equal(comic.status,'COMING_SOON');assert.equal(comic.cover.asset,'/media/comics/wukong-rebooted/cover.png');
  assert.equal((await f.call('/media/comics/wukong-rebooted/cover.png')).status,200);
});
test('a published episode can be extended only by reusing every already-published page byte-for-byte',async()=>{
  const f=fixture(),base=await f.job({count:2});const first=await f.finish(base);
  const extended=await f.job({count:5});
  extended.manifest.pages[0].reuse_existing=true;
  extended.manifest.pages[1].reuse_existing=true;
  await f.r2.put(inboxKey(extended.id),JSON.stringify(extended.manifest));
  const second=await f.finish(extended);
  assert.equal(first.page_count,2);assert.equal(second.page_count,5);
  assert.equal(second.assets[0].sha256,first.assets[0].sha256);
  assert.equal(second.assets[1].sha256,first.assets[1].sha256);
  const episode=(await (await f.call('/reader-assets.json')).json()).episodes.find(e=>e.seriesId==='royal-gambler'&&e.episode===1);
  assert.equal(episode.pageCount,5);assert.equal(episode.pages.length,5);
});
test('concurrent processing and conflicting release IDs do not activate or overwrite twice',async()=>{
  const f=fixture(),j=await f.job({count:2});const calls=await Promise.all([f.process(j),f.process(j)]);assert.ok(calls.every(r=>[200,202].includes(r.status)));await f.finish(j);
  assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='COMIC_RELEASE_VERIFIED'").first()).n,1);
  const other=await f.job({count:2});assert.equal((await f.process(other)).status,409);
  assert.equal((await (await f.call('/api/publisher/releases/'+j.id)).json()).status,'PUBLISHED');
  assert.equal((await f.call('/media/comics/royal-gambler/ep001/page-01.png')).status,200);
});
test('changed private manifests and cross-origin source uploads fail closed',async()=>{
  const f=fixture(),j=await f.job();await f.process(j);j.manifest.title='A different approved manifest';await f.r2.put(inboxKey(j.id),JSON.stringify(j.manifest));assert.equal((await f.process(j)).status,409);
  const k=await f.job({episode:2,stage:false}),req=new Request(origin+'/api/publisher/uploads/'+k.id+'/0',{method:'POST',headers:{origin:'https://other.example'},body:k.sources[0].bytes});assert.equal((await f.worker.fetch(req,f.env,f.ctx)).status,403);
});
