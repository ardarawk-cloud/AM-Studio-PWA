import {createHash,createHmac,sign,verify,randomBytes} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {MemberError,iso,bodyJson} from './membership-auth.js';

export const CALLBACK_PATH='/api/billing/shopeepay/v1.0/qr/qr-mpm-notify';
const required=['SHOPEEPAY_CLIENT_ID','SHOPEEPAY_CLIENT_SECRET','SHOPEEPAY_PRIVATE_KEY','SHOPEEPAY_PUBLIC_KEY','SHOPEEPAY_MERCHANT_ID','SHOPEEPAY_STORE_ID','SHOPEEPAY_BASE_URL','SHOPEEPAY_CALLBACK_URL'];
export function providerReadiness(env,settings) {
  const missing=required.filter(k=>!env[k]);
  const mode=settings?.api_mode||'DISABLED';
  const modeVerified=mode==='PRODUCTION'?env.SHOPEEPAY_PRODUCTION_VERIFIED==='true':mode==='SANDBOX'&&env.SHOPEEPAY_SANDBOX_VERIFIED==='true';
  return {provider:'SHOPEEPAY',mode,ready:!!(settings?.checkout_enabled&&settings?.legal_entity_status==='VERIFIED'&&env.BILLING_ENVIRONMENT===mode&&env.SHOPEEPAY_MODE===mode&&modeVerified&&!missing.length),missing,merchantStatus:settings?.merchant_status||'API_UNVERIFIED'};
}
export function parseIdr(amount) {
  const s=String(amount??'');if(!/^(0|[1-9]\d*)(?:\.00)?$/.test(s))throw new MemberError('PROVIDER_AMOUNT_INVALID',422);
  const n=Number(s);if(!Number.isSafeInteger(n)||n<=0)throw new MemberError('PROVIDER_AMOUNT_INVALID',422);return n;
}
const digest=s=>createHash('sha256').update(s).digest('hex');
function baseUrl(env) {
  const u=new URL(env.SHOPEEPAY_BASE_URL);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!/(^|\.)(shopeepay\.(co\.id|com)|airpay\.co\.id)$/.test(u.hostname))throw new MemberError('PROVIDER_HOST_INVALID',503);
  return u.origin;
}
async function post(env,path,body,headers) {
  const r=await fetch(baseUrl(env)+path,{method:'POST',headers:{'content-type':'application/json',...headers},body,redirect:'error',signal:AbortSignal.timeout(15000)});
  // Responses are bounded; QR contents and identifiers do not need a large body.
  const result=await bodyJson(r,65536);
  if(!r.ok||!String(result.responseCode||'').startsWith('200'))throw new MemberError('PROVIDER_REQUEST_FAILED',502);
  return result;
}
async function accessToken(env) {
  const timestamp=iso(),sig=sign('RSA-SHA256',Buffer.from(`${env.SHOPEEPAY_CLIENT_ID}|${timestamp}`),env.SHOPEEPAY_PRIVATE_KEY).toString('base64');
  const data=await post(env,'/v1.0/access-token/b2b',JSON.stringify({grantType:'client_credentials'}),{'X-TIMESTAMP':timestamp,'X-CLIENT-KEY':env.SHOPEEPAY_CLIENT_ID,'X-SIGNATURE':sig});
  if(typeof data.accessToken!=='string'||!data.accessToken)throw new MemberError('PROVIDER_TOKEN_INVALID',502);return data.accessToken;
}
async function transaction(env,path,data) {
  const access=await accessToken(env),timestamp=iso(),body=JSON.stringify(data);
  const toSign=`POST:${path}:${access}:${digest(body)}:${timestamp}`;
  const signature=createHmac('sha512',env.SHOPEEPAY_CLIENT_SECRET).update(toSign).digest('base64');
  const external=BigInt('0x'+randomBytes(15).toString('hex')).toString().padStart(36,'0');
  return post(env,path,body,{'X-TIMESTAMP':timestamp,'X-PARTNER-ID':env.SHOPEEPAY_CLIENT_ID,'X-EXTERNAL-ID':external,'X-SIGNATURE':signature,'CHANNEL-ID':'mweb',authorization:`Bearer ${access}`});
}
export const shopeepay={
  async create(env,invoice) {
    const data=await transaction(env,'/v1.0/qr/qr-mpm-generate',{
      partnerReferenceNo:invoice.order_id,amount:{value:`${invoice.amount_idr}.00`,currency:'IDR'},
      merchantId:invoice.merchant_id,terminalId:env.SHOPEEPAY_TERMINAL_ID||'A01',validityPeriod:invoice.expires_at,
      additionalInfo:{externalStoreId:invoice.store_id}
    });
    if(typeof data.qrContent!=='string'||!data.qrContent.startsWith('000201010212')||data.qrContent.length>4096)throw new MemberError('PROVIDER_DYNAMIC_QR_INVALID',502);
    // Only use a provider-produced dynamic QR. Never modify the owner's static QR.
    return {qr_content:data.qrContent,qr_url:null};
  },
  async query(env,invoice) {
    const d=await transaction(env,'/v1.0/qr/qr-mpm-query',{
      originalPartnerReferenceNo:invoice.order_id,merchantId:invoice.merchant_id,externalStoreId:invoice.store_id,serviceCode:'47',additionalInfo:{value:`${invoice.amount_idr}.00`}
    });
    const statuses={'00':'PAID','01':'PENDING','03':'PENDING','05':'CANCELLED','06':'FAILED','07':'FAILED'};
    if(d.serviceCode!=='47'||!statuses[d.latestTransactionStatus])throw new MemberError('PROVIDER_STATUS_UNSUPPORTED',422);
    return {
      order_id:d.originalPartnerReferenceNo,provider_transaction_id:d.originalReferenceNo,
      merchant_id:d.additionalInfo?.merchantId,store_id:d.additionalInfo?.externalStoreId,
      amount_idr:d.amount?parseIdr(d.amount.value):null,currency:d.amount?.currency,
      paid_at:d.paidTime?new Date(d.paidTime).toISOString():null,
      status:statuses[d.latestTransactionStatus],fee_idr:null,payload_hash:digest(JSON.stringify(d))
    };
  },
  async verifyCallback(env,req,raw) {
    const timestamp=req.headers.get('x-timestamp')||'',signature=req.headers.get('x-signature')||'';
    if(!timestamp||Math.abs(Date.now()-Date.parse(timestamp))>300000||!Number.isFinite(Date.parse(timestamp)))throw new MemberError('WEBHOOK_TIMESTAMP_INVALID',401);
    const expectedUrl=env.SHOPEEPAY_CALLBACK_URL;
    if(new URL(req.url).pathname!==CALLBACK_PATH||!expectedUrl||new URL(expectedUrl).pathname!==CALLBACK_PATH)throw new MemberError('WEBHOOK_URL_INVALID',401);
    const data=`POST:${expectedUrl}:${digest(raw)}:${timestamp}`;
    if(!signature||!verify('RSA-SHA256',Buffer.from(data),env.SHOPEEPAY_PUBLIC_KEY,Buffer.from(signature,'base64')))throw new MemberError('WEBHOOK_SIGNATURE_INVALID',401);
    let d;try{d=JSON.parse(raw)}catch{throw new MemberError('WEBHOOK_BODY_INVALID')}
    if(!d.originalPartnerReferenceNo||!d.originalReferenceNo||!d.amount||Number(d.additionalInfo?.productType)!==2)throw new MemberError('WEBHOOK_FIELDS_INVALID',422);
    return {order_id:d.originalPartnerReferenceNo,provider_transaction_id:d.originalReferenceNo,amount_idr:parseIdr(d.amount.value),currency:d.amount.currency,merchant_id:d.additionalInfo.merchantId,store_id:d.externalStoreId,status:d.latestTransactionStatus,payload_hash:digest(raw)};
  }
};
