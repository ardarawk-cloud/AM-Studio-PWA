import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {createMembershipWorker} from '../src/membership-runtime.js';
import {shopeepay,CALLBACK_PATH,providerReadiness} from '../src/shopeepay-qris.js';
import {reconcile,finance,csv} from '../src/membership-billing.js';
import {memberActive,subscriptionState} from '../src/membership-auth.js';
import {assetIdentity,mayRead} from '../src/membership-access.js';

// Actual SQLite constraints, triggers, and transactions are used. The provider
// transport below is a local test double: these are not provider sandbox tests.
class D1 {
  constructor(){this.sql=new DatabaseSync(':memory:');this.sql.exec(fs.readFileSync(new URL('../migrations/0001_membership.sql',import.meta.url),'utf8'))}
  prepare(sql){const db=this.sql;let args=[];const p={bind(...v){args=v;return p},async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},runSync(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async run(){return p.runSync()}};return p}
  async batch(list){this.sql.exec('BEGIN IMMEDIATE');try{const r=list.map(p=>p.runSync());this.sql.exec('COMMIT');return r}catch(e){this.sql.exec('ROLLBACK');throw e}}
}
const origin='https://comics.nadmo.id';
function fixture(){
  const db=new D1(),keys=generateKeyPairSync('rsa',{modulusLength:2048}),env={MEMBERSHIP_DB:db,AM_STUDIO_ADMIN_KEY:'test-owner-key-only',BILLING_ENVIRONMENT:'SANDBOX',SHOPEEPAY_MODE:'SANDBOX',SHOPEEPAY_SANDBOX_VERIFIED:'true',SHOPEEPAY_CLIENT_ID:'fixture-client',SHOPEEPAY_CLIENT_SECRET:'fixture-secret',SHOPEEPAY_PRIVATE_KEY:keys.privateKey.export({type:'pkcs8',format:'pem'}),SHOPEEPAY_PUBLIC_KEY:keys.publicKey.export({type:'spki',format:'pem'}),SHOPEEPAY_MERCHANT_ID:'fixture-merchant',SHOPEEPAY_STORE_ID:'fixture-store',SHOPEEPAY_BASE_URL:'https://api.uat.wallet.airpay.co.id',SHOPEEPAY_CALLBACK_URL:origin+CALLBACK_PATH};
  db.sql.exec("UPDATE billing_settings SET checkout_enabled=1,api_mode='SANDBOX',legal_entity_status='VERIFIED',premium_storage_verified=1");
  const state={creates:0,payments:new Map()},provider={
    async create(_env,i){state.creates++;state.payments.set(i.order_id,{order_id:i.order_id,provider_transaction_id:'tx-'+i.order_id,merchant_id:i.merchant_id,store_id:i.store_id,amount_idr:i.amount_idr,currency:'IDR',paid_at:new Date().toISOString(),status:'PENDING',fee_idr:null,payload_hash:'local-fixture-'+i.id});return {qr_content:'000201010212LOCAL_QRIS_FIXTURE'}},
    async query(_env,i){return state.payments.get(i.order_id)},verifyCallback:shopeepay.verifyCallback
  };
  const legacy={async fetch(r){const p=new URL(r.url).pathname;if(p==='/catalog.json')return Response.json({series:[{id:'royal-gambler',title:'Royal Gambler'}]});if(p==='/reader-assets.json')return Response.json({episodes:[{seriesId:'royal-gambler',episode:1,pageCount:3}]});if(p.startsWith('/media/')||p.startsWith('/comics/'))return new Response('IMAGE',{headers:{'cache-control':'public, max-age=31536000, immutable'}});return new Response('<html><body>Original catalog</body></html>',{headers:{'content-type':'text/html'}})}};
  const worker=createMembershipWorker(legacy,provider);
  async function call(path,data,auth={},extra={}){const headers={origin,...(data===undefined?{}:{'content-type':'application/json'}),...(auth.cookie?{cookie:auth.cookie}:{}),...(auth.csrf?{'x-csrf-token':auth.csrf}:{}),...extra};return worker.fetch(new Request(origin+path,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)}),env,{waitUntil:p=>p.catch(()=>{})})}
  async function register(name='reader'){const r=await call('/api/member/register',{email:name+'@example.invalid',name,password:'test-password-12345',timezone:'Asia/Makassar',accept_terms:true,terms_version:'2026-10-26'});assert.equal(r.status,200);const d=await r.json();return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:d.csrf,id:d.user.id}}
  async function invoice(auth,price='monthly',key=crypto.randomUUID()){const r=await call('/api/billing/invoices',{price_id:price},auth,{'idempotency-key':key});assert.equal(r.status,200);return (await r.json()).invoice}
  async function paid(auth,i){state.payments.get(i.order_id).status='PAID';const r=await call('/api/billing/invoices/'+i.id+'/status',{},auth);assert.equal(r.status,200);return r.json()}
  return {db,env,keys,state,call,register,invoice,paid,worker};
}

test('pricing seed is one product with monthly 9900/1 and annual 99000/12; all checkout off by default',async()=>{
  const db=new D1(),plan=await db.prepare('SELECT * FROM membership_plans').all(),prices=await db.prepare('SELECT amount_idr,period_months FROM membership_prices ORDER BY period_months').all();assert.equal(plan.results.length,1);assert.deepEqual(prices.results.map(p=>({...p})),[{amount_idr:9900,period_months:1},{amount_idr:99000,period_months:12}]);
  const config=await db.prepare('SELECT * FROM billing_settings').first();assert.equal(config.checkout_enabled,0);assert.equal(config.api_mode,'DISABLED');assert.equal(providerReadiness({},config).ready,false);assert.equal((await db.prepare('SELECT * FROM comic_access').all()).results.length,0);
});
test('registration, password hashing, secure session, login and logout execute through HTTP handlers',async()=>{
  const f=fixture(),a=await f.register(),row=await f.db.prepare('SELECT * FROM users WHERE id=?').bind(a.id).first();assert.match(row.password_hash,/^scrypt\$/);assert.notEqual(row.password_hash,'test-password-12345');
  const r=await f.call('/api/member/login',{email:row.email,password:'test-password-12345'});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Lax/);assert.equal((await f.call('/api/member/me',undefined,a)).status,200);
  assert.equal((await f.call('/api/member/logout',{},a)).status,200);assert.equal((await f.call('/api/member/me',undefined,a)).status,401);
});
test('QRIS invoice and SVG require its owning account; idempotency prevents duplicate creation',async()=>{
  const f=fixture(),a=await f.register('a'),b=await f.register('b'),key=crypto.randomUUID();
  const invoices=await Promise.all([f.invoice(a,'monthly',key),f.invoice(a,'monthly',key)]);assert.equal(invoices[0].id,invoices[1].id);assert.equal(f.state.creates,1);
  const i=invoices[0];assert.equal(i.amount_idr,9900);assert.equal(i.period_months,1);const qr=await f.call('/api/billing/invoices/'+i.id+'/qr',undefined,a);assert.equal(qr.status,200);assert.match(await qr.text(),/<svg/);
  for(const endpoint of ['', '/qr'])assert.equal((await f.call('/api/billing/invoices/'+i.id+endpoint,undefined,b)).status,404);
});
test('signed callback is verified with RSA and provider query before one membership activation',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a);f.state.payments.get(i.order_id).status='PAID';
  const raw=JSON.stringify({originalReferenceNo:'tx-'+i.order_id,originalPartnerReferenceNo:i.order_id,externalStoreId:'fixture-store',amount:{value:'9900.00',currency:'IDR'},latestTransactionStatus:'00',additionalInfo:{merchantId:'fixture-merchant',productType:2}}),timestamp=new Date().toISOString(),bodyHash=createHash('sha256').update(raw).digest('hex'),signature=sign('RSA-SHA256',Buffer.from(`POST:${origin+CALLBACK_PATH}:${bodyHash}:${timestamp}`),f.keys.privateKey).toString('base64');
  const req=()=>new Request(origin+CALLBACK_PATH,{method:'POST',headers:{'content-type':'application/json','x-timestamp':timestamp,'x-signature':signature},body:raw});
  assert.equal((await f.worker.fetch(req(),f.env,{})).status,200);const before=await f.db.prepare('SELECT ends_at FROM subscriptions').first();
  assert.equal((await f.worker.fetch(req(),f.env,{})).status,200);assert.deepEqual(await f.db.prepare('SELECT ends_at FROM subscriptions').first(),before);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM payments').first()).n,1);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM member_entitlements').first()).n,1);
});
test('forged webhook is rejected and screenshot/self-asserted paid status cannot grant access',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a);const r=await f.worker.fetch(new Request(origin+CALLBACK_PATH,{method:'POST',headers:{'x-timestamp':new Date().toISOString(),'x-signature':'fake'},body:'{}'}),f.env,{});assert.equal(r.status,401);
  assert.equal((await f.call('/api/billing/confirm',{invoice_id:i.id,status:'PAID',screenshot:'image'},a)).status,404);assert.equal(await memberActive(f.db,a.id),false);
});
test('wrong nominal or merchant is rejected even after provider reports paid',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a),p=f.state.payments.get(i.order_id);p.status='PAID';p.amount_idr=1;assert.equal((await f.call('/api/billing/invoices/'+i.id+'/status',{},a)).status,422);p.amount_idr=9900;p.merchant_id='other';assert.equal((await f.call('/api/billing/invoices/'+i.id+'/status',{},a)).status,422);assert.equal(await memberActive(f.db,a.id),false);
});
test('failed, expired and cancelled transactions leave premium access disabled',async()=>{
  for(const status of ['FAILED','EXPIRED','CANCELLED']){const f=fixture(),a=await f.register(),i=await f.invoice(a);f.state.payments.get(i.order_id).status=status;const r=await f.call('/api/billing/invoices/'+i.id+'/status',{},a);assert.equal(r.status,200);assert.equal((await r.json()).invoice.status,status);assert.equal(await memberActive(f.db,a.id),false)}
});
test('calendar renewal preserves remaining validity and adds 12 months for annual price',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a);await f.paid(a,i);const first=await f.db.prepare('SELECT * FROM subscriptions').first();
  const next=await f.invoice(a,'yearly');await f.paid(a,next);const sub=await f.db.prepare('SELECT * FROM subscriptions').first();assert.equal(sub.last_period_starts_at,first.ends_at);assert.equal(Date.parse(sub.ends_at)>Date.parse(first.ends_at)+360*86400000,true);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM member_entitlements').first()).n,2);
});
test('month-end dates clamp to last day and concurrent different invoices extend twice',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a);await f.paid(a,i);
  f.db.sql.exec("UPDATE subscriptions SET ends_at='2030-01-31T12:34:56.789Z'");
  const more=await Promise.all([f.invoice(a),f.invoice(a)]);for(const x of more)f.state.payments.get(x.order_id).status='PAID';await Promise.all(more.map(x=>f.call('/api/billing/invoices/'+x.id+'/status',{},a)));
  const s=await f.db.prepare('SELECT * FROM subscriptions').first();assert.equal(s.ends_at,'2030-03-28T12:34:56.789Z');assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM payments').first()).n,3);
});
test('expired member restarts at provider paid time; access expires regardless of cached display status',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a);await f.paid(a,i);f.db.sql.exec("UPDATE subscriptions SET ends_at='2020-01-01T00:00:00.000Z'");assert.equal(await memberActive(f.db,a.id),false);
  const next=await f.invoice(a);await f.paid(a,next);const s=await f.db.prepare('SELECT * FROM subscriptions').first();assert.equal(s.starts_at,f.state.payments.get(next.order_id).paid_at);assert.equal(subscriptionState(s),'ACTIVE');
});
test('preview stays public; premium direct URLs and query-mode bypasses require server entitlement',async()=>{
  const f=fixture(),a=await f.register('member'),b=await f.register('other'),i=await f.invoice(a);await f.paid(a,i);
  f.db.sql.exec("INSERT INTO comic_access VALUES('royal-gambler',1,'PREMIUM','[1]',1,'2026-10-26T00:00:00.000Z')");
  const p='/media/comics/royal-gambler/ep001/';assert.equal((await f.call(p+'page-01.jpg')).status,200);
  for(const suffix of ['', '?channel=owner','?channel=beta']){assert.equal((await f.call(p+'page-02.jpg'+suffix,undefined,b)).status,402);const r=await f.call(p+'page-02.jpg'+suffix,undefined,a);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store')}
  assert.equal((await f.call('/comics/royal-gambler/ep001/page-02.jpg',undefined,b)).status,402);assert.equal((await f.call('/comics/royal-gambler/ep001/recovery/strip.b64',undefined,b)).status,402);
  f.db.sql.exec("UPDATE subscriptions SET ends_at='2020-01-01T00:00:00.000Z'");assert.equal((await f.call(p+'page-02.jpg',undefined,a)).status,402);
});
test('progress and favorites are scoped to the session account; reports are admin-only',async()=>{
  const f=fixture(),a=await f.register('reader-a'),b=await f.register('reader-b');
  assert.equal((await f.call('/api/member/progress',{comic_id:'royal-gambler',episode:1,page:2,user_id:b.id},a)).status,200);
  assert.equal((await f.call('/api/member/favorite',{comic_id:'royal-gambler',favorite:true,user_id:b.id},a)).status,200);
  const data=await (await f.call('/api/member/me',undefined,b)).json();assert.equal(data.progress.length,0);assert.equal(data.favorites.length,0);assert.equal((await f.call('/api/admin/billing',undefined,a)).status,401);assert.equal((await f.call('/api/admin/billing/export.csv',undefined,b)).status,401);
});
test('CSRF and cross-origin registration are rejected and login attempts are limited',async()=>{
  const f=fixture(),a=await f.register();assert.equal((await f.call('/api/member/favorite',{comic_id:'royal-gambler',favorite:true},{cookie:a.cookie})).status,403);
  assert.equal((await f.call('/api/member/login',{email:'a@example.invalid',password:'x'}, {},{origin:'https://evil.example'})).status,403);
  let r;for(let n=0;n<11;n++)r=await f.call('/api/admin/billing/session',{key:'bad'});assert.equal(r.status,429);
});
test('finance separates paid from settled, unknown fees from net, refunds and sandbox from production',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a);await f.paid(a,i);let report=await finance(f.db);assert.equal(report.successful_payments,0,'sandbox never counts as production revenue');
  f.db.sql.exec("UPDATE payments SET provider_mode='PRODUCTION'");report=await finance(f.db);assert.equal(report.successful_payments,1);assert.equal(report.gross_idr,9900);assert.equal(report.net_idr,null);assert.equal(report.settled_idr,0);
  f.db.sql.exec("UPDATE payments SET fee_idr=123,refund_idr=200,settlement_status='RECEIVED',settlement_idr=9577,settled_at='2026-10-26T12:00:00.000Z'");report=await finance(f.db);assert.equal(report.net_idr,9577);assert.equal(report.settled_idr,9577);assert.equal(report.refunds_idr,200);assert.match(csv([{order_id:'=HYPERLINK("bad")'}]),/'=HYPERLINK/);
});
test('missing provider credentials blocks invoice creation; sandbox cannot open production billing',async()=>{
  const f=fixture(),a=await f.register();delete f.env.SHOPEEPAY_CLIENT_SECRET;const r=await f.call('/api/billing/invoices',{price_id:'monthly'},a,{'idempotency-key':crypto.randomUUID()});assert.equal(r.status,503);assert.equal(f.state.creates,0);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM invoices').first()).n,0);
  const g=fixture();g.env.BILLING_ENVIRONMENT='PRODUCTION';assert.equal(providerReadiness(g.env,await g.db.prepare('SELECT * FROM billing_settings').first()).ready,false);
});
test('admin changes prices without rewriting code; invoice snapshots and audit trail are retained',async()=>{
  const f=fixture(),a=await f.register(),i=await f.invoice(a);const response=await f.call('/api/admin/billing/session',{key:f.env.AM_STUDIO_ADMIN_KEY});const data=await response.json(),auth={csrf:data.csrf,cookie:response.headers.get('set-cookie').split(';')[0]};
  assert.equal((await f.call('/api/admin/billing/prices',{prices:[{id:'monthly',amount_idr:12000,period_months:1},{id:'yearly',amount_idr:120000,period_months:12}],reason:'Local test of editable prices'},auth)).status,200);
  assert.equal((await f.db.prepare('SELECT amount_idr FROM invoices WHERE id=?').bind(i.id).first()).amount_idr,9900);assert.equal((await f.invoice(a)).amount_idr,12000);assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='MEMBERSHIP_PRICES_UPDATED'").first()).n,1);
});
test('a late status check accepts payment made before expiry and rejects payment made after expiry',async()=>{
  for(const valid of [true,false]){
    const f=fixture(),a=await f.register(),i=await f.invoice(a),now=Date.now();
    const created=new Date(now-120000).toISOString(),expires=new Date(now-60000).toISOString();
    await f.db.prepare("UPDATE invoices SET created_at=?,expires_at=?,status='EXPIRED' WHERE id=?").bind(created,expires,i.id).run();
    Object.assign(f.state.payments.get(i.order_id),{status:'PAID',paid_at:new Date(now-(valid?90000:30000)).toISOString()});
    const r=await f.call('/api/billing/invoices/'+i.id+'/status',{},a);assert.equal(r.status,valid?200:422);assert.equal(await memberActive(f.db,a.id),valid);
  }
});
test('publisher preflight protects premium pages before the upload and keeps the approved preview public',async()=>{
  const f=fixture();const r=await f.call('/api/publisher/access',{comic_id:'royal-gambler',episode:1,visibility:'PREMIUM',preview_pages:[1],preview_verified:true,reason:'Verified premium release and preview plan'}, {},{'x-am-studio-admin-key':f.env.AM_STUDIO_ADMIN_KEY});
  assert.equal(r.status,200);assert.equal((await f.call('/media/comics/royal-gambler/ep001/page-02.jpg')).status,402);assert.equal((await f.call('/media/comics/royal-gambler/ep001/page-01.jpg')).status,200);
});
