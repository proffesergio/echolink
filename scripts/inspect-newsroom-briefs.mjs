import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {prepareBriefEvidence} from '../platform/server/news-brief-writer.mjs';
import {inferenceSettings} from '../platform/server/inference-resources.mjs';
try{console.log(JSON.stringify(await transaction(null,async db=>{
 const posts=(await db.query("SELECT s.* FROM creator.posts s JOIN creator.pages p ON p.id=s.page_id JOIN creator.workspaces w ON w.id=s.workspace_id JOIN creator.accounts a ON a.id=w.owner_id WHERE lower(a.email)=$1 AND p.kind='news' AND s.status IN ('draft','review','failed') AND s.deleted_at IS NULL AND s.archived_at IS NULL AND s.website_url IS NULL ORDER BY s.updated_at DESC LIMIT 20",[process.env.PLATFORM_OWNER_EMAIL.toLowerCase()])).rows;
 const settings=inferenceSettings({contextTokens:6144,maxOutputTokens:4096});
 return {limits:{profile:settings.name,context:settings.contextTokens,output:settings.maxOutputTokens,reserveMB:settings.reserveMB,abortMB:settings.abortMB},stories:posts.map(post=>{const d=prepareBriefEvidence(post);return {id:post.id,title:post.title,words:d.sourceWords,kind:d.sourceKind,conflicts:d.conflicts?.length,eligible:!d.hold,reason:d.message};})};
},{owner:true}),null,2));}finally{await closeDatabase();}
