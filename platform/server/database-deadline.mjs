// A driver can time out a query yet leave connect/end waiting on a broken
// socket. Bound the complete session, including cleanup. A timeout during a
// write remains ambiguous and is handled by the existing delivery receipts.
export async function databaseSession(db,config,fn,{timeout=60000,cleanupTimeout=2000}={}){
 let timer,cleanupTimer,expired=false;
 const terminate=()=>{try{db.connection?.stream?.destroy();}catch{}};
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;terminate();const error=new Error('Website database deadline exceeded.');error.code='ETIMEDOUT';reject(error);},timeout);});
 const guarded=new Proxy(db,{get(target,key){if(key==='query')return (...args)=>{if(expired){const error=new Error('Database session expired before query.');error.code='ETIMEDOUT';return Promise.reject(error);}return target.query(...args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 try{return await Promise.race([(async()=>{await db.connect();if(expired)throw Error('Database session expired before query.');return fn(guarded,config);})(),deadline]);}
 finally{clearTimeout(timer);await Promise.race([Promise.resolve().then(()=>db.end()).catch(()=>{}),new Promise(resolve=>{cleanupTimer=setTimeout(()=>{terminate();resolve();},cleanupTimeout);})]);clearTimeout(cleanupTimer);}
}
