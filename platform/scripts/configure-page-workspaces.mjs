import '../server/env.mjs';
import {transaction,closeDatabase,audit} from '../server/db.mjs';
import {decryptSecret} from '../server/vault.mjs';
import {remoteJSON,outbound} from '../server/net.mjs';
import {saveAsset} from '../server/creative.mjs';
import {enqueue} from '../server/jobs.mjs';
import {queuePublication} from '../server/planner.mjs';
import sharp from 'sharp';
if(new URL(process.env.DATABASE_URL).pathname!=='/creator_local')throw new Error('This setup is only for the existing owner workspace database.');
try{
 const owner=(await transaction(null,db=>db.query("SELECT a.id,w.id AS workspace_id FROM creator.accounts a JOIN creator.workspaces w ON w.owner_id=a.id WHERE lower(a.email)=lower($1) AND a.email_verified AND a.role='super_admin'",[process.env.PLATFORM_OWNER_EMAIL]),{owner:true})).rows[0];if(!owner)throw new Error('Verified owner required.');const w=owner.workspace_id;
 const pages=(await transaction(w,db=>db.query('SELECT * FROM creator.pages WHERE workspace_id=$1',[w]))).rows,noble=pages.find(p=>p.name.toLowerCase().replaceAll(' ','')==='nobleseek'),store=pages.find(p=>p.name.toLowerCase()==='fabrything');
 if(noble&&!noble.brand.logoAssetId&&noble.facebook_connection_id){
  try{const c=(await transaction(w,db=>db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[w,noble.facebook_connection_id]))).rows[0],secret=decryptSecret(c.secret_cipher,w),picture=await remoteJSON('https://graph.facebook.com/'+c.config.version+'/'+noble.fb_page_id+'/picture?type=large&redirect=false',{headers:{authorization:'Bearer '+secret.token}});if(!picture.data?.url||picture.data.is_silhouette)throw new Error('No brand picture.');const source=await outbound(picture.data.url,{maxBytes:2000000}),image=await sharp(source.bytes).resize(500,500,{fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true}),asset=await saveAsset(w,null,{bytes:image.data,mime:'image/png',width:image.info.width,height:image.info.height});await transaction(w,async db=>{await db.query('INSERT INTO creator.assets(id,workspace_id,path,mime,width,height) VALUES($1,$2,$3,$4,$5,$6)',[asset.id,w,asset.path,asset.mime,asset.width,asset.height]);await db.query("UPDATE creator.pages SET brand=brand||$3::jsonb WHERE workspace_id=$1 AND id=$2",[w,noble.id,JSON.stringify({logoAssetId:asset.id})]);});console.log('Noble Seek: saved its actual Facebook Page brand image.');}catch{console.log('Noble Seek: no downloadable Page brand image; upload a logo in Page settings.');}
 }
 await transaction(w,async db=>{
  await db.query("UPDATE creator.pages SET window_start='00:00',window_end='00:00' WHERE workspace_id=$1",[w]);
  if(noble){await db.query('UPDATE creator.automation_rules SET daily_target=$3,backlog_limit=20,batch_size=2,interval_minutes=60,auto_schedule=true WHERE workspace_id=$1 AND page_id=$2',[w,noble.id,noble.daily_cap]);}
  if(store){
   let site=(await db.query("SELECT * FROM creator.websites WHERE workspace_id=$1 AND lower(name)='fabrything' LIMIT 1",[w])).rows[0];
   const config={catalogURL:'https://www.fabrything.com/api/store/products/?pageSize=100'};
   if(site)site=(await db.query("UPDATE creator.websites SET url='https://www.fabrything.com',kind='ecommerce',connector='json_catalog',connection_id=NULL,config=$3 WHERE workspace_id=$1 AND id=$2 RETURNING *",[w,site.id,config])).rows[0];
   else site=(await db.query("INSERT INTO creator.websites(workspace_id,name,url,kind,connector,config) VALUES($1,'Fabrything','https://www.fabrything.com','ecommerce','json_catalog',$2) RETURNING *",[w,config])).rows[0];
   await db.query('UPDATE creator.pages SET website_id=$3,website_publishing=false,aggregation_enabled=false,require_review=true WHERE workspace_id=$1 AND id=$2',[w,store.id,site.id]);
   const rule=(await db.query("INSERT INTO creator.automation_rules(workspace_id,page_id,name,enabled,interval_minutes,make_creative,auto_publish,auto_schedule,daily_target,backlog_limit,batch_size) VALUES($1,$2,'Fabrything product creative workflow',true,60,true,false,true,$3,$3,1) ON CONFLICT(page_id) DO UPDATE SET enabled=true,interval_minutes=60,make_creative=true,auto_publish=false,auto_schedule=true,daily_target=EXCLUDED.daily_target,backlog_limit=EXCLUDED.backlog_limit,batch_size=1 RETURNING *",[w,store.id,Math.max(1,store.daily_cap)])).rows[0];
   if(!(await db.query("SELECT id FROM creator.tasks WHERE workspace_id=$1 AND kind='import_products' AND input->>'websiteId'=$2 AND status IN ('queued','running')",[w,site.id])).rowCount)await enqueue(db,w,'import_products',{pageId:store.id,input:{websiteId:site.id,refreshRuleId:rule.id}});
  }
  for(const page of pages){const ready=(await db.query("SELECT * FROM creator.posts WHERE workspace_id=$1 AND page_id=$2 AND status IN ('review','approved') AND caption<>'' AND planned_at IS NULL AND archived_at IS NULL AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 20",[w,page.id])).rows;for(const post of ready){await db.query('SAVEPOINT ready_slot');try{await queuePublication(db,w,owner,{...page,window_start:'00:00',window_end:'00:00'},post,{autoPick:true,planOnly:true,spread:true,target:page.daily_cap});}catch{await db.query('ROLLBACK TO SAVEPOINT ready_slot');}finally{await db.query('RELEASE SAVEPOINT ready_slot');}}}
  await audit(db,w,owner,'workspace.page_planner_configured','workspace',w,{postingAnytime:true,storeCatalog:'public storefront API',facebookComments:false});
 });
 console.log('Page workspaces configured: posting anytime, bounded news routine, Fabrything catalog and review-first creative queue.');
}finally{await closeDatabase();}
