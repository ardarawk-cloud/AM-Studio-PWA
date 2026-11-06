import {MemberError,iso,auditStatement} from './membership-auth.js';
import {PLAN_ID,publicInvoice,billingConfig} from './membership-billing.js';

// Original static QRIS sent by the owner on 7 November 2026.
// The EMV payload was decoded and its CRC-16/CCITT (F1B8) checked.
export const NADMO_QRIS_PAYLOAD='00020101021126570011ID.DANA.WWW011893600915303667962402090366796240303UMI51440014ID.CO.QRIS.WWW0215ID10266315714490303UMI5204481453033605802ID5920Nadmo Studio, Konter6008Denpasar6105802256304F1B8';
export const NADMO_QRIS_NMID='ID1026631571449';
export const NADMO_QRIS_MERCHANT='Nadmo Studio, Konter';
export const NADMO_QRIS_TERMINAL='A01';

export function manualQrisReady(settings) {
  return settings?.checkout_enabled===1
    && settings?.provider==='STATIC_QRIS'
    && settings?.merchant_nmid===NADMO_QRIS_NMID
    && settings?.merchant_name===NADMO_QRIS_MERCHANT
    && settings?.qr_type==='STATIC_REFERENCE';
}

export async function makeManualInvoice(db,userId,priceId,key) {
  if(typeof key!=='string'||! /^[a-f0-9-]{36}$/.test(key))throw new MemberError('IDEMPOTENCY_KEY_REQUIRED',400);
  const c=await billingConfig(db);
  if(!manualQrisReady(c.settings))throw new MemberError('QRIS_MANUAL_CHECKOUT_NOT_READY',503);
  const price=c.prices.find(p=>p.id===priceId&&p.enabled===1);
  if(!price)throw new MemberError('PRICE_NOT_AVAILABLE',404);
  const previous=await db.prepare('SELECT * FROM invoices WHERE user_id=? AND idempotency_key=?').bind(userId,key).first();
  if(previous) {
    if(previous.price_id!==priceId||previous.provider!=='STATIC_QRIS')throw new MemberError('IDEMPOTENCY_CONFLICT',409);
    return publicInvoice(previous);
  }
  const now=iso(),record={
    id:crypto.randomUUID(),order_id:'AMQ'+crypto.randomUUID().replaceAll('-',''),
    user_id:userId,plan_id:PLAN_ID,price_id:price.id,amount_idr:price.amount_idr,
    currency:'IDR',period_months:price.period_months,provider:'STATIC_QRIS',
    provider_mode:'PRODUCTION',merchant_id:NADMO_QRIS_NMID,store_id:NADMO_QRIS_TERMINAL,
    status:'PENDING',idempotency_key:key,qr_content:NADMO_QRIS_PAYLOAD,qr_url:null,
    expires_at:new Date(Date.now()+72*3600*1000).toISOString(),
    paid_at:null,created_at:now,updated_at:now
  };
  const cols=Object.keys(record);
  await db.prepare('INSERT OR IGNORE INTO invoices ('+cols.join(',')+') VALUES ('+cols.map(()=>'?').join(',')+')').bind(...cols.map(c=>record[c])).run();
  const result=await db.prepare('SELECT * FROM invoices WHERE user_id=? AND idempotency_key=?').bind(userId,key).first();
  if(!result||result.provider!=='STATIC_QRIS'||result.price_id!==priceId)throw new MemberError('INVOICE_CREATE_CONFLICT',409);
  return publicInvoice(result);
}

export async function submitManualClaim(db,invoice,data) {
  if(invoice.provider!=='STATIC_QRIS')throw new MemberError('MANUAL_QRIS_ONLY',409);
  if(invoice.status!=='PENDING'||Date.parse(invoice.expires_at)<=Date.now())throw new MemberError('INVOICE_NOT_PAYABLE',409);
  const reference=String(data.transaction_reference||'').trim(),name=String(data.payer_name||'').trim(),note=String(data.note||'').trim(),when=Date.parse(data.paid_at);
  if(!/^[A-Za-z0-9._:\/ -]{6,120}$/.test(reference)||name.length>100||note.length>400||!Number.isFinite(when)
    ||when<Date.parse(invoice.created_at)-300000||when>Date.now()+300000
    ||when>Date.parse(invoice.expires_at))throw new MemberError('PAYMENT_CLAIM_INVALID',400);
  const old=await db.prepare('SELECT * FROM manual_qris_claims WHERE invoice_id=?').bind(invoice.id).first();
  if(old) {
    if(old.claimed_reference!==reference||old.claimed_paid_at!==new Date(when).toISOString())throw new MemberError('CLAIM_ALREADY_SUBMITTED',409);
    return {status:old.status,submitted_at:old.created_at};
  }
  const now=iso();
  await db.prepare('INSERT OR IGNORE INTO manual_qris_claims(invoice_id,claimed_reference,claimed_paid_at,payer_name,note,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .bind(invoice.id,reference,new Date(when).toISOString(),name||null,note||null,'SUBMITTED',now,now).run();
  const row=await db.prepare('SELECT * FROM manual_qris_claims WHERE invoice_id=?').bind(invoice.id).first();
  if(!row||row.claimed_reference!==reference)throw new MemberError('CLAIM_ALREADY_SUBMITTED',409);
  return {status:row.status,submitted_at:row.created_at};
}

export async function reviewManualClaim(db,data) {
  const id=String(data.invoice_id||'');
  if(!/^[a-f0-9-]{36}$/.test(id))throw new MemberError('INVOICE_NOT_FOUND',404);
  const action=data.action,reason=String(data.reason||'').trim();
  if(!['APPROVE','REJECT'].includes(action)||reason.length<10||reason.length>500)throw new MemberError('REVIEW_REASON_REQUIRED',400);
  const c=await db.prepare('SELECT c.*,i.user_id,i.order_id,i.amount_idr,i.period_months,i.price_id,i.plan_id,i.status AS invoice_status,i.created_at AS invoice_created_at,i.expires_at AS invoice_expires_at,i.provider FROM manual_qris_claims c JOIN invoices i ON i.id=c.invoice_id WHERE c.invoice_id=?').bind(id).first();
  if(!c||c.provider!=='STATIC_QRIS')throw new MemberError('MANUAL_CLAIM_NOT_FOUND',404);
  if(c.status!=='SUBMITTED'||c.invoice_status!=='PENDING')throw new MemberError('CLAIM_ALREADY_REVIEWED',409);
  const now=iso();
  if(action==='REJECT'){
    await db.batch([
      db.prepare("UPDATE manual_qris_claims SET status='REJECTED',reviewer_reason=?,reviewed_at=?,updated_at=? WHERE invoice_id=? AND status='SUBMITTED'").bind(reason,now,now,id),
      auditStatement(db,'OWNER','MANUAL_QRIS_REJECTED',id,{reference:c.claimed_reference},{status:'REJECTED'},reason)
    ]);
    return {invoice_id:id,status:'REJECTED'};
  }
  // A claim or screenshot is never evidence of settlement by itself.
  // Admin must inspect the merchant's real transaction ledger before approval.
  const reference=String(data.merchant_transaction_id||'').trim(),time=Date.parse(data.merchant_paid_at),amount=data.merchant_amount_idr;
  if(!/^[A-Za-z0-9._:\/ -]{8,120}$/.test(reference)||!Number.isSafeInteger(amount)||amount!==c.amount_idr
    ||!Number.isFinite(time)||time<Date.parse(c.invoice_created_at)-300000
    ||time>Date.now()+300000||time>Date.parse(c.invoice_expires_at))
    throw new MemberError('MERCHANT_SETTLEMENT_EVIDENCE_INVALID',422);
  const paidAt=new Date(time).toISOString(),paymentId=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO payments (id,invoice_id,order_id,user_id,plan_id,period_months,provider,provider_mode,provider_transaction_id,amount_idr,fee_idr,currency,paid_at,created_at)
      SELECT ?,i.id,i.order_id,i.user_id,i.plan_id,i.period_months,'STATIC_QRIS','PRODUCTION',?,i.amount_idr,NULL,'IDR',?,?
      FROM invoices i JOIN manual_qris_claims c ON c.invoice_id=i.id
      WHERE i.id=? AND i.provider='STATIC_QRIS' AND i.status='PENDING' AND c.status='SUBMITTED'`)
       .bind(paymentId,reference,paidAt,now,id),
    db.prepare("UPDATE manual_qris_claims SET status='VERIFIED',verified_provider_reference=?,verified_amount_idr=?,verified_paid_at=?,reviewer_reason=?,reviewed_at=?,updated_at=? WHERE invoice_id=? AND status='SUBMITTED'")
      .bind(reference,amount,paidAt,reason,now,now,id),
    auditStatement(db,'OWNER','MANUAL_QRIS_APPROVED',id,{claimed_reference:c.claimed_reference},{status:'VERIFIED',merchant_transaction_id:reference,amount_idr:amount,paid_at:paidAt},reason)
  ]);
  const payment=await db.prepare('SELECT id FROM payments WHERE id=? AND invoice_id=?').bind(paymentId,id).first();
  if(!payment)throw new MemberError('PAYMENT_REQUIRES_REVIEW',409);
  return {invoice_id:id,status:'VERIFIED',payment_id:payment.id};
}
