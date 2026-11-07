import {transaction} from './db.mjs';
export function definiteDatabaseRejection(error){return typeof error.code==='string'&&/^(?:22|23|42|0A)/.test(error.code);}
export function publicationFailure(error,{websiteSubmitted=false,websiteConfirmed=false,facebookSubmitted=false,facebookConfirmed=false,stage='website'}={}){
 if(facebookConfirmed)return {unknown:true,destination:'facebook',message:'Facebook confirmed publication; the local delivery record needs reconciliation. Do not republish.'};
 const rejected=!!error.definiteRejection||definiteDatabaseRejection(error),unknown=!rejected&&(facebookSubmitted||websiteSubmitted&&!websiteConfirmed);
 const destination=facebookSubmitted||websiteConfirmed?'facebook':stage;
 const detail=definiteDatabaseRejection(error)?`Website database rejected the article (${error.code}${/^[a-z_]+$/.test(error.column||'')?', '+error.column:''}). No Facebook submission was made.`:error.status?error.message:'The service connection interrupted before confirmation.';
 return {unknown,destination,message:unknown?`The ${destination} response was interrupted. Its delivery needs reconciliation before retrying.`:websiteConfirmed?`Website article is confirmed. Facebook needs retry: ${detail}`:detail};
}
export async function deliveryState(task,destination,status,{phase='',remoteId=null,url=null,error=null}={}){
 return transaction(task.workspace_id,db=>db.query(`INSERT INTO creator.publication_deliveries(workspace_id,post_id,page_id,destination,status,phase,remote_id,url,last_error,started_at,confirmed_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $5='running' THEN now() ELSE NULL END,CASE WHEN $5='confirmed' THEN now() ELSE NULL END)
 ON CONFLICT(workspace_id,post_id,destination) DO UPDATE SET status=EXCLUDED.status,phase=EXCLUDED.phase,remote_id=COALESCE(EXCLUDED.remote_id,creator.publication_deliveries.remote_id),url=COALESCE(EXCLUDED.url,creator.publication_deliveries.url),last_error=EXCLUDED.last_error,started_at=CASE WHEN EXCLUDED.status='running' THEN now() ELSE creator.publication_deliveries.started_at END,confirmed_at=COALESCE(EXCLUDED.confirmed_at,creator.publication_deliveries.confirmed_at),updated_at=now()`,[task.workspace_id,task.post_id,task.page_id,destination,status,phase,remoteId,url,error]));
}
