import base from './owner-lite-runtime.js';

const DEFAULT_PACKAGE='com.ardacore.amstudio';
const DEFAULT_PRODUCT='am_studio_premium';
const DEFAULT_MONTHLY='monthly';
const DEFAULT_YEARLY='yearly';
const GOOGLE_SCOPE='https://www.googleapis.com/auth/androidpublisher';
const GOOGLE_AUD='https://oauth2.googleapis.com/token';

let accessTokenCache={token:null,expiresAt:0};

function cfg(env){
  return {
    packageName:String(env.GOOGLE_PLAY_PACKAGE_NAME||DEFAULT_PACKAGE),
    productId:String(env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_ID||DEFAULT_PRODUCT),
    monthlyBasePlanId:String(env.GOOGLE_PLAY_MONTHLY_BASE_PLAN_ID||DEFAULT_MONTHLY),
    yearlyBasePlanId:String(env.GOOGLE_PLAY_YEARLY_BASE_PLAN_ID||DEFAULT_YEARLY)
  };
}

function verificationReady(env){
  return Boolean(env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL&&env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY);
}

function bytesToB64Url(bytes){
  let s='';
  for(let i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function textToB64Url(text){
  return bytesToB64Url(new TextEncoder().encode(text));
}

function pemToArrayBuffer(pem){
  const clean=String(pem||'').replace(/\\n/g,'\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g,'')
    .replace(/-----END PRIVATE KEY-----/g,'')
    .replace(/\s+/g,'');
  const bin=atob(clean),bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
  return bytes.buffer;
}

async function serviceAccountAssertion(env){
  const now=Math.floor(Date.now()/1000);
  const header=textToB64Url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=textToB64Url(JSON.stringify({
    iss:String(env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL),
    scope:GOOGLE_SCOPE,
    aud:GOOGLE_AUD,
    iat:now,
    exp:now+3600
  }));
  const input=`${header}.${payload}`;
  const key=await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY),
    {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},
    false,
    ['sign']
  );
  const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(input));
  return `${input}.${bytesToB64Url(new Uint8Array(sig))}`;
}

async function googleAccessToken(env,force=false){
  if(!verificationReady(env))throw new Error('GOOGLE_PLAY_VERIFICATION_NOT_CONFIGURED');
  if(!force&&accessTokenCache.token&&Date.now()<accessTokenCache.expiresAt-60000)return accessTokenCache.token;
  const assertion=await serviceAccountAssertion(env);
  const body=new URLSearchParams({
    grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion
  });
  const r=await fetch(GOOGLE_AUD,{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},
    body:body.toString()
  });
  let data={};try{data=await r.json()}catch{}
  if(!r.ok||!data.access_token)throw new Error('GOOGLE_PLAY_OAUTH_FAILED');
  const expires=Math.max(300,Number(data.expires_in)||3600);
  accessTokenCache={token:data.access_token,expiresAt:Date.now()+expires*1000};
  return accessTokenCache.token;
}

async function googleSubscription(env,purchaseToken,retry=true){
  const c=cfg(env),token=await googleAccessToken(env);
  const u=new URL(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(c.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`);
  const r=await fetch(u,{headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
  if(r.status===401&&retry){
    accessTokenCache={token:null,expiresAt:0};
    await googleAccessToken(env,true);
    return googleSubscription(env,purchaseToken,false);
  }
  let data={};try{data=await r.json()}catch{}
  if(!r.ok){
    const err=new Error(r.status===400||r.status===404||r.status===410?'PURCHASE_NOT_VERIFIED':'GOOGLE_PLAY_API_FAILED');
    err.status=r.status;
    throw err;
  }
  return data;
}

function entitlementFromGoogle(data,env){
  const c=cfg(env),all=Array.isArray(data?.lineItems)?data.lineItems:[],items=all.filter(x=>String(x?.productId||'')===c.productId);
  let expiryTime=null,basePlanId=null,autoRenewing=false;
  for(const item of items){
    const exp=item?.expiryTime?Date.parse(item.expiryTime):NaN;
    if(Number.isFinite(exp)&&(!expiryTime||exp>Date.parse(expiryTime)))expiryTime=item.expiryTime;
    if(!basePlanId&&item?.offerDetails?.basePlanId)basePlanId=String(item.offerDetails.basePlanId);
    if(item?.autoRenewingPlan?.autoRenewEnabled===true)autoRenewing=true;
  }
  const state=String(data?.subscriptionState||'SUBSCRIPTION_STATE_UNSPECIFIED');
  const future=expiryTime?Date.parse(expiryTime)>Date.now():false;
  const stateAllows=state==='SUBSCRIPTION_STATE_ACTIVE'||state==='SUBSCRIPTION_STATE_IN_GRACE_PERIOD'||state==='SUBSCRIPTION_STATE_CANCELED';
  const entitled=items.length>0&&stateAllows&&future;
  const acknowledged=String(data?.acknowledgementState||'')==='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED';
  return {
    entitled,
    productId:c.productId,
    basePlanId,
    state,
    expiryTime,
    autoRenewing,
    acknowledged,
    acknowledgementRequired:entitled&&!acknowledged,
    testPurchase:Boolean(data?.testPurchase),
    regionCode:data?.regionCode||null
  };
}

async function tokenHash(token){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function persistEntitlement(env,purchaseToken,entitlement,source='VERIFY'){
  if(!env.COMIC_ASSETS)return;
  const hash=await tokenHash(purchaseToken);
  const record={
    ...entitlement,
    tokenHash:hash,
    source,
    updatedAt:new Date().toISOString()
  };
  await env.COMIC_ASSETS.put(`subscriptions/${hash}.json`,JSON.stringify(record),{
    httpMetadata:{contentType:'application/json',cacheControl:'no-store'},
    customMetadata:{
      source:'GOOGLE_PLAY_SUBSCRIPTION',
      state:String(entitlement.state||''),
      entitled:String(Boolean(entitlement.entitled)),
      updatedAt:record.updatedAt
    }
  });
}

async function verifyPurchase(env,purchaseToken,source='VERIFY'){
  const data=await googleSubscription(env,purchaseToken);
  const entitlement=entitlementFromGoogle(data,env);
  await persistEntitlement(env,purchaseToken,entitlement,source);
  return entitlement;
}

function publicConfig(env){
  const c=cfg(env);
  return {
    ok:true,
    provider:'GOOGLE_PLAY',
    serverReady:verificationReady(env),
    packageName:c.packageName,
    productId:c.productId,
    basePlans:{monthly:c.monthlyBasePlanId,yearly:c.yearlyBasePlanId},
    rtdnReady:Boolean(env.GOOGLE_PLAY_RTDN_SECRET)
  };
}

async function verifyRoute(request,env){
  if(!verificationReady(env))return Response.json({ok:false,error:'GOOGLE_PLAY_VERIFICATION_NOT_CONFIGURED'},{status:503});
  let body={};try{body=await request.json()}catch{}
  const purchaseToken=String(body.purchaseToken||'').trim(),productId=String(body.productId||cfg(env).productId).trim();
  if(productId!==cfg(env).productId)return Response.json({ok:false,error:'PRODUCT_NOT_ALLOWED'},{status:400});
  if(purchaseToken.length<20||purchaseToken.length>4096)return Response.json({ok:false,error:'INVALID_PURCHASE_TOKEN'},{status:400});
  try{
    const entitlement=await verifyPurchase(env,purchaseToken,'CLIENT_VERIFY');
    return Response.json({ok:true,entitlement},{headers:{'cache-control':'no-store'}});
  }catch(error){
    const known=error?.message==='PURCHASE_NOT_VERIFIED';
    return Response.json({ok:false,error:error?.message||'VERIFY_FAILED'},{status:known?403:502,headers:{'cache-control':'no-store'}});
  }
}

function decodeRtdnData(value){
  const raw=atob(String(value||'')),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function rtdnRoute(request,env){
  const secret=String(env.GOOGLE_PLAY_RTDN_SECRET||'');
  if(!secret)return Response.json({ok:false,error:'RTDN_NOT_CONFIGURED'},{status:503});
  const url=new URL(request.url);
  const provided=request.headers.get('x-am-rtdn-secret')||url.searchParams.get('key')||'';
  if(provided!==secret)return Response.json({ok:false,error:'RTDN_AUTH_REQUIRED'},{status:401});
  let push={};try{push=await request.json()}catch{return Response.json({ok:false,error:'INVALID_RTDN_BODY'},{status:400})}
  let notification;try{notification=decodeRtdnData(push?.message?.data)}catch{return Response.json({ok:false,error:'INVALID_RTDN_DATA'},{status:400})}
  if(String(notification?.packageName||'')!==cfg(env).packageName)return Response.json({ok:false,error:'RTDN_PACKAGE_MISMATCH'},{status:400});
  const sub=notification?.subscriptionNotification,purchaseToken=String(sub?.purchaseToken||'');
  if(!purchaseToken)return new Response(null,{status:204});
  try{
    await verifyPurchase(env,purchaseToken,'RTDN');
    return new Response(null,{status:204});
  }catch(error){
    return Response.json({ok:false,error:error?.message||'RTDN_VERIFY_FAILED'},{status:502});
  }
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/api/subscription/config'){
      return Response.json(publicConfig(env),{headers:{'cache-control':'no-store'}});
    }
    if(request.method==='POST'&&url.pathname==='/api/subscription/verify')return verifyRoute(request,env);
    if(request.method==='POST'&&url.pathname==='/api/subscription/rtdn')return rtdnRoute(request,env);
    return base.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){if(base.scheduled)return base.scheduled(controller,env,ctx)}
};

export {cfg,verificationReady,entitlementFromGoogle};
