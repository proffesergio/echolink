import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function postgresBin(){
 if(process.env.PG_BIN_DIR)return resolve(process.env.PG_BIN_DIR);
 if(process.platform==='win32')return fileURLToPath(new URL('../.codex/tools/postgres18/pgsql/bin/',import.meta.url));
 const result=spawnSync('pg_config',['--bindir'],{encoding:'utf8',timeout:5000});
 if(result.status===0&&existsSync(resolve(result.stdout.trim(),'pg_ctl')))return result.stdout.trim();
 for(const version of ['18','17','16']){const bin='/usr/lib/postgresql/'+version+'/bin';if(existsSync(resolve(bin,'pg_ctl')))return bin;}
 throw new Error('Install PostgreSQL tools and set PG_BIN_DIR to their bin directory.');
}
export const postgresExecutable=name=>resolve(postgresBin(),name+(process.platform==='win32'?'.exe':''));
