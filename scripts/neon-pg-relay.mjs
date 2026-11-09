import {createServer} from 'node:net';
import WebSocket from '../platform/node_modules/ws/index.js';
// pg_dump speaks libpq/TCP. This loopback-only adapter carries those same bytes
// over Neon's TLS-verified WebSocket transport on restrictive Windows networks.
// It does not bypass authentication or service quotas.
export async function neonPgRelay(host,port='5432'){
 if(!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.neon\.tech$/i.test(host)||String(port)!=='5432')throw new Error('The PostgreSQL relay requires the configured Neon host on port 5432.');
 const sessions=new Set(),server=createServer(socket=>{
  const ws=new WebSocket(`wss://${host}/v2?address=${encodeURIComponent(host+':'+port)}`,{handshakeTimeout:15000,maxPayload:64*1024*1024});sessions.add(ws);socket.pause();
  ws.on('open',()=>socket.resume());socket.on('data',data=>{if(ws.readyState===WebSocket.OPEN)ws.send(data);});ws.on('message',data=>socket.write(Buffer.from(data)));
  const close=()=>{sessions.delete(ws);socket.destroy();ws.terminate();};socket.on('error',close);socket.on('close',close);ws.on('error',close);ws.on('close',()=>{sessions.delete(ws);socket.end();});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {port:server.address().port,close:async()=>{for(const ws of sessions)ws.terminate();await new Promise(resolve=>server.close(resolve));}};
}
