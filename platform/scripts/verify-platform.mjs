import '../server/env.mjs';
import {env} from '../server/env.mjs';
import {query,closeDatabase} from '../server/db.mjs';
import {identityStatus} from '../server/identity.mjs';
try{
 const db=(await query('SELECT current_database() AS database')).rows[0];
 const migrations=(await query('SELECT name FROM creator.migrations ORDER BY name')).rows.map(x=>x.name);
 const health=await fetch(env().origin+'/api/public');const publicInfo=await health.json();
 const forbidden=await fetch(env().origin+'/api/state');
 console.log(JSON.stringify({database:db.database,branch:process.env.PLATFORM_BRANCH,migrations,auth:identityStatus(),http:health.status,anonymousState:forbidden.status,tools:publicInfo.providers?.length,livePublishing:publicInfo.publishingEnabled},null,2));
 if(health.status!==200||forbidden.status!==401||db.database!=='creator_local')process.exitCode=1;
}finally{await closeDatabase();}
