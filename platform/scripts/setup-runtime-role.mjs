import '../server/env.mjs';
import pg from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
if(process.env.PLATFORM_BRANCH!=='echolink-platform-local')throw new Error('Use the isolated local branch.');
const db=new pg.Client({connectionString:process.env.DATABASE_URL_UNPOOLED});
try{
 await db.connect();const found=(await db.query("SELECT rolname,rolbypassrls FROM pg_roles WHERE rolname='creator_runtime'")).rows[0],current=new URL(process.env.DATABASE_URL),password=found&&current.username==='creator_runtime'?decodeURIComponent(current.password):randomBytes(36).toString('hex');
 await db.query('BEGIN');
 if(!found)await db.query("CREATE ROLE creator_runtime LOGIN NOBYPASSRLS PASSWORD '"+password+"'");
 else{await db.query('ALTER ROLE creator_runtime NOBYPASSRLS');if(current.username!=='creator_runtime')await db.query("ALTER ROLE creator_runtime PASSWORD '"+password+"'");}
 await db.query('GRANT CONNECT ON DATABASE creator_local TO creator_runtime');
 await db.query('GRANT USAGE ON SCHEMA creator,public TO creator_runtime');
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA creator TO creator_runtime');
 await db.query('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA creator TO creator_runtime');
 await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON public.auth_user,public.auth_account,public.auth_session,public.auth_verification TO creator_runtime');
 await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA creator GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO creator_runtime');
 await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA creator GRANT USAGE,SELECT ON SEQUENCES TO creator_runtime');
 await db.query('COMMIT');
 current.username='creator_runtime';current.password=password;current.searchParams.set('sslmode','verify-full');const file=new URL('../.env.local',import.meta.url);let content=await readFile(file,'utf8');content=content.replace(/^DATABASE_URL=.*\r?\n?/gm,'').trimEnd()+"\nDATABASE_URL='"+current.href+"'\n";await writeFile(file,content);
 console.log('Application runtime now uses creator_runtime with NOBYPASSRLS. Owner credentials remain reserved for migrations. Restart the local app to use it.');
}catch(error){await db.query('ROLLBACK').catch(()=>{});console.error('Runtime role setup failed:',error.code||'setup');process.exitCode=1;}finally{await db.end();}
