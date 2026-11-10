import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {decryptSecret} from '../platform/server/vault.mjs';
import {collectSocialReports} from '../platform/server/social-reporting.mjs';
try{
 const pages=await transaction(null,async db=>(await db.query("SELECT p.*,c.config,c.secret_cipher FROM creator.pages p JOIN creator.connections c ON c.id=p.facebook_connection_id JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.fb_verified",[(process.env.PLATFORM_OWNER_EMAIL||'').toLowerCase()])).rows,{owner:true});
 for(const page of pages){const token=decryptSecret(page.secret_cipher,page.workspace_id).token,reports=await collectSocialReports({page,connection:{config:page.config},token,days:28});await transaction(page.workspace_id,async db=>{for(const report of reports)await db.query('INSERT INTO creator.analytics_reports(workspace_id,page_id,platform,report) VALUES($1,$2,$3,$4)',[page.workspace_id,page.id,report.platform,report]);await db.query("INSERT INTO creator.insight_snapshots(workspace_id,page_id,source,records) VALUES($1,$2,'meta',$3)",[page.workspace_id,page.id,JSON.stringify(reports[0].records)]);});console.log(JSON.stringify({page:page.name,reports:reports.map(r=>({platform:r.platform,posts:r.records.length,accountAvailable:!!r.account?.id,permissions:r.permissions,metrics:r.metrics.map(m=>({name:m.name,status:m.status,reason:m.reason,code:m.code})),capabilities:r.capabilities}))}));}
}finally{await closeDatabase();}
