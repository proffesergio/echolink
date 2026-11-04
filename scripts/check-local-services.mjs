import '../src/env.mjs';
const checks=[
  ['Worker','http://127.0.0.1:8787/health',{}],
  ['Bridge','http://127.0.0.1:8788/admin/api/auth',{'X-EchoLink-Bridge-Key':process.env.WORKER_BRIDGE_TOKEN}],
  ['HTTPS tunnel',process.env.WORKER_ORIGIN+'/admin/api/auth',{'X-EchoLink-Bridge-Key':process.env.WORKER_BRIDGE_TOKEN}],
  ['Public dashboard',process.env.DASHBOARD_PUBLIC_ORIGIN+'/admin/api/auth',{}],
  ['Ollama','http://127.0.0.1:11434/api/tags',{}],
  ['n8n','http://127.0.0.1:5678/healthz',{}],
];
let failures=0;
for(const [name,url,headers] of checks){
  try{
    const response=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
    const json=(response.headers.get('content-type')||'').includes('json');
    const data=json?await response.json():{};
    if(!response.ok||!json){failures++;console.log(`FAIL ${name}: HTTP ${response.status}${!json?' (not JSON)':''}`);}
    else console.log(`PASS ${name}: HTTP ${response.status}${name==='Ollama'?'; '+(data.models||[]).map(m=>m.name).join(', '):''}`);
  }catch(error){failures++;console.log(`FAIL ${name}: ${error.cause?.code||error.name}`);}
}
if(failures){console.log('Run npm run public:repair on this Windows PC to recover the bridge/tunnel; keep n8n and Ollama running.');process.exitCode=1;}
