import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {decryptSecret} from '../platform/server/vault.mjs';
import {fetchProducts} from '../platform/server/catalog.mjs';
try{
 const {site,connection,known,missed}=await transaction(null,async db=>{
  const site=(await db.query("SELECT s.* FROM creator.websites s JOIN creator.workspaces w ON w.id=s.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND s.connector='fabrything_db' LIMIT 1",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows[0];
  const connection=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=$2',[site.workspace_id,site.connection_id])).rows[0];
  const known=(await db.query('SELECT external_id FROM creator.products WHERE workspace_id=$1 AND website_id=$2',[site.workspace_id,site.id])).rows.map(p=>p.external_id);
  const missed=(await db.query("SELECT p.external_id FROM creator.posts s JOIN creator.products p ON p.id=s.product_id AND p.workspace_id=s.workspace_id JOIN creator.tasks t ON t.post_id=s.id AND t.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND s.status='scheduled' AND t.status='queued' AND t.phase LIKE '%absent from the refreshed catalog%' LIMIT 1",[site.workspace_id])).rows[0]?.external_id;
  return {site,connection,known,missed};
 },{owner:true});
 const secret=decryptSecret(connection.secret_cipher,site.workspace_id),next=await fetchProducts(site,secret,connection,{excludeIds:known}),target=missed?await fetchProducts(site,secret,connection,{externalId:missed}):[];
 if(next.some(p=>known.includes(p.external_id)))throw Error('Next batch overlapped saved source history.');
 console.log(JSON.stringify({readOnly:true,known:known.length,nextBatch:next.length,overlap:0,targetedReadRequested:!!missed,targetedProductFound:target.length===1,targetedAvailable:target[0]?.available,realPublicationSubmitted:false}));
}finally{await closeDatabase();}
