import {MemberError,iso,hash,subscriptionState} from './membership-auth.js';
import {providerReadiness} from './shopeepay-qris.js';
export const PLAN_ID='am-studio-comics-member';
export async function billingConfig(db) {
  const settings=await db.prepare('SELECT * FROM billing_settings WHERE id=1').first();
  const plan=await db.prepare('SELECT * FROM membership_plans WHERE id=?').bind(PLAN_ID).first();
  const prices=(await db.prepare('SELECT * FROM membership_prices ORDER BY period_months').all()).results;
  return {settings,plan,prices};
}
export function publicInvoice(i) {
  return Object.fromEntries(['id','order_id','price_id','amount_idr','currency','period_months','provider_mode','status','qr_content','qr_url','expires_at','paid_at','created_at'].map(k=>[k,i[k]]));
}
export async function makeInvoice(db,env,provider,userId,priceId,key) {
  if(!/^[a-zA-Z0-9_-]{16,100}$/.test(String(key||'')))throw new MemberError('IDEMPOTENCY_KEY_REQUIRED');
  const existing=await db.prepare('SELECT * FROM invoices WHERE user_id=? AND idempotency_key=?').bind(userId,key).first();
  if(existing){if(existing.price_id!==priceId)throw new MemberError('IDEMPOTENCY_CONFLICT',409);return publicInvoice(existing)}
  const c=await billingConfig(db), readiness=providerReadiness(env,c.settings);
  if(!readiness.ready)throw new MemberError('QRIS_AUTOMATIC_VERIFICATION_NOT_READY',503);
  const price=c.prices.find(p=>p.id===priceId&&p.enabled);
  if(!price)throw new MemberError('PRICE_NOT_AVAILABLE',404);
  const now=iso(),i={id:crypto.randomUUID(),order_id:'AMC'+crypto.randomUUID().replaceAll('-',''),user_id:userId,plan_id:PLAN_ID,price_id:price.id,amount_idr:price.amount_idr,currency:'IDR',period_months:price.period_months,provider:'SHOPEEPAY',provider_mode:readiness.mode,merchant_id:env.SHOPEEPAY_MERCHANT_ID,store_id:env.SHOPEEPAY_STORE_ID,status:'CREATING',idempotency_key:key,expires_at:new Date(Date.now()+15*60000).toISOString(),created_at:now,updated_at:now};
  const fields=Object.keys(i);
  const inserted=await db.prepare(`INSERT OR IGNORE INTO invoices(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`).bind(...fields.map(k=>i[k])).run();
  if(!inserted.meta.changes)return publicInvoice(await db.prepare('SELECT * FROM invoices WHERE user_id=? AND idempotency_key=?').bind(userId,key).first());
  try{
    const qr=await provider.create(env,i);
    await db.prepare("UPDATE invoices SET qr_content=?,qr_url=?,status=CASE WHEN status='CREATING' THEN 'PENDING' ELSE status END,updated_at=? WHERE id=?").bind(qr.qr_content,qr.qr_url||null,iso(),i.id).run();
  }catch(e){
    // A timeout might follow successful QR creation. Keep the unique invoice so
    // a server-side query can reconcile it rather than silently creating another.
    await db.prepare('INSERT INTO payment_events VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),'SHOPEEPAY',i.id,hash(e.message),'CREATE_UNCONFIRMED','CREATE',0,iso()).run();
    throw e;
  }
  return publicInvoice(await db.prepare('SELECT * FROM invoices WHERE id=?').bind(i.id).first());
}
export function validatePayment(invoice,p) {
  if(p.order_id!==invoice.order_id||p.merchant_id!==invoice.merchant_id||p.store_id!==invoice.store_id||p.currency!=='IDR'||p.amount_idr!==invoice.amount_idr)throw new MemberError('PAYMENT_IDENTITY_OR_AMOUNT_MISMATCH',422);
  if(p.status==='PAID'&&(!p.provider_transaction_id||!p.paid_at||!Number.isFinite(Date.parse(p.paid_at))||Date.parse(p.paid_at)>Date.now()+60000||Date.parse(p.paid_at)<Date.parse(invoice.created_at)-60000||Date.parse(p.paid_at)>Date.parse(invoice.expires_at)))throw new MemberError('PAYMENT_TIME_INVALID_REVIEW_REQUIRED',422);
  if(p.fee_idr!=null&&(!Number.isSafeInteger(p.fee_idr)||p.fee_idr<0))throw new MemberError('PAYMENT_FEE_INVALID',422);
}
export async function reconcile(db,env,provider,invoice,source='STATUS_CHECK',callback=null) {
  if(invoice.provider_mode!==env.SHOPEEPAY_MODE||invoice.merchant_id!==env.SHOPEEPAY_MERCHANT_ID||invoice.store_id!==env.SHOPEEPAY_STORE_ID)throw new MemberError('PROVIDER_CONFIGURATION_MISMATCH',503);
  const p=await provider.query(env,invoice);
  // A successful HTTP/API response is not a successful payment.
  if(p.status==='PAID'||callback)validatePayment(invoice,p);
  if(callback&&(callback.order_id!==p.order_id||callback.provider_transaction_id!==p.provider_transaction_id||callback.amount_idr!==p.amount_idr||callback.merchant_id!==p.merchant_id||callback.store_id!==p.store_id||callback.currency!==p.currency))throw new MemberError('CALLBACK_QUERY_MISMATCH',422);
  const now=iso(),eventHash=callback?.payload_hash||p.payload_hash||hash(JSON.stringify(p));
  const event=db.prepare('INSERT OR IGNORE INTO payment_events VALUES(?,?,?,?,?,?,?,?)').bind(hash(`${invoice.provider_mode}:${source}:${eventHash}`),'SHOPEEPAY',invoice.id,eventHash,p.status,source,1,now);
  if(p.status==='PAID'){
    const old=await db.prepare('SELECT provider_transaction_id FROM payments WHERE invoice_id=?').bind(invoice.id).first();
    if(old&&old.provider_transaction_id!==p.provider_transaction_id)throw new MemberError('PAYMENT_TRANSACTION_CONFLICT',409);
    const owner=await db.prepare('SELECT invoice_id FROM payments WHERE provider=? AND provider_mode=? AND provider_transaction_id=?').bind('SHOPEEPAY',invoice.provider_mode,p.provider_transaction_id).first();
    if(owner&&owner.invoice_id!==invoice.id)throw new MemberError('PAYMENT_TRANSACTION_ALREADY_USED',409);
    await db.batch([event,db.prepare(`INSERT OR IGNORE INTO payments(id,invoice_id,order_id,user_id,plan_id,period_months,provider,provider_mode,provider_transaction_id,amount_idr,fee_idr,currency,paid_at,created_at)
      SELECT ?,id,order_id,user_id,plan_id,period_months,provider,provider_mode,?,amount_idr,?,currency,?,? FROM invoices WHERE id=? AND status IN ('CREATING','PENDING','EXPIRED')`).bind(crypto.randomUUID(),p.provider_transaction_id,p.fee_idr??null,new Date(p.paid_at).toISOString(),now,invoice.id)]);
    const recorded=await db.prepare('SELECT provider_transaction_id FROM payments WHERE invoice_id=?').bind(invoice.id).first();
    if(!recorded||recorded.provider_transaction_id!==p.provider_transaction_id)throw new MemberError('PAYMENT_REQUIRES_REVIEW',409);
  }else{
    const status=['FAILED','CANCELLED','EXPIRED'].includes(p.status)?p.status:Date.parse(invoice.expires_at)<=Date.now()?'EXPIRED':invoice.status;
    await db.batch([event,db.prepare("UPDATE invoices SET status=?,updated_at=? WHERE id=? AND status IN ('PENDING','CREATING','EXPIRED')").bind(status,now,invoice.id)]);
  }
  return publicInvoice(await db.prepare('SELECT * FROM invoices WHERE id=?').bind(invoice.id).first());
}
export async function finance(db) {
  const totals=await db.prepare(`SELECT COUNT(*) AS successful_payments,COALESCE(SUM(amount_idr),0) AS gross_idr,
   COALESCE(SUM(fee_idr),0) AS recorded_provider_fees_idr,COUNT(*)-COUNT(fee_idr) AS payments_with_unknown_fee,
   COALESCE(SUM(refund_idr),0) AS refunds_idr,
   CASE WHEN COUNT(*)=COUNT(fee_idr) THEN COALESCE(SUM(amount_idr-fee_idr-refund_idr),0) ELSE NULL END AS net_idr,
   SUM(CASE WHEN settlement_status='RECEIVED' THEN 1 ELSE 0 END) AS settled_payments,
   COALESCE(SUM(CASE WHEN settlement_status='RECEIVED' THEN settlement_idr ELSE 0 END),0) AS settled_idr,
   SUM(CASE WHEN settlement_status<>'RECEIVED' THEN 1 ELSE 0 END) AS unsettled_payments
   FROM payments WHERE provider_mode='PRODUCTION'`).first();
  const members=await db.prepare("SELECT COALESCE(SUM(CASE WHEN s.ends_at>? AND s.status='ACTIVE' AND u.status='ACTIVE' THEN 1 ELSE 0 END),0) AS active_members,COALESCE(SUM(CASE WHEN s.ends_at<=? OR s.status='REVOKED' OR u.status='DISABLED' THEN 1 ELSE 0 END),0) AS expired_members FROM subscriptions s JOIN users u ON u.id=s.user_id").bind(iso(),iso()).first();
  const monthly=(await db.prepare("SELECT substr(paid_at,1,7) AS month_utc,SUM(amount_idr) AS gross_idr,SUM(refund_idr) AS refunds_idr,CASE WHEN COUNT(*)=COUNT(fee_idr) THEN SUM(amount_idr-fee_idr-refund_idr) ELSE NULL END AS net_idr FROM payments WHERE provider_mode='PRODUCTION' GROUP BY month_utc ORDER BY month_utc DESC LIMIT 36").all()).results;
  return {...totals,...members,monthly,tax_treatment:'NOT_CONFIGURED',net_basis:'Recorded fees and refunds; tax excluded until verified',timezone:'UTC'};
}
export function csv(rows) {
  const fields=['order_id','provider','provider_mode','provider_transaction_id','amount_idr','fee_idr','refund_idr','currency','paid_at','settlement_status','settlement_idr','settled_at','settlement_reference'];
  const cell=v=>{let s=v==null?'':String(v);if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
  return '\uFEFF'+[fields.map(cell).join(','),...rows.map(r=>fields.map(f=>cell(r[f])).join(','))].join('\r\n');
}
