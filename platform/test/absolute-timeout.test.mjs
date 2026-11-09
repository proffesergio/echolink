import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {outbound} from '../server/net.mjs';
test('an upstream that keeps sending data cannot hold a generation request beyond its absolute deadline',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.write('starting');const timer=setInterval(()=>res.write('.'),10);res.on('close',()=>clearInterval(timer));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port,start=Date.now();
 try{await assert.rejects(()=>outbound(origin,{localOrigin:origin,timeout:80}),e=>e.status===504);assert(Date.now()-start<2000);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
