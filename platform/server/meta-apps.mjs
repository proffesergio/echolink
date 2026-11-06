import {readFile} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {AppError} from './errors.mjs';
async function settings(){if(process.env.DATABASE_URL&&new URL(process.env.DATABASE_URL).pathname==='/creator_test')return {};try{return parseEnv(await readFile(new URL('../../.env.local',import.meta.url),'utf8'));}catch{return {};}}
export async function metaAppProfiles(){
 const env=await settings(),profiles=Object.keys(env).filter(k=>/^[A-Z][A-Z0-9_]{1,30}_META_APP_ID$/.test(k)).map(k=>{const alias=k.slice(0,-12);return {alias,appId:env[k],configured:!!env[k]&&!!env[alias+'_META_APP_SECRET'],userTokenSaved:!!env[alias+'_META_USER_ACCESS_TOKEN']};});
 if(env.META_APP_ID&&!profiles.some(p=>p.appId===env.META_APP_ID))profiles.push({alias:'LEGACY',appId:env.META_APP_ID,configured:!!env.META_APP_SECRET,userTokenSaved:!!env.META_USER_ACCESS_TOKEN});return profiles;
}
export async function metaAppCredentials(alias){
 if(!/^[A-Z][A-Z0-9_]{1,30}$/.test(alias||''))throw new AppError(400,'Select this Page’s Meta app profile.');
 const env=await settings(),prefix=alias==='LEGACY'?'':alias+'_',appId=env[prefix+'META_APP_ID'],appSecret=env[prefix+'META_APP_SECRET'];
 if(!/^\d+$/.test(appId||'')||!appSecret)throw new AppError(400,'Save '+prefix+'META_APP_ID and '+prefix+'META_APP_SECRET on the worker PC first.');return {appId,appSecret};
}
