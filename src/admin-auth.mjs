import {createHmac,createHash,randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
export const passwordSource=()=>process.env.DASHBOARD_PASSWORD?'environment':process.env.DASHBOARD_PASSWORD_HASH?'hash':'none';
export const passwordConfigured=()=>passwordSource()!=='none';
export async function authenticatePassword(password){
  if(typeof password!=='string'||password.length>256)return false;
  if(passwordSource()==='environment')return timingSafeEqual(createHash('sha256').update(password).digest(),createHash('sha256').update(process.env.DASHBOARD_PASSWORD).digest());
  return verifyPassword(password,process.env.DASHBOARD_PASSWORD_HASH);
}
export async function passwordHash(password){
  if(typeof password!=='string'||password.length<12||password.length>256)throw new Error('Use a dashboard password between 12 and 256 characters');
  const salt=randomBytes(16).toString('hex'),derived=await scrypt(password,salt,64);
  return `scrypt:${salt}:${derived.toString('hex')}`;
}
export async function verifyPassword(password,encoded){
  if(typeof password!=='string'||password.length>256||typeof encoded!=='string')return false;
  const [scheme,salt,key]=encoded.split(':');
  if(scheme!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(key||''))return false;
  const actual=await scrypt(password,salt,64),expected=Buffer.from(key,'hex');
  return timingSafeEqual(actual,expected);
}
function signature(payload){
  const key=process.env.WORKER_API_KEY;
  if(!key||key.length<32)throw new Error('Worker authentication is not configured');
  const credential=createHash('sha256').update(passwordSource()==='environment'?process.env.DASHBOARD_PASSWORD:(process.env.DASHBOARD_PASSWORD_HASH||'')).digest('hex');
  return createHmac('sha256',key).update('echolink-admin-v2|'+credential+'|'+payload).digest('base64url');
}
export function issueSession(now=Date.now()){
  const payload=Buffer.from(JSON.stringify({exp:now+8*3600000,nonce:randomBytes(16).toString('hex')})).toString('base64url');
  return `${payload}.${signature(payload)}`;
}
export function validSession(token,now=Date.now()){
  try{
    if(typeof token!=='string'||token.length>512)return false;
    const [payload,sig,...extra]=token.split('.');if(extra.length||!payload||!sig)return false;
    const expected=Buffer.from(signature(payload)),actual=Buffer.from(sig);
    if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return false;
    const data=JSON.parse(Buffer.from(payload,'base64url').toString());
    return Number.isFinite(data.exp)&&data.exp>now&&data.exp<=now+8*3600000;
  }catch{return false;}
}
export const sessionCookie=(token,secure=false)=>`echolink_admin=${token}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=28800${secure?'; Secure':''}`;
export const readSession=req=>req.headers.get('cookie')?.match(/(?:^|;\s*)echolink_admin=([A-Za-z0-9_.-]+)(?:;|$)/)?.[1];
