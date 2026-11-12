import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {decryptSecret} from '../platform/server/vault.mjs';
import {resolveFacebookPage} from '../platform/server/facebook.mjs';
import {testNoble} from '../platform/server/nobleseek.mjs';
try{
 const state=await transaction(null,async db=>{const page=(await db.query("SELECT p.* FROM creator.pages p JOIN creator.workspaces w ON w.id=p.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind='news' AND p.active LIMIT 1",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows[0];if(!page)throw Error('No active owner newsroom.');
 const site=(await db.query('SELECT * FROM creator.websites WHERE workspace_id=$1 AND id=$2',[page.workspace_id,page.website_id])).rows[0];
 const ids=[page.facebook_connection_id,site?.connection_id].filter(Boolean),connections=(await db.query('SELECT * FROM creator.connections WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[page.workspace_id,ids])).rows;
 return {page,site,connections};},{owner:true});
 const {page,site,connections}=state,fb=connections.find(c=>c.id===page.facebook_connection_id),website=connections.find(c=>c.id===site?.connection_id);
 const checks=await Promise.allSettled([
  resolveFacebookPage({token:decryptSecret(fb.secret_cipher,page.workspace_id).token,pageId:page.fb_page_id,version:fb.config.version}),
  site?.connector==='nobleseek_db'?testNoble(website,decryptSecret(website.secret_cipher,page.workspace_id)):Promise.reject(Error('Unsupported read-only website probe'))
 ]);
 console.log(JSON.stringify({facebookSavedVerified:page.fb_verified,pageActive:page.active,requireReview:page.require_review,websitePublishing:page.website_publishing,checks:checks.map((c,i)=>({destination:i?'website':'facebook',ok:c.status==='fulfilled',code:c.status==='rejected'?(c.reason.code||c.reason.status||'connection_check_failed'):undefined}))}));
}finally{await closeDatabase();}
