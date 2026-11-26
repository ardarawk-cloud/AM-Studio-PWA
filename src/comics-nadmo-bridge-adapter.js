import {createHmac,timingSafeEqual} from 'node:crypto';
import {MemberError,iso} from './membership-auth.js';
import {reviewManualClaim,NADMO_QRIS_NMID} from './static-qris.js';
import {ensureAiReceiptTable} from './comics-ai-admin.js';

// Adapter for the EXISTING NADMO Payment Bridge. It is not a new bridge.
// A customer screenshot, or an unsigned phone notification, cannot settle a payment.
function bridgeReady(env){
  return !!(env.NADMO_PAYMENT_BRIDGE_SECRET&&env.NADMO_BRIDGE_DEVICE_ID&&env.NADMO_BRIDGE_PACKAGE);
}
export function verifyBridgeSignature(env,headers,raw,now=Date.now()){
  if(!bridgeReady(env))throw new MemberError('NADMO_PAYMENT_BRIDGE_NOT_CONFIGURED',503);
  const stamp=headers.get('x-nadmo-bridge-timestamp'),sig=headers.get('x-nadmo-bridge-signature');
  const ms=Date.parse(stamp||'');
  if(!Number.isFinite(ms)||Math.abs(ms-now)>300000||!/^[a-f0-9]{64}$/i.test(sig||''))throw new MemberError('BRIDGE_SIGNATURE_INVALID',401);
  const expected=createHmac('sha256',env.NADMO_PAYMENT_BRIDGE_SECRET).update(stamp+'.'+raw).digest();
  const actual=Buffer.from(sig,'hex');
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw new MemberError('BRIDGE_SIGNATURE_INVALID',401);
}
export async function ensureBridgeTable(db){
  await db.prepare("CREATE TABLE IF NOT EXISTS nadmo_bridge_events (event_id TEXT PRIMARY KEY, merchant_transaction_id TEXT NOT NULL UNIQUE, amount_idr INTEGER NOT NULL, paid_at TEXT NOT NULL, merchant_nmid TEXT NOT NULL, app_package TEXT NOT NULL, device_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('PENDING_AI','MATCHED','REVIEW_REQUIRED')), invoice_id TEXT REFERENCES invoices(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
}
function cleanRef(s){return String(s||'').trim();}
function validateBridgeEvent(env,b){
  const allowedPackages=String(env.NADMO_BRIDGE_PACKAGE||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(!b||typeof b!=='object'||b.device_id!==env.NADMO_BRIDGE_DEVICE_ID||!allowedPackages.includes(b.package_name)
     ||b.merchant_nmid!==NADMO_QRIS_NMID||b.payment_status!=='SUCCESS'
     ||!/^[a-zA-Z0-9._:-]{8,120}$/.test(b.event_id||'')
     ||!/^[a-zA-Z0-9._:/ -]{8,120}$/.test(b.transaction_reference||'')
     ||!Number.isSafeInteger(b.amount_idr)||b.amount_idr<1||b.amount_idr>100000000
     ||!Number.isFinite(Date.parse(b.paid_at)))throw new MemberError('BRIDGE_EVENT_INVALID',422);
  const t=Date.parse(b.paid_at);
  if(t>Date.now()+300000||t<Date.now()-7*86400000)throw new MemberError('BRIDGE_PAYMENT_TIME_INVALID',422);
  return {event_id:b.event_id,transaction_reference:cleanRef(b.transaction_reference),amount_idr:b.amount_idr,
    paid_at:new Date(t).toISOString(),merchant_nmid:b.merchant_nmid,package_name:b.package_name,device_id:b.device_id};
}
export async function attemptAiAutoSettlement(db,event) {
  if(!event||event.status==='MATCHED'||event.status==='REVIEW_REQUIRED')return {status:event?.status||'MISSING'};
  await ensureAiReceiptTable(db);
  // No AI screenshot -> no claim of settlement. Exact reference is mandatory.
  const candidates=(await db.prepare("SELECT i.id,i.amount_idr,i.created_at,i.expires_at,i.status,c.claimed_paid_at,a.status AS ai_status FROM invoices i JOIN manual_qris_claims c ON c.invoice_id=i.id JOIN receipt_ai_reviews a ON a.invoice_id=i.id WHERE i.provider='STATIC_QRIS' AND i.status IN ('PENDING','EXPIRED') AND c.status='SUBMITTED' AND c.claimed_reference=? AND i.merchant_id=? AND i.amount_idr=? AND a.status='AI_CONSISTENT_NOT_VERIFIED'")
    .bind(event.merchant_transaction_id,event.merchant_nmid,event.amount_idr).all()).results;
  const matching=candidates.filter(x=>{
    const paid=Date.parse(event.paid_at);
    return paid>=Date.parse(x.created_at)-300000&&paid<=Date.parse(x.expires_at)&&Math.abs(paid-Date.parse(x.claimed_paid_at))<=15*60000;
  });
  if(matching.length!==1) {
    if(matching.length>1) {
      await db.prepare("UPDATE nadmo_bridge_events SET status='REVIEW_REQUIRED',updated_at=? WHERE event_id=? AND status='PENDING_AI'").bind(iso(),event.event_id).run();
      return {status:'REVIEW_REQUIRED'};
    }
    return {status:'PENDING_AI'};
  }
  const invoice_id=matching[0].id;
  try {
    await reviewManualClaim(db,{invoice_id,action:'APPROVE',merchant_transaction_id:event.merchant_transaction_id,merchant_amount_idr:event.amount_idr,merchant_paid_at:event.paid_at,reason:'AI Admin: signed NADMO merchant bridge event '+event.event_id},'AI_ADMIN_BRIDGE');
    await db.prepare("UPDATE nadmo_bridge_events SET status='MATCHED',invoice_id=?,updated_at=? WHERE event_id=?").bind(invoice_id,iso(),event.event_id).run();
    return {status:'MATCHED',invoice_id};
  }catch(e){
    if(e instanceof MemberError&&e.message==='CLAIM_ALREADY_REVIEWED')return {status:'PENDING_AI'};
    throw e;
  }
}
export async function receiveBridgeEvent(db,env,headers,raw){
  if(typeof raw!=='string'||raw.length>4096)throw new MemberError('BRIDGE_PAYLOAD_TOO_LARGE',413);
  verifyBridgeSignature(env,headers,raw);
  let b;try{b=JSON.parse(raw)}catch{throw new MemberError('BRIDGE_JSON_INVALID',400)}
  const ev=validateBridgeEvent(env,b);
  await ensureBridgeTable(db);
  const now=iso();
  await db.prepare("INSERT OR IGNORE INTO nadmo_bridge_events(event_id,merchant_transaction_id,amount_idr,paid_at,merchant_nmid,app_package,device_id,status,invoice_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'PENDING_AI',NULL,?,?)")
    .bind(ev.event_id,ev.transaction_reference,ev.amount_idr,ev.paid_at,ev.merchant_nmid,ev.package_name,ev.device_id,now,now).run();
  const saved=await db.prepare('SELECT * FROM nadmo_bridge_events WHERE event_id=? OR merchant_transaction_id=? LIMIT 1').bind(ev.event_id,ev.transaction_reference).first();
  if(!saved||saved.event_id!==ev.event_id||saved.amount_idr!==ev.amount_idr||saved.paid_at!==ev.paid_at)throw new MemberError('BRIDGE_TRANSACTION_CONFLICT',409);
  return attemptAiAutoSettlement(db,saved);
}
export async function reconcileAiClaim(db,invoiceId) {
  await ensureBridgeTable(db);
  const claim=await db.prepare('SELECT claimed_reference FROM manual_qris_claims WHERE invoice_id=? AND status=\'SUBMITTED\'').bind(invoiceId).first();
  if(!claim)return {status:'NO_CLAIM'};
  const ev=await db.prepare("SELECT * FROM nadmo_bridge_events WHERE merchant_transaction_id=? AND status='PENDING_AI'").bind(claim.claimed_reference).first();
  return ev?attemptAiAutoSettlement(db,ev):{status:'WAITING_FOR_BRIDGE'};
}
