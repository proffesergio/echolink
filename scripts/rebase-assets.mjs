import '../platform/server/env.mjs';
import {transaction,closeDatabase} from '../platform/server/db.mjs';
import {resolve,win32,relative,isAbsolute} from 'node:path';
import {realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../platform/.local/assets/',import.meta.url)),apply=process.argv.includes('--apply');
try{
 if(apply&&(process.env.PLATFORM_WORKER_ENABLED!=='false'||process.env.PLATFORM_PUBLISHING_ENABLED==='true'))throw new Error('Pause queue dispatch and publishing in platform/.env.local before applying migrated media paths.');
 const report=await transaction(null,async db=>{const assets=(await db.query('SELECT id,workspace_id,path FROM creator.assets')).rows,changes=[];let missing=0;
  const realRoot=await realpath(root);
  for(const asset of assets){const name=win32.basename(asset.path),destination=resolve(root,asset.workspace_id,name);if(!name.startsWith(asset.id+'.'))throw new Error('Unexpected asset filename; manual review required.');
   try{const resolved=await realpath(destination),rel=relative(realRoot,resolved);if(rel.startsWith('..')||isAbsolute(rel)||!(await stat(resolved)).isFile())throw new Error('unsafe');}catch{missing++;continue;}
   if(destination!==asset.path)changes.push({id:asset.id,path:destination});
  }
  if(apply&&missing)throw new Error('Some restored media files are missing. Copy all media before changing paths.');
  if(apply)for(const asset of changes)await db.query('UPDATE creator.assets SET path=$2 WHERE id=$1',[asset.id,asset.path]);
  return {checked:assets.length,pathsNeedingUpdate:changes.length,missingFiles:missing,applied:apply};
 },{owner:true});console.log(JSON.stringify(report));
}catch(error){console.error(error.message);process.exitCode=1;}finally{await closeDatabase();}
