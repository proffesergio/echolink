const routes=new Set(['auth','login','session','logout','password','configuration','state','workflow','test-database','test-airtable','settings','page','feed','secret','hosts','models','test-model','test-facebook','decision','retry','job','preview','enable-feeds','draft','sheets','test-sheets','sync-sheets','article-action']);
const fail=(res,status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error}));};
export default async function proxy(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const route=req.query?.path||new URL(req.url,'https://proxy.invalid').searchParams.get('path');
    if(!routes.has(route))return fail(res,404,'Unknown dashboard endpoint');
    if(!['GET','POST'].includes(req.method))return fail(res,405,'Method not allowed');
    if(!process.env.DASHBOARD_PUBLIC_ORIGIN||!process.env.WORKER_ORIGIN)return fail(res,502,'Dashboard proxy settings are missing. Configure the public origin and worker tunnel, then redeploy.');
    let publicURL,worker;
    try{publicURL=new URL(process.env.DASHBOARD_PUBLIC_ORIGIN);worker=new URL(process.env.WORKER_ORIGIN);}catch{return fail(res,502,'Dashboard proxy origins are invalid. Check the Vercel production settings and redeploy.');}
    if(publicURL.protocol!=='https:'||publicURL.origin!==process.env.DASHBOARD_PUBLIC_ORIGIN||worker.protocol!=='https:'||worker.username||worker.password||worker.pathname!=='/'||worker.search||worker.hash)return fail(res,502,'Dashboard proxy origins must be HTTPS origins without credentials or worker paths.');
    if(req.method==='POST'&&req.headers.origin!==publicURL.origin)return fail(res,403,'Dashboard origin required');
    const headers={'Accept':'application/json',Origin:publicURL.origin};
    if(process.env.WORKER_BRIDGE_TOKEN)headers['X-EchoLink-Bridge-Key']=process.env.WORKER_BRIDGE_TOKEN;
    if(req.headers.cookie)headers.Cookie=req.headers.cookie;
    if(process.env.CF_ACCESS_CLIENT_ID&&process.env.CF_ACCESS_CLIENT_SECRET){headers['CF-Access-Client-Id']=process.env.CF_ACCESS_CLIENT_ID;headers['CF-Access-Client-Secret']=process.env.CF_ACCESS_CLIENT_SECRET;}
    let body;
    if(req.method==='POST'){
      body=typeof req.body==='string'?req.body:Buffer.isBuffer(req.body)?req.body:JSON.stringify(req.body||{});
      if(Buffer.byteLength(body)>131072)return fail(res,413,'Request too large');
      headers['Content-Type']='application/json';
    }
    let response;
    try{response=await fetch(new URL('/admin/api/'+route,worker),{method:req.method,headers,body,redirect:'error',signal:AbortSignal.timeout(245000)});}
    catch(error){
      const timeout=['TimeoutError','AbortError'].includes(error.name);
      return fail(res,timeout?504:502,timeout?'The local worker took too long to respond. Check Activity before retrying; CPU model generation may still be running.':'The worker tunnel is offline or its address expired. On the Windows PC run npm run public:repair, then reload this dashboard.');
    }
    if(response.status===401&&!response.headers.get('content-type')?.includes('application/json'))return fail(res,502,'The tunnel requires access credentials. Check the Vercel bridge or Cloudflare Access settings.');
    if(!(response.headers.get('content-type')||'').includes('application/json'))return fail(res,502,'Worker did not return JSON. Check the tunnel and Cloudflare Access service token.');
    const payload=await response.text();
    res.statusCode=response.status;res.setHeader('Content-Type','application/json');
    const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.end(payload);
  }catch{return fail(res,502,'Local worker unreachable or proxy configuration invalid. Check PC, tunnel and deployment settings.');}
}
