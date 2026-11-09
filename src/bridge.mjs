import './env.mjs';
import {createServer} from 'node:http';
import {authorized} from './core.mjs';
const key=process.env.WORKER_BRIDGE_TOKEN;
if(!key||key.length<32)throw new Error('WORKER_BRIDGE_TOKEN must contain at least 32 characters');
const port=Number(process.env.BRIDGE_PORT||8788),worker=`http://127.0.0.1:${process.env.PORT||8787}`,platform=`http://127.0.0.1:${process.env.PLATFORM_PORT||8790}`;
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const reject=(status,message)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify({error:message}));};
  if(!authorized('Bearer '+(req.headers['x-echolink-bridge-key']||''),key))return reject(401,'Bridge authentication required');
  const path=new URL(req.url,'http://bridge.invalid').pathname;
  const isPlatform=/^\/api\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)*\/?$/.test(path)&&!path.includes('..');
  const isLegacy=/^\/admin\/api\/[a-z][a-z0-9-]+$/.test(req.url)&&req.url!=='/admin/api/ticket';
  if(!(isPlatform&&['GET','HEAD','POST','PUT','DELETE','PATCH'].includes(req.method)||isLegacy&&['GET','POST'].includes(req.method)))return reject(404,'Dashboard route not found');
  try{
    let length=0;const chunks=[];
    for await(const c of req){length+=c.length;if(length>(isPlatform?(new URL(req.url,'http://bridge.local').pathname==='/api/brand-fonts'?3_000_000:1_000_000):131072))return reject(413,'Request too large');chunks.push(c);}
    const headers={Accept:'application/json'};
    for(const name of ['origin','cookie','content-type','x-workspace-id','stripe-signature','user-agent'])if(req.headers[name])headers[name]=req.headers[name];
    const upstream=await fetch((isPlatform?platform:worker)+req.url,{method:req.method,headers,...(chunks.length?{body:Buffer.concat(chunks)}:{}),redirect:'manual',signal:AbortSignal.timeout(250000)});
    const cookies=upstream.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    if(upstream.headers.has('location'))res.setHeader('Location',upstream.headers.get('location'));
    res.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')||'application/json'});res.end(Buffer.from(await upstream.arrayBuffer()));
  }catch{reject(502,'Local worker unavailable');}
});
server.listen(port,'127.0.0.1',()=>console.log(`EchoLink protected dashboard bridge listening at http://127.0.0.1:${server.address().port}`));
