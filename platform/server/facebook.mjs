import {AppError} from './errors.mjs';
import {remoteJSON} from './net.mjs';

// Accept either input type, but only persist the token belonging to the selected Page.
// Never follow a Graph pagination URL: it can contain the input credential.
export async function resolveFacebookPage({token,pageId,version,tokenType='auto',appId,appSecret},request=remoteJSON){
 if(!/^\d+$/.test(pageId||''))throw new AppError(400,'Enter the numeric Facebook Page ID in this form.');
 if(!/^v\d+\.0$/.test(version||''))throw new AppError(400,'Enter the Graph API version supported by your Meta app.');
 if(!token?.trim())throw new AppError(400,'Paste a User or Page access token, or keep the saved token to verify again.');
 if(!['auto','user','page'].includes(tokenType))throw new AppError(400,'Choose Auto, User token or Page token.');
 const base='https://graph.facebook.com/'+version;
 const get=(path,credential=token)=>request(base+path,{headers:{authorization:'Bearer '+credential},timeout:10000});
 const me=await get('/me?fields=id,name');let pageToken=token,source='page',longLived=false,lifecycle={expiryKnown:false};
 if(String(me.id)!==pageId){
  if(tokenType==='page')throw new AppError(400,'This Page token belongs to a different Page. Select User token if you pasted a User access token.');
  // Page tokens cannot read the User accounts edge. A wrong Page token therefore
  // fails here rather than being accepted as proof for an arbitrary target Page.
  const permissions=await get('/me/permissions');
  const granted=new Set((permissions.data||[]).filter(p=>p.status==='granted').map(p=>p.permission));
  const missing=['pages_show_list','pages_read_engagement','pages_manage_posts'].filter(p=>!granted.has(p));
  if(missing.length)throw new AppError(400,'The User token is missing: '+missing.join(', ')+'. Authorize those permissions and include this Page.');
  let accountToken=token;
  if(appId&&appSecret){
   const debug=await get('/debug_token?input_token='+encodeURIComponent(token),token);
   if(!debug.data?.is_valid||debug.data.type!=='USER')throw new AppError(400,'Use a fresh User authorization for the long-lived token exchange.');
   if(String(debug.data.app_id)!==String(appId))throw new AppError(400,'The User token belongs to Meta app '+debug.data.app_id+', but the owner configured '+appId+'. Save the matching app ID and app secret before exchanging this token.');
   const exchange=await get('/oauth/access_token?'+new URLSearchParams({grant_type:'fb_exchange_token',client_id:appId,client_secret:appSecret,fb_exchange_token:token}),appId+'|'+appSecret);
   if(!exchange.access_token)throw new AppError(502,'Meta did not return a long-lived User authorization.');accountToken=exchange.access_token;longLived=true;
  }
  let after,found;const deadline=Date.now()+20000;
  for(let i=0;i<10;i++){
   if(Date.now()>deadline)throw new AppError(400,'Page lookup took too long. Paste the Page token returned for this Page by me/accounts instead.');
   const accounts=await get('/me/accounts?fields=id,name,tasks,access_token&limit=100'+(after?'&after='+encodeURIComponent(after):''),accountToken);
   found=accounts.data?.find(p=>String(p.id)===pageId);if(found)break;
   const cursor=accounts.paging?.cursors?.after;if(!accounts.paging?.next||!cursor||cursor===after)break;after=cursor;
  }
  if(!found?.access_token)throw new AppError(400,'This User token cannot manage the selected Page. Grant this Page access in Meta login and check your Page role. Business Portfolio Pages may also require business_management.');
  if(found.tasks?.length&&!found.tasks.some(t=>['CREATE_CONTENT','PROFILE_PLUS_CREATE_CONTENT','MANAGE'].includes(t)))throw new AppError(400,'Your Page role does not include content creation. Ask a Page administrator for publishing access.');
  pageToken=found.access_token;source='user';
 }
 const identity=await get('/me?fields=id,name,category',pageToken);
 if(String(identity.id)!==pageId||!identity.category)throw new AppError(400,'The resolved token does not identify the selected Facebook Page.');
 if(longLived){const {data}=await get('/debug_token?input_token='+encodeURIComponent(pageToken),appId+'|'+appSecret);if(!data?.is_valid||data.type!=='PAGE'||String(data.app_id)!==String(appId)||!['pages_manage_posts','pages_read_engagement'].every(scope=>data.scopes?.includes(scope)))throw new AppError(400,'The exchanged Page token did not pass publishing-permission validation.');lifecycle={expiryKnown:Number.isFinite(data.expires_at),noScheduledExpiry:data.expires_at===0,expiresAt:data.expires_at>0?new Date(data.expires_at*1000).toISOString():null,dataAccessExpiresAt:data.data_access_expires_at>0?new Date(data.data_access_expires_at*1000).toISOString():null};}
 return {token:pageToken,result:{ok:true,id:pageId,name:identity.name,tokenSource:source,longLived,...lifecycle,message:(longLived?'Long-lived Page-token exchange verified. ':source==='user'?'User token converted to a Page token. Its expiry depends on the User authorization. ':'')+'Connected to '+identity.name+'. '+(lifecycle.noScheduledExpiry?'Meta reports no scheduled expiry; security changes can still revoke access.':'Meta checks publishing permissions on submission.')}};
}

export async function pauseFacebookPage(db,w,pageId,connectionId,message){
 const changed=await db.query('UPDATE creator.pages SET fb_verified=false WHERE workspace_id=$1 AND id=$2 AND facebook_connection_id=$3 RETURNING id',[w,pageId,connectionId]);if(!changed.rowCount)return;
 await db.query("UPDATE creator.connections SET status='error',last_test_at=now(),last_test_result=$3 WHERE workspace_id=$1 AND id=$2",[w,connectionId,{ok:false,code:'facebook_auth_expired',message}]);
 await db.query("UPDATE creator.tasks SET status='blocked',phase='Reconnect Facebook: token expired or revoked',last_error=$3,finished_at=now() WHERE workspace_id=$1 AND page_id=$2 AND kind='publish' AND status='queued'",[w,pageId,message]);
 await db.query("UPDATE creator.usage_reservations u SET status='released',updated_at=now() FROM creator.posts p WHERE u.workspace_id=$1 AND p.workspace_id=$1 AND p.id=u.post_id AND p.page_id=$2 AND u.status='reserved' AND p.status IN ('scheduled','approved','failed')",[w,pageId]);
 await db.query("UPDATE creator.posts SET status=CASE WHEN approved_version=version THEN 'approved' ELSE 'review' END,scheduled_at=NULL,last_error=$3,seo=seo||'{\"deliveryBlock\":\"facebook_auth\"}'::jsonb WHERE workspace_id=$1 AND page_id=$2 AND status IN ('scheduled','approved','failed') AND deleted_at IS NULL AND archived_at IS NULL",[w,pageId,message]);
}
