import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {AppError} from './errors.mjs';
function key(){const value=process.env.PLATFORM_ENCRYPTION_KEY||'';if(!/^[a-f0-9]{64}$/i.test(value))throw new AppError(503,'The platform encryption key is not configured.');return Buffer.from(value,'hex');}
export function encryptSecret(value,workspaceId){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),nonce);cipher.setAAD(Buffer.from(workspaceId));const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return ['v1',nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');}
export function decryptSecret(value,workspaceId){
  if(!value)return {};
  try{const [v,n,t,c]=value.split('.');if(v!=='v1')throw new Error('Unsupported format');const decipher=createDecipheriv('aes-256-gcm',key(),Buffer.from(n,'base64url'));decipher.setAAD(Buffer.from(workspaceId));decipher.setAuthTag(Buffer.from(t,'base64url'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(c,'base64url')),decipher.final()]).toString());}
  catch{throw new AppError(503,'This connection secret could not be opened. Reconnect it or restore the platform encryption key.');}
}
