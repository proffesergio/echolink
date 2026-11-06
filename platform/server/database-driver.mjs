import pg from 'pg';
import {Pool,Client,neonConfig} from '@neondatabase/serverless';
// An explicit operator choice: preserve TCP by default, and use Neon's
// transaction-compatible secure WebSocket transport on restrictive networks.
export function databaseDriver(transport=process.env.PLATFORM_DATABASE_TRANSPORT||'tcp'){
 if(transport==='tcp')return pg;
 if(transport!=='websocket')throw new Error('PLATFORM_DATABASE_TRANSPORT must be tcp or websocket.');
 if(globalThis.WebSocket&&!neonConfig.webSocketConstructor)neonConfig.webSocketConstructor=globalThis.WebSocket;
 return {Pool,Client};
}
