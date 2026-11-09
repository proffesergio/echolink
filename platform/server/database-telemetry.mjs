import {createHash} from 'node:crypto';
const metrics=new Map();
export function recordDatabaseResult(text,result,ms,error=false){
 const sql=typeof text==='string'?text:text?.text||'',fingerprint=createHash('sha256').update(sql.replace(/\s+/g,' ').trim()).digest('hex').slice(0,12);
 const table=sql.match(/(?:FROM|UPDATE|INTO)\s+(?:creator\.)?([a-z_]+)/i)?.[1]||'transaction';
 const row={...(metrics.get(fingerprint)||{fingerprint,label:(sql.trim().split(/\s/)[0]||'QUERY').toUpperCase()+' '+table,calls:0,rows:0,estimatedResponseBytes:0,totalMs:0,errors:0})};
 row.calls++;row.rows+=result?.rows?.length||0;row.estimatedResponseBytes+=result?.rows?Buffer.byteLength(JSON.stringify(result.rows)):0;row.totalMs+=ms;row.errors+=Number(error);metrics.set(fingerprint,row);if(metrics.size>150)metrics.delete(metrics.keys().next().value);
}
export function instrumentDatabaseClient(client){
 if(client.__echolinkMetered)return;client.__echolinkMetered=true;const original=client.query;
 client.query=function(...args){const started=performance.now(),callback=typeof args.at(-1)==='function'?args.at(-1):null;
  if(callback){args[args.length-1]=(error,result)=>{recordDatabaseResult(args[0],result,performance.now()-started,!!error);callback(error,result);};return original.apply(this,args);}
  let pending;try{pending=original.apply(this,args);}catch(error){recordDatabaseResult(args[0],null,performance.now()-started,true);throw error;}
  if(!pending?.then)return pending;
  return pending.then(result=>{recordDatabaseResult(args[0],result,performance.now()-started);return result;},error=>{recordDatabaseResult(args[0],null,performance.now()-started,true);throw error;});
 };
}
export function databaseTelemetry(){const queries=[...metrics.values()].map(m=>({...m,totalMs:Math.round(m.totalMs)})).sort((a,b)=>b.estimatedResponseBytes-a.estimatedResponseBytes);return {queries,totalCalls:queries.reduce((n,r)=>n+r.calls,0),estimatedResponseBytes:queries.reduce((n,r)=>n+r.estimatedResponseBytes,0),note:'Process-local JSON row-size estimates, not provider billing bytes. Query values, credentials and article text are never logged.'};}
