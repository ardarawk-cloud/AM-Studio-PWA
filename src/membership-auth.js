import { scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export class MemberError extends Error {
  constructor(code, status=400) { super(code); this.status=status; }
}
export const iso = () => new Date().toISOString();
export const hash = s => createHash('sha256').update(String(s)).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function equal(a,b) { const x=Buffer.from(String(a)), y=Buffer.from(String(b)); return x.length===y.length && timingSafeEqual(x,y); }
export function json(data,status=200,extra={}) {
  return Response.json(data,{status,headers:{'cache-control':'no-store, private','pragma':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin',...extra}});
}
export async function bodyJson(req,max=16384) {
  const reader=req.body?.getReader(); if(!reader)throw new MemberError('EMPTY_REQUEST');
  const chunks=[]; let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new MemberError('REQUEST_TOO_LARGE',413)}chunks.push(value)}
  const bytes=new Uint8Array(size);let i=0;for(const chunk of chunks){bytes.set(chunk,i);i+=chunk.length}
  try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw new MemberError('INVALID_JSON')}
}
export function sameOrigin(req) {
  if(req.headers.get('origin')!==new URL(req.url).origin || req.headers.get('sec-fetch-site')==='cross-site')throw new MemberError('ORIGIN_DENIED',403);
}
export async function rate(db,req,scope,limit=10,window=600000,identity='') {
  const now=Date.now(), bucket=Math.floor(now/window);
  const key=hash(`${scope}:${identity||req.headers.get('cf-connecting-ip')||'unknown'}:${bucket}`);
  const row=await db.prepare('INSERT INTO auth_limits(id,hits,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,now+window*2).first();
  if(row.hits>limit)throw new MemberError('TOO_MANY_ATTEMPTS',429);
}
async function derive(password,salt) {
  return new Promise((resolve,reject)=>scrypt(password,salt,32,{N:32768,r:8,p:3,maxmem:48*1024*1024},(err,key)=>err?reject(err):resolve(key)));
}
export async function passwordHash(password) {
  if(typeof password!=='string'||password.length<12||password.length>128)throw new MemberError('PASSWORD_MUST_BE_12_TO_128_CHARACTERS');
  const salt=randomBytes(16).toString('hex'), key=await derive(password,salt);
  return `scrypt$32768$8$3$${salt}$${key.toString('hex')}`;
}
export async function passwordValid(password,encoded) {
  const parts=String(encoded).split('$');
  if(parts.length!==6||parts.slice(0,4).join('$')!=='scrypt$32768$8$3')return false;
  const key=await derive(String(password),parts[4]);return equal(key.toString('hex'),parts[5]);
}
export const sessionCookie=(value,seconds=1209600)=>`__Host-am_member=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;
export async function newSession(db,userId,kind='MEMBER') {
  const value=token(),csrf=token(),now=iso(),seconds=kind==='ADMIN'?3600:1209600;
  await db.prepare('INSERT INTO sessions(token_hash,user_id,kind,csrf,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(hash(value),userId,kind,csrf,new Date(Date.now()+seconds*1000).toISOString(),now).run();
  return {csrf,cookie:sessionCookie(value,seconds)};
}
export async function session(db,req,kind='MEMBER',mutate=false) {
  const value=(req.headers.get('cookie')||'').match(/(?:^|;\s*)__Host-am_member=([a-f0-9]{64})(?:;|$)/)?.[1];
  if(!value)throw new MemberError('LOGIN_REQUIRED',401);
  const row=await db.prepare('SELECT s.*,u.email,u.name,u.timezone,u.status AS user_status FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').bind(hash(value),iso()).first();
  if(!row||row.kind!==kind||kind==='MEMBER'&&row.user_status!=='ACTIVE')throw new MemberError('LOGIN_REQUIRED',401);
  if(mutate){sameOrigin(req);if(!equal(req.headers.get('x-csrf-token')||'',row.csrf))throw new MemberError('CSRF_DENIED',403)}
  return row;
}
export async function optionalMember(db,req) {try{return await session(db,req)}catch(e){if(e.status===401)return null;throw e}}
export async function audit(db,actor,action,target,before,after,reason) {
  return auditStatement(db,actor,action,target,before,after,reason).run();
}
export function auditStatement(db,actor,action,target,before,after,reason) {
  return db.prepare('INSERT INTO audit_logs VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,target,before==null?null:JSON.stringify(before),after==null?null:JSON.stringify(after),String(reason),iso());
}
export function subscriptionState(sub,now=Date.now()) {
  if(!sub||sub.status==='REVOKED'||Date.parse(sub.ends_at)<=now)return 'EXPIRED';
  return Date.parse(sub.ends_at)-now<=7*86400000?'EXPIRING':'ACTIVE';
}
export async function memberActive(db,userId) {
  if(!userId)return false;
  const s=await db.prepare('SELECT s.* FROM subscriptions s JOIN users u ON u.id=s.user_id WHERE s.user_id=? AND u.status=\'ACTIVE\' AND s.starts_at<=?').bind(userId,iso()).first();
  return subscriptionState(s)!=='EXPIRED';
}
