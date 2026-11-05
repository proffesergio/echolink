import '../server/env.mjs';
import {getMigrations} from 'better-auth/db/migration';
import {getAuth} from '../server/identity.mjs';
import {closeDatabase} from '../server/db.mjs';
if(process.env.PLATFORM_BRANCH!=='echolink-platform-local')throw new Error('Authentication setup is restricted to the local development branch.');
if(process.env.DATABASE_URL_UNPOOLED)process.env.DATABASE_URL=process.env.DATABASE_URL_UNPOOLED;
try{const {runMigrations}=await getMigrations(getAuth().options);await runMigrations();console.log('App-hosted Better Auth schema ready on the isolated platform database.');}
catch(error){console.error('Account schema setup failed:',error.code||'configuration');process.exitCode=1;}finally{await closeDatabase();}
