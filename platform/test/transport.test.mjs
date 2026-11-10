import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {outbound,remoteJSON} from '../server/net.mjs';
test('bounded provider transport rejects redirects and oversize payloads and classifies explicit rejection',async()=>{
 const server=createServer((req,res)=>{if(req.url==='/redirect'){res.writeHead(302,{location:'http://127.0.0.1/private'});res.end();}else if(req.url==='/large')res.end('x'.repeat(2000));else if(req.url==='/rejected'){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{code:190,message:'A remote diagnostic that must not be copied blindly'}}));}else{res.writeHead(200,{'content-type':'application/json'});res.end('{"ready":true}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{assert.deepEqual(await remoteJSON(base,{localOrigin:base}),{ready:true});await assert.rejects(()=>outbound(base+'/redirect',{localOrigin:base}),e=>e.status===400);await assert.rejects(()=>outbound(base+'/large',{localOrigin:base,maxBytes:100}),e=>e.status===413);await assert.rejects(()=>remoteJSON(base+'/rejected',{localOrigin:base}),e=>e.definiteRejection===true&&e.upstreamStatus===400&&!e.message.includes('remote diagnostic'));}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('local context overflow reports safe token counts without exposing the upstream payload',async()=>{
 const server=createServer((_req,res)=>{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:'request (7317 tokens) exceeds the available context size (4096 tokens), try increasing it PRIVATE'}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{await assert.rejects(()=>remoteJSON(base,{localOrigin:base}),e=>e.code==='inference_context_limit'&&e.status===422&&e.message.includes('7317')&&!e.message.includes('PRIVATE'));}
 finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
