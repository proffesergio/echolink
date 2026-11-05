import {AppError} from './errors.mjs';
import {remoteJSON} from './net.mjs';

// Accept either input type, but only persist the token belonging to the selected Page.
// Never follow a Graph pagination URL: it can contain the input credential.
export async function resolveFacebookPage({token,pageId,version,tokenType='auto'},request=remoteJSON){
 if(!/^\d+$/.test(pageId||''))throw new AppError(400,'Enter the numeric Facebook Page ID in this form.');
 if(!/^v\d+\.0$/.test(version||''))throw new AppError(400,'Enter the Graph API version supported by your Meta app.');
 if(!token?.trim())throw new AppError(400,'Paste a User or Page access token, or keep the saved token to verify again.');
 if(!['auto','user','page'].includes(tokenType))throw new AppError(400,'Choose Auto, User token or Page token.');
 const base='https://graph.facebook.com/'+version;
 const get=(path,credential=token)=>request(base+path,{headers:{authorization:'Bearer '+credential},timeout:10000});
 const me=await get('/me?fields=id,name');let pageToken=token,source='page';
 if(String(me.id)!==pageId){
  if(tokenType==='page')throw new AppError(400,'This Page token belongs to a different Page. Select User token if you pasted a User access token.');
  // Page tokens cannot read the User accounts edge. A wrong Page token therefore
  // fails here rather than being accepted as proof for an arbitrary target Page.
  const permissions=await get('/me/permissions');
  const granted=new Set((permissions.data||[]).filter(p=>p.status==='granted').map(p=>p.permission));
  const missing=['pages_show_list','pages_read_engagement','pages_manage_posts'].filter(p=>!granted.has(p));
  if(missing.length)throw new AppError(400,'The User token is missing: '+missing.join(', ')+'. Authorize those permissions and include this Page.');
  let after,found;const deadline=Date.now()+20000;
  for(let i=0;i<10;i++){
   if(Date.now()>deadline)throw new AppError(400,'Page lookup took too long. Paste the Page token returned for this Page by me/accounts instead.');
   const accounts=await get('/me/accounts?fields=id,name,tasks,access_token&limit=100'+(after?'&after='+encodeURIComponent(after):''));
   found=accounts.data?.find(p=>String(p.id)===pageId);if(found)break;
   const cursor=accounts.paging?.cursors?.after;if(!accounts.paging?.next||!cursor||cursor===after)break;after=cursor;
  }
  if(!found?.access_token)throw new AppError(400,'This User token cannot manage the selected Page. Grant this Page access in Meta login and check your Page role. Business Portfolio Pages may also require business_management.');
  if(found.tasks?.length&&!found.tasks.some(t=>['CREATE_CONTENT','PROFILE_PLUS_CREATE_CONTENT','MANAGE'].includes(t)))throw new AppError(400,'Your Page role does not include content creation. Ask a Page administrator for publishing access.');
  pageToken=found.access_token;source='user';
 }
 const identity=await get('/me?fields=id,name,category',pageToken);
 if(String(identity.id)!==pageId||!identity.category)throw new AppError(400,'The resolved token does not identify the selected Facebook Page.');
 return {token:pageToken,result:{ok:true,id:pageId,name:identity.name,tokenSource:source,message:(source==='user'?'User token converted to a Page token. ':'')+'Connected to '+identity.name+'. Meta checks publishing permissions on submission.'}};
}
