import base from './play-firewall-runtime.js';
import qrcode from 'qrcode-generator';
import {MemberError,iso,hash,equal,json,bodyJson,sameOrigin,rate,passwordHash,passwordValid,newSession,session,optionalMember,auditStatement,subscriptionState,sessionCookie} from './membership-auth.js';
import {billingConfig,makeInvoice,reconcile,finance,csv} from './membership-billing.js';
import {shopeepay,providerReadiness,CALLBACK_PATH} from './shopeepay-qris.js';
import {protectAsset,mayRead,configureAccess,publisherPolicy,membershipServiceWorker} from './membership-access.js';
import {memberDocument,readerClient} from './membership-ui.js';
import growthConfig from '../public/growth-config.json' with {type:'json'};

const PAGES=new Set(['/membership','/register','/login','/checkout','/payment-status','/member','/member/history','/admin/billing','/membership/terms','/membership/privacy','/membership/refund']);
const publicUser=s=>({id:s.user_id,email:s.email,name:s.name,timezone:s.timezone});
const validComic=id=>/^[a-z0-9-]{1,80}$/.test(String(id||''));
function reason(body) {if(typeof body.reason!=='string'||body.reason.trim().length<10)throw new MemberError('AUDIT_REASON_REQUIRED');return body.reason.trim()}
async function admin(db,req,mutate=false) {return session(db,req,'ADMIN',mutate)}
async function ownInvoice(db,req,id,mutate=false) {
  const s=await session(db,req,'MEMBER',mutate);
  const i=await db.prepare('SELECT * FROM invoices WHERE id=? AND user_id=?').bind(id,s.user_id).first();
  if(!i)throw new MemberError('INVOICE_NOT_FOUND',404);return {s,i};
}
async function readRaw(req,max) {
  const reader=req.body?.getReader();if(!reader)throw new MemberError('EMPTY_REQUEST');
  const chunks=[];let size=0;
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new MemberError('REQUEST_TOO_LARGE',413)}chunks.push(value)}
  const result=new Uint8Array(size);let i=0;for(const c of chunks){result.set(c,i);i+=c.length}return new TextDecoder().decode(result);
}

export function createMembershipWorker(legacy=base,provider=shopeepay) {
  return {
    async fetch(req,env,ctx) {
      const url=new URL(req.url),path=url.pathname.replace(/\/$/,'')||'/',method=req.method,db=env.MEMBERSHIP_DB;
      try{
        if(PAGES.has(path)&&method==='GET')return memberDocument(path);
        if(['/privacy-policy','/privacy-policy.html'].includes(path)&&method==='GET')return memberDocument('/membership/privacy');
        if(path==='/growth-config.json'&&method==='GET')return json(growthConfig);
        if(path==='/membership-reader.js'&&method==='GET')return new Response(readerClient,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'}});
        if(path==='/sw.js'&&method==='GET')return new Response(membershipServiceWorker,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store','service-worker-allowed':'/'}});
        const isApi=path.startsWith('/api/member/')||path.startsWith('/api/membership')||path.startsWith('/api/admin/billing')||path.startsWith('/api/billing/')||path.startsWith('/api/publisher/access');
        if(isApi&&!db)throw new MemberError('MEMBERSHIP_DATABASE_UNAVAILABLE',503);
        if(path==='/api/membership'&&method==='GET') {
          const c=await billingConfig(db),r=providerReadiness(env,c.settings);
          return json({ok:true,plan:c.plan,prices:c.prices.filter(p=>p.enabled),currency:'IDR',payment_method:'QRIS',checkout_available:r.ready,payment_status:r.ready?'AVAILABLE':'PREPARING',renewal:'MANUAL_QRIS',legal_version:c.settings.legal_version});
        }
        if(path==='/api/membership/health'&&method==='GET') {
          const c=await billingConfig(db),r=providerReadiness(env,c.settings);
          return json({ok:true,membership:'ACCOUNT_AND_BILLING_CORE',database:'READY',payment_method:'QRIS',provider:'SHOPEEPAY',checkout_available:r.ready,automatic_activation:r.ready?'AWAITING_END_TO_END_VERIFICATION':'BLOCKED_PROVIDER_SETUP',legacy_content:'UNCHANGED_UNLESS_EXPLICITLY_VERIFIED'});
        }
        if(['/api/member/register','/api/member/login'].includes(path)&&method==='POST') {
          sameOrigin(req);await rate(db,req,'auth-ip',20);
          const b=await bodyJson(req),email=String(b.email||'').trim().toLowerCase();
          if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||typeof b.password!=='string'||b.password.length>128)throw new MemberError('CREDENTIALS_INVALID');
          await rate(db,req,'auth-email',10,600000,hash(email));
          let user;
          if(path.endsWith('/register')) {
            const c=await billingConfig(db),name=String(b.name||'').trim();
            if(b.accept_terms!==true||b.terms_version!==c.settings.legal_version)throw new MemberError('TERMS_ACCEPTANCE_REQUIRED');
            if(name.length<1||name.length>100)throw new MemberError('NAME_INVALID');
            const timezone=String(b.timezone||'Asia/Makassar');try{new Intl.DateTimeFormat('id-ID',{timeZone:timezone})}catch{throw new MemberError('TIMEZONE_INVALID')}
            const id=crypto.randomUUID(),pw=await passwordHash(b.password),now=iso();
            const r=await db.prepare('INSERT OR IGNORE INTO users(id,email,name,password_hash,timezone,terms_version,terms_accepted_at,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,email,name,pw,timezone,b.terms_version,now,now).run();
            if(!r.meta.changes)throw new MemberError('REGISTRATION_UNAVAILABLE_USE_LOGIN',409);
            user={id,email,name,timezone};
          }else{
            user=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
            // Also perform the password KDF for an unknown email to limit account enumeration.
            const fallback='scrypt$32768$8$3$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000';
            const valid=await passwordValid(b.password,user?.password_hash||fallback);
            if(!valid||!user||user.status!=='ACTIVE')throw new MemberError('EMAIL_OR_PASSWORD_INVALID',401);
          }
          const s=await newSession(db,user.id);
          return json({ok:true,user:{id:user.id,email:user.email,name:user.name,timezone:user.timezone},csrf:s.csrf},200,{'set-cookie':s.cookie});
        }
        if(path==='/api/admin/billing/session'&&method==='POST') {
          sameOrigin(req);await rate(db,req,'admin-login',5);
          const b=await bodyJson(req);
          if(!env.AM_STUDIO_ADMIN_KEY||typeof b.key!=='string'||!equal(b.key,env.AM_STUDIO_ADMIN_KEY))throw new MemberError('ADMIN_AUTH_REQUIRED',401);
          const s=await newSession(db,null,'ADMIN');
          return json({ok:true,csrf:s.csrf},200,{'set-cookie':s.cookie});
        }
        if(path==='/api/member/logout'&&method==='POST') {
          let s;try{s=await session(db,req,'MEMBER',true)}catch(e){if(e.status!==401)throw e;s=await admin(db,req,true)}
          await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.token_hash).run();
          return json({ok:true},200,{'set-cookie':sessionCookie('',0)});
        }
        if(path==='/api/member/me'&&method==='GET') {
          const s=await session(db,req),subscription=await db.prepare('SELECT * FROM subscriptions WHERE user_id=?').bind(s.user_id).first();
          const progress=(await db.prepare('SELECT comic_id,episode,page,updated_at FROM reading_progress WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').bind(s.user_id).all()).results;
          const favorites=(await db.prepare('SELECT comic_id FROM favorites WHERE user_id=? ORDER BY created_at DESC').bind(s.user_id).all()).results;
          return json({ok:true,user:publicUser(s),csrf:s.csrf,subscription:subscription?{...subscription,display_status:subscriptionState(subscription)}:null,progress,favorites});
        }
        if(path==='/api/member/history'&&method==='GET') {
          const s=await session(db,req);
          const history=(await db.prepare('SELECT i.id,i.order_id,i.amount_idr,i.period_months,i.currency,i.status,i.created_at,i.paid_at,p.provider_transaction_id,p.refund_idr,e.starts_at,e.ends_at FROM invoices i LEFT JOIN payments p ON p.invoice_id=i.id LEFT JOIN member_entitlements e ON e.invoice_id=i.id WHERE i.user_id=? ORDER BY i.created_at DESC LIMIT 200').bind(s.user_id).all()).results;
          return json({ok:true,history});
        }
        if(path==='/api/member/access'&&method==='GET') {
          const id={comic_id:url.searchParams.get('comic_id'),episode:Number(url.searchParams.get('episode')),page:Number(url.searchParams.get('page'))};
          if(!validComic(id.comic_id)||!Number.isInteger(id.episode)||id.episode<1||!Number.isInteger(id.page)||id.page<1)throw new MemberError('ACCESS_REQUEST_INVALID');
          const decision=await mayRead(db,req,id);return json({ok:decision.allowed,...decision},decision.allowed?200:402);
        }
        if(path==='/api/member/progress'&&method==='POST') {
          const s=await session(db,req,'MEMBER',true),b=await bodyJson(req);
          if(!validComic(b.comic_id)||!Number.isInteger(b.episode)||b.episode<1||b.episode>999||!Number.isInteger(b.page)||b.page<1||b.page>999)throw new MemberError('READING_PROGRESS_INVALID');
          if(!(await mayRead(db,req,b)).allowed)throw new MemberError('MEMBERSHIP_REQUIRED',402);
          const registryResponse=await legacy.fetch(new Request(new URL('/reader-assets.json',req.url)),env,ctx),registry=await registryResponse.json();
          const episode=registry.episodes?.find(e=>e.seriesId===b.comic_id&&Number(e.episode)===b.episode);
          if(!episode||b.page>episode.pageCount)throw new MemberError('READER_PAGE_NOT_FOUND',404);
          await db.prepare('INSERT INTO reading_progress VALUES(?,?,?,?,?) ON CONFLICT(user_id,comic_id,episode) DO UPDATE SET page=excluded.page,updated_at=excluded.updated_at').bind(s.user_id,b.comic_id,b.episode,b.page,iso()).run();
          return json({ok:true});
        }
        if(path==='/api/member/favorite'&&method==='POST') {
          const s=await session(db,req,'MEMBER',true),b=await bodyJson(req);
          if(!validComic(b.comic_id)||typeof b.favorite!=='boolean')throw new MemberError('FAVORITE_INVALID');
          const cr=await legacy.fetch(new Request(new URL('/catalog.json',req.url)),env,ctx),c=await cr.json();
          if(!c.series?.some(x=>x.id===b.comic_id))throw new MemberError('COMIC_NOT_FOUND',404);
          await (b.favorite?db.prepare('INSERT OR IGNORE INTO favorites VALUES(?,?,?)').bind(s.user_id,b.comic_id,iso()):db.prepare('DELETE FROM favorites WHERE user_id=? AND comic_id=?').bind(s.user_id,b.comic_id)).run();
          return json({ok:true});
        }
        if(path==='/api/billing/invoices'&&method==='POST') {
          const s=await session(db,req,'MEMBER',true);await rate(db,req,'invoice',8,600000,s.user_id);
          const b=await bodyJson(req),invoice=await makeInvoice(db,env,provider,s.user_id,b.price_id,req.headers.get('idempotency-key'));
          return json({ok:true,invoice});
        }
        const match=path.match(/^\/api\/billing\/invoices\/([a-f0-9-]{36})(?:\/(status|qr))?$/);
        if(match) {
          if(match[2]==='status'&&method==='POST') {
            const {s,i}=await ownInvoice(db,req,match[1],true);await rate(db,req,'payment-status',30,600000,s.user_id);
            const c=await billingConfig(db);if(!providerReadiness(env,c.settings).ready)throw new MemberError('PROVIDER_NOT_READY',503);
            return json({ok:true,invoice:await reconcile(db,env,provider,i)});
          }
          if(match[2]==='qr'&&method==='GET') {
            const {i}=await ownInvoice(db,req,match[1]);
            if(i.status!=='PENDING'||Date.parse(i.expires_at)<=Date.now()||!i.qr_content)throw new MemberError('QRIS_NOT_AVAILABLE',409);
            const qr=qrcode(0,'M');qr.addData(i.qr_content);qr.make();
            return new Response(qr.createSvgTag({cellSize:5,margin:20,scalable:true}),{headers:{'content-type':'image/svg+xml','cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"}});
          }
          if(!match[2]&&method==='GET'){const {i}=await ownInvoice(db,req,match[1]);const {publicInvoice}=await import('./membership-billing.js');return json({ok:true,invoice:publicInvoice(i)})}
        }
        if(path===CALLBACK_PATH&&method==='POST') {
          const c=await billingConfig(db);if(!providerReadiness(env,c.settings).ready)throw new MemberError('PROVIDER_NOT_READY',503);
          const raw=await readRaw(req,32768),callback=await provider.verifyCallback(env,req,raw);
          const i=await db.prepare('SELECT * FROM invoices WHERE order_id=?').bind(callback.order_id).first();
          if(!i)throw new MemberError('INVOICE_NOT_FOUND',404);
          if(callback.merchant_id!==i.merchant_id||callback.store_id!==i.store_id||callback.amount_idr!==i.amount_idr||callback.currency!==i.currency)throw new MemberError('WEBHOOK_TRANSACTION_MISMATCH',422);
          await reconcile(db,env,provider,i,'WEBHOOK',callback);
          return json({responseCode:'2005600',responseMessage:'Successful'});
        }
        if(path==='/api/admin/billing'&&method==='GET') {
          const s=await admin(db,req),config=await billingConfig(db);
          const invoices=(await db.prepare('SELECT id,order_id,user_id,amount_idr,status,provider_mode,created_at FROM invoices ORDER BY created_at DESC LIMIT 200').all()).results;
          const members=(await db.prepare('SELECT u.id,u.name,u.email,u.status,u.created_at,s.starts_at,s.ends_at,s.status AS subscription_status FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id ORDER BY u.created_at DESC LIMIT 200').all()).results;
          const payments=(await db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 200').all()).results;
          const events=(await db.prepare('SELECT * FROM payment_events ORDER BY received_at DESC LIMIT 100').all()).results;
          const audits=(await db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100').all()).results;
          const policies=(await db.prepare('SELECT * FROM comic_access ORDER BY comic_id,episode').all()).results;
          return json({ok:true,csrf:s.csrf,config,readiness:providerReadiness(env,config.settings),finance:await finance(db),members,invoices,payments,events,audits,policies});
        }
        if(path==='/api/admin/billing/prices'&&method==='POST') {
          await admin(db,req,true);const b=await bodyJson(req),why=reason(b),before=await billingConfig(db);
          if(!Array.isArray(b.prices)||b.prices.length!==2||new Set(b.prices.map(p=>p.id)).size!==2||b.prices.some(p=>!['monthly','yearly'].includes(p.id)||!Number.isSafeInteger(p.amount_idr)||p.amount_idr<1||p.amount_idr>100000000||!Number.isInteger(p.period_months)||p.period_months<1||p.period_months>36))throw new MemberError('PRICES_INVALID');
          await db.batch([...b.prices.map(p=>db.prepare('UPDATE membership_prices SET amount_idr=?,period_months=?,updated_at=? WHERE id=?').bind(p.amount_idr,p.period_months,iso(),p.id)),auditStatement(db,'OWNER','MEMBERSHIP_PRICES_UPDATED','plan',before.prices,b.prices,why)]);
          return json({ok:true});
        }
        if(path==='/api/admin/billing/access'&&method==='POST') {
          await admin(db,req,true);const b=await bodyJson(req);
          return json({ok:true,policy:await configureAccess(db,b,'OWNER',legacy,req,env,ctx)});
        }
        if(path==='/api/publisher/access'&&method==='POST') {
          if(!env.AM_STUDIO_ADMIN_KEY||!equal(req.headers.get('x-am-studio-admin-key')||'',env.AM_STUDIO_ADMIN_KEY))throw new MemberError('ADMIN_AUTH_REQUIRED',401);
          const b=await bodyJson(req);
          // Premium policy is established before the first page upload, closing
          // the interval in which a new unlisted object could otherwise be read.
          return json({ok:true,policy:await configureAccess(db,b,'PUBLISHER_PREFLIGHT',legacy,req,env,ctx,true)});
        }
        if(path==='/api/admin/billing/member'&&method==='POST') {
          await admin(db,req,true);const b=await bodyJson(req),why=reason(b),u=await db.prepare('SELECT id,status FROM users WHERE id=?').bind(String(b.user_id||'')).first();
          if(!u||!['ACTIVE','DISABLED'].includes(b.status))throw new MemberError('MEMBER_UPDATE_INVALID');
          await db.batch([db.prepare('UPDATE users SET status=? WHERE id=?').bind(b.status,u.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),auditStatement(db,'OWNER','MEMBER_STATUS_UPDATED',u.id,u,{status:b.status},why)]);
          return json({ok:true});
        }
        if(path==='/api/admin/billing/correction'&&method==='POST') {
          await admin(db,req,true);const b=await bodyJson(req),why=reason(b);
          const before=await db.prepare('SELECT * FROM subscriptions WHERE user_id=?').bind(String(b.user_id||'')).first();
          if(!before||!Number.isFinite(Date.parse(b.ends_at))||!['ACTIVE','REVOKED'].includes(b.status))throw new MemberError('SUBSCRIPTION_CORRECTION_INVALID');
          const end=new Date(b.ends_at).toISOString();if(end<before.starts_at)throw new MemberError('SUBSCRIPTION_DATES_INVALID');
          await db.batch([db.prepare('UPDATE subscriptions SET ends_at=?,status=?,updated_at=? WHERE user_id=?').bind(end,b.status,iso(),before.user_id),auditStatement(db,'OWNER','SUBSCRIPTION_CORRECTED',before.user_id,before,{ends_at:end,status:b.status},why)]);
          return json({ok:true});
        }
        if(path==='/api/admin/billing/reconciliation'&&method==='POST') {
          await admin(db,req,true);const b=await bodyJson(req),why=reason(b),p=await db.prepare('SELECT * FROM payments WHERE id=?').bind(String(b.payment_id||'')).first();
          if(!p)throw new MemberError('PAYMENT_NOT_FOUND',404);
          const fee=b.fee_idr,refund=b.refund_idr,settlement=b.settlement_idr,status=b.settlement_status;
          if(fee!==null&&(!Number.isSafeInteger(fee)||fee<0)||!Number.isSafeInteger(refund)||refund<0||refund>p.amount_idr||!['UNKNOWN','PENDING','RECEIVED'].includes(status))throw new MemberError('RECONCILIATION_INVALID');
          if(status==='RECEIVED'&&(!Number.isSafeInteger(settlement)||settlement<0||typeof b.reference!=='string'||b.reference.trim().length<6||!Number.isFinite(Date.parse(b.settled_at))))throw new MemberError('SETTLEMENT_EVIDENCE_REQUIRED');
          const after={fee_idr:fee,refund_idr:refund,settlement_status:status,settlement_idr:status==='RECEIVED'?settlement:null,settled_at:status==='RECEIVED'?new Date(b.settled_at).toISOString():null,settlement_reference:String(b.reference||'').slice(0,250)};
          await db.batch([db.prepare("UPDATE payments SET fee_idr=?,refund_idr=?,settlement_status=?,settlement_idr=?,settled_at=?,settlement_reference=?,status=CASE WHEN ?=amount_idr THEN 'REFUNDED' WHEN ?>0 THEN 'PARTIALLY_REFUNDED' ELSE 'PAID' END WHERE id=?").bind(...Object.values(after),refund,refund,p.id),auditStatement(db,'OWNER','FINANCE_RECONCILIATION',p.id,p,after,why)]);
          return json({ok:true,notice:'Records reconciliation only; does not initiate refunds or transfers.'});
        }
        if(path==='/api/admin/billing/export.csv'&&method==='GET') {
          await admin(db,req);const rows=(await db.prepare('SELECT * FROM payments ORDER BY paid_at').all()).results;
          return new Response(csv(rows),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="am-studio-comics-finance.csv"','cache-control':'no-store, private'}});
        }
        if(isApi)return json({ok:false,error:'MEMBERSHIP_ROUTE_NOT_FOUND'},404);
        const gate=await protectAsset(req,env);if(gate instanceof Response)return gate;
        if(db)await publisherPolicy(req,env,legacy,ctx);
        const response=await legacy.fetch(req,env,ctx);
        if(method==='GET'&&path==='/catalog.json'&&response.ok) {
          const data=await response.json();data.studio={...(data.studio||{}),pass:{name:'AM STUDIO Comics Member',status:'ACCOUNT_READY_PROVIDER_PENDING',membershipUrl:'/membership'}};
          return json(data);
        }
        if(gate?.premium) {const h=new Headers(response.headers);h.set('cache-control','private, no-store');h.set('vary','Cookie');h.delete('etag');return new Response(method==='HEAD'?null:response.body,{status:response.status,headers:h})}
        if(method==='GET'&&(path==='/'||path==='/index.html')&&response.ok&&response.headers.get('content-type')?.includes('text/html')) {
          const html=await response.text(),extra='<script src="/membership-reader.js?v=1" defer></script>',h=new Headers(response.headers);
          h.set('cache-control','private, no-store');h.delete('content-length');return new Response(html.replace('</body>',extra+'</body>'),{status:response.status,headers:h});
        }
        return response;
      }catch(e){
        if(e instanceof MemberError)return json({ok:false,error:e.message},e.status);
        console.error(JSON.stringify({event:'MEMBERSHIP_REQUEST_ERROR',path,code:e?.name||'Error'}));
        return json({ok:false,error:'MEMBERSHIP_TEMPORARILY_UNAVAILABLE'},503);
      }
    },
    async scheduled(controller,env,ctx) {
      if(legacy.scheduled)await legacy.scheduled(controller,env,ctx);
      if(!env.MEMBERSHIP_DB)return;
      const db=env.MEMBERSHIP_DB,now=iso();
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO member_notifications(id,user_id,type,reference,created_at) SELECT 'exp_'||user_id||'_'||ends_at,user_id,'EXPIRING',ends_at,? FROM subscriptions WHERE status='ACTIVE' AND ends_at>? AND ends_at<=?").bind(now,now,new Date(Date.now()+7*86400000).toISOString()),
        db.prepare("INSERT OR IGNORE INTO member_notifications(id,user_id,type,reference,created_at) SELECT 'expired_'||user_id||'_'||ends_at,user_id,'EXPIRED',ends_at,? FROM subscriptions WHERE status='ACTIVE' AND ends_at<=?").bind(now,now),
        db.prepare("UPDATE invoices SET status='EXPIRED',updated_at=? WHERE status IN ('PENDING','CREATING') AND expires_at<=?").bind(now,now),
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),db.prepare('DELETE FROM auth_limits WHERE expires_at<?').bind(Date.now())
      ]);
    }
  };
}
export default createMembershipWorker();
