export function integrationCatalog(pages=[],configuration={}){
  let facebookTokenCount=0;try{facebookTokenCount=Object.keys(JSON.parse(process.env.FB_TOKENS_JSON||'{}')).length;}catch{}
  const engine=name=>pages.some(p=>p.fields['AI Infrastructure Target']===name&&p.fields['Model Identifier']);
  const entry=(id,name,category,configured,target,description,implemented=true)=>({id,name,category,status:implemented?(configured?'Configured':'Setup needed'):'Planned',target,description,implemented});
  return [
    entry('facebook','Facebook Pages','Publishing',!!process.env.META_GRAPH_VERSION&&facebookTokenCount>0,'connections','Page-token publishing, selected photos and delayed source comments.'),
    entry('sheets','Google Sheets','Reporting',configuration.googleSheets?.configured,'connections','Service-account connection; draft, schedule and publication log.'),
    entry('airtable','Airtable','Data',configuration.airtableTokenConfigured,'settings','Page/feed configuration and editorial records.'),
    entry('neon','Neon PostgreSQL','Data',configuration.databaseConfigured,'settings','Canonical content, approvals, deduplication and durable jobs.'),
    entry('n8n','n8n','Automation',configuration.n8nAPIKeyConfigured,'workflow','One connected workflow with dashboard Start/Stop.'),
    ...['Ollama','LM Studio','LocalAI','Neon AI Gateway'].map(name=>entry(name.toLowerCase().replaceAll(' ','-'),name,'AI',engine(name),'pages','Per-Page OpenAI-compatible endpoint, model, temperature and optional token alias.')),
    entry('embeddings','Local embeddings','AI',configuration.semanticEnabled,'settings','Optional semantic duplicate detection; evaluate thresholds before use.'),
    entry('slack','Slack approvals','Notifications',!!process.env.APPROVAL_NOTIFICATION_URL,'guide','Incoming-webhook notifications; configure APPROVAL_NOTIFICATION_URL locally.'),
    entry('postiz','Postiz','Publishing',false,'guide','Future social scheduling and additional networks.',false),
    entry('qdrant','Qdrant MCP','AI',false,'guide','Future alternative vector-memory connector.',false),
    entry('bright-data','Bright Data','Extraction',false,'guide','Future paid scraping fallback.',false),
    entry('decodo','Decodo','Extraction',false,'guide','Future paid extraction fallback.',false),
  ];
}
