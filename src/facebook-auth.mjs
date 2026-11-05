import {createHash} from 'node:crypto';
import {FacebookError,facebookFailure} from './facebook.mjs';

export const tokenFingerprint=token=>createHash('sha256').update(token).digest('hex');
export function facebookConnectionMetadata(){
  let tokens={},connections={};
  try{tokens=JSON.parse(process.env.FB_TOKENS_JSON||'{}');connections=JSON.parse(process.env.FB_CONNECTIONS_JSON||'{}');}catch{return [];}
  return Object.entries(connections).filter(([alias,item])=>typeof tokens[alias]==='string'&&item?.fingerprint===tokenFingerprint(tokens[alias])).map(([alias,item])=>({alias,id:item.id,name:item.name,
    method:item.method,expiryKnown:item.expiryKnown===true,noScheduledExpiry:item.noScheduledExpiry===true,expiresAt:item.expiresAt||null,dataAccessExpiresAt:item.dataAccessExpiresAt||null,verifiedAt:item.verifiedAt}));
}
export function tokenLifecycle(data={}) {
  const date=value=>Number.isFinite(value)&&value>0?new Date(value*1000).toISOString():null;
  return {expiryKnown:Number.isFinite(data.expires_at),noScheduledExpiry:data.expires_at===0,
    expiresAt:date(data.expires_at),dataAccessExpiresAt:date(data.data_access_expires_at),verifiedAt:new Date().toISOString()};
}

// Exchange and verification are read-only with respect to Page content. The
// caller must persist only the selected, verified Page token; never the User token.
export async function exchangePageToken({appId,appSecret,userToken,pageId,version},fetcher=fetch) {
  if(!/^\d+$/.test(appId||'')||!appSecret||!userToken||!/^\d+$/.test(pageId||'')||!/^v\d+\.\d+$/.test(version||'')) {
    throw new FacebookError(400,{diagnostic:'Save META_APP_ID, META_APP_SECRET and a fresh META_USER_ACCESS_TOKEN in the worker .env.local; enter the matching numeric Page ID and Graph version.'});
  }
  const base='https://graph.facebook.com/'+version;
  const get=async(path,params,bearer,stage)=>{
    const url=new URL(base+path);url.search=new URLSearchParams(params);
    let response,data;
    try{
      response=await fetcher(url,{headers:{Authorization:'Bearer '+bearer},redirect:'error',signal:AbortSignal.timeout(20000)});
      const raw=await response.text();if(raw.length>2000000)throw new Error('Large response');data=JSON.parse(raw);
    }catch{throw new FacebookError(502,{diagnostic:stage+': Meta could not be reached or returned an invalid response. Existing Page credentials were kept.'});}
    if(!response.ok||data.error)throw new FacebookError(response.status,{code:data.error?.code,subcode:data.error?.error_subcode,
      diagnostic:stage+': '+facebookFailure({code:data.error?.code,subcode:data.error?.error_subcode,message:data.error?.message})+' Existing Page credentials were kept.'});
    return data;
  };
  const appToken=appId+'|'+appSecret;
  const input=(await get('/debug_token',{input_token:userToken},appToken,'User authorization check')).data;
  if(!input?.is_valid||input.type!=='USER'||String(input.app_id)!==appId)throw new FacebookError(400,{diagnostic:'Use a freshly authorized User token for this same Meta app. Existing Page credentials were kept.'});
  const required=['pages_show_list','pages_read_engagement','pages_manage_posts'];
  const missing=required.filter(scope=>!input.scopes?.includes(scope));
  if(missing.length)throw new FacebookError(403,{diagnostic:'User authorization is missing '+missing.join(', ')+'. Authorize these permissions and try again. Existing Page credentials were kept.'});
  const exchanged=await get('/oauth/access_token',{grant_type:'fb_exchange_token',client_id:appId,client_secret:appSecret,fb_exchange_token:userToken},appToken,'Long-lived authorization exchange');
  if(typeof exchanged.access_token!=='string'||!exchanged.access_token)throw new FacebookError(502,{diagnostic:'Meta returned no long-lived User token. Existing Page credentials were kept.'});
  let selected,after;
  for(let batch=0;batch<10;batch++){
    const accounts=await get('/me/accounts',{fields:'id,name,access_token,tasks',limit:'100',...(after?{after}:{})},exchanged.access_token,'Page access lookup');
    selected=accounts.data?.find(page=>String(page.id)===pageId);
    if(selected||!accounts.paging?.next||!accounts.paging?.cursors?.after)break;
    after=accounts.paging.cursors.after;
  }
  if(!selected?.access_token)throw new FacebookError(403,{diagnostic:'This User authorization did not return the selected Page. Check the Page selection and your Page management access. Existing Page credentials were kept.'});
  const identity=await get('/me',{fields:'id,name'},selected.access_token,'Page identity check');
  if(String(identity.id)!==pageId)throw new FacebookError(409,{diagnostic:'Meta returned a token for a different Page. Existing Page credentials were kept.'});
  const debug=(await get('/debug_token',{input_token:selected.access_token},appToken,'Page token verification')).data;
  const pageMissing=['pages_read_engagement','pages_manage_posts'].filter(scope=>!debug?.scopes?.includes(scope));
  if(!debug?.is_valid||debug.type!=='PAGE'||String(debug.app_id)!==appId||pageMissing.length||debug.expires_at>0&&debug.expires_at*1000<=Date.now()) {
    throw new FacebookError(403,{diagnostic:'The returned Page token failed publishing verification'+(pageMissing.length?': missing '+pageMissing.join(', '):'')+'. Existing Page credentials were kept.'});
  }
  return {token:selected.access_token,connection:{ok:true,publishReady:true,commentsReady:debug.scopes.includes('pages_manage_engagement'),
    id:pageId,name:identity.name,scopes:debug.scopes.filter(scope=>/^pages_[a-z_]+$/.test(scope)),...tokenLifecycle(debug),method:'long-lived-user-exchange'}};
}
