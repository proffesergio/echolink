// The approved charcoal/coral design, connected to the authenticated worker.
// A saved setting is never treated as proof that a service is reachable.
const connectionState={search:'',category:'All',configuredOnly:false,tests:new Map(),testing:false,drawer:null,opener:null};
const iconPaths={
  overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  operations:'M2 12h4l3-8 6 16 3-8h4',queue:'M4 4h16v16H4z M4 14h5l2 3h2l2-3h5',
  drafts:'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5',scheduled:'M4 5h16v16H4z M4 10h16 M8 2v6 M16 2v6',
  published:'M9 12l2 2 4-4 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  connections:'M8 3v4 M16 17v4 M5 7h6v5H5z M13 12h6v5h-6z M8 12v4h8 M16 3v9',
  pages:'M3 5h18v14H3z M8 9h3 M8 13h8',feeds:'M4 4a16 16 0 0 1 16 16 M4 11a9 9 0 0 1 9 9 M5 20h.01',
  workflow:'M6 5h12 M6 19h12 M12 5v14 M3 2h6v6H3z M15 16h6v6h-6z',
  activity:'M3 17l5-7 4 4 7-11 M3 21h18',settings:'M4 7h16 M4 17h16 M8 3v8 M16 13v8',
  guide:'M12 5c-3-3-7-3-10-1v15c3-2 7-2 10 1 3-3 7-3 10-1V4c-3-2-7-2-10 1z M12 5v15',
  facebook:'M14 22v-9h3l1-4h-4V6c0-1 1-2 2-2h3V1h-3c-4 0-6 2-6 6v2H7v4h3v9',
  sheets:'M5 2h10l4 4v16H5z M14 2v5h5 M8 11h8v8H8z M8 15h8 M12 11v8',
  n8n:'M5 6h4 M15 18h4 M9 6l6 12 M9 18l6-12 M1 3h5v6H1z M18 15h5v6h-5z',
  airtable:'M3 4h18v16H3z M3 10h18 M10 4v16',neon:'M4 20V4h16v16h-5L9 9v11',
  ollama:'M5 11V6l4 3h6l4-3v5 M4 12h16v8H4z M8 15h.01 M16 15h.01 M9 18h6',
  ai:'M8 8h8v8H8z M5 5h14v14H5z M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M19 9h3 M2 15h3 M19 15h3',
  website:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M2 12h20 M12 2a20 20 0 0 1 0 20 20 20 0 0 1 0-20',
  search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',play:'M8 4l12 8-12 8z',
};
function uiIcon(name){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${iconPaths[name]||iconPaths.ai}"></path></svg>`;}
function connectionCategory(c){return !c.implemented?'Planned':({AI:'Local AI',Data:'Data & logs',Reporting:'Data & logs'})[c.category]||c.category;}
function connectionList(){
  const items=[...(state.integrations||[])];
  if(!items.some(c=>c.id==='website'))items.push({id:'website',name:'NobleSeek website',category:'Website',implemented:true,configured:!!configuration.website?.databaseConfigured,status:configuration.website?.databaseConfigured?'Saved':'Setup needed',target:'connections',description:'Optional website publication for selected Pages. Link comments are a separate choice.'});
  return items;
}
function connectionHealth(c){
  const tested=connectionState.tests.get(c.id);
  if(tested)return {...tested,detail:tested.message+' · '+new Date(tested.at).toLocaleTimeString()};
  if(!c.implemented)return {label:'Planned',tone:'neutral',detail:'Connector development required'};
  if(c.id==='facebook'){
    const paused=(state.delivery||[]).find(d=>d.paused_reason);
    if(paused)return {label:'Needs attention',tone:'warning',detail:paused.paused_reason};
    const records=configuration.facebookConnections||[],latest=records[0];
    if(records.some(r=>r.expiresAt&&Date.parse(r.expiresAt)<=Date.now()||r.dataAccessExpiresAt&&Date.parse(r.dataAccessExpiresAt)<=Date.now()))return {label:'Needs attention',tone:'warning',detail:'Authorization expiry reached; reconnect and test'};
    if(latest)return {label:'Verified previously',tone:'success',detail:'Checked '+new Date(latest.verifiedAt).toLocaleDateString()+' · '+(latest.noScheduledExpiry?'No scheduled token expiry':'Check token expiry')};
  }
  if(c.id==='n8n'){
    const p=configuration.workflow?.pipeline||state.workflow?.pipeline;
    if(p?.active&&(!p.schedule?.ready||p.tickStale||p.unpublishedChanges))return {label:'Needs attention',tone:'warning',detail:p.schedule?.reason||'Inspect the live schedule'};
    if(p?.active&&p.lastTickAt&&!p.tickStale)return {label:'Running',tone:'success',detail:'One-minute trigger · last tick '+p.lastTickAt+' UTC'};
    if(p&&!p.active)return {label:'Stopped',tone:'neutral',detail:'Workflow is paused'};
  }
  if(c.id==='sheets'){
    const mirror=(state.runs||[]).find(r=>r.job==='mirror'&&r.result?.sheets);
    if(mirror?.result?.sheets?.failed)return {label:'Needs attention',tone:'warning',detail:'Latest Sheets sync failed; check connection and tab'};
  }
  if(c.id==='embeddings'&&configuration.embeddingModel)return {label:'Saved',tone:'neutral',detail:'Embedding model configured · semantic skipping '+(configuration.semanticEnabled?'enabled':'disabled')};
  const configured=c.configured??['Configured','Saved'].includes(c.status);
  return {label:configured?'Saved':'Setup needed',tone:'neutral',detail:configured?'Settings saved · connection not tested':'No configuration saved'};
}
function providerCard(c){
  const health=connectionHealth(c),category=connectionCategory(c),configured=c.configured??['Configured','Saved'].includes(c.status);
  return `<article class="connection-card ${health.tone==='warning'?'attention-card':''}" data-connection-name="${esc((c.name+' '+category).toLowerCase())}" data-connection-category="${esc(category)}" data-configured="${!!configured}"><div class="provider-top"><div class="provider-identity"><span class="provider-icon">${uiIcon(c.id)}</span><div><h3>${esc(c.name)}</h3><small class="category-dot">${esc(category)}</small></div></div><span class="health health-${health.tone}">${esc(health.label)}</span></div><p class="connection-detail">${esc(health.detail)}</p><div class="connection-actions">${c.implemented?`<button type="button" data-connection-open="${esc(c.id)}">${health.tone==='warning'?'Resolve':'Configure'}</button>${canTestConnection(c.id)?`<button type="button" class="test-connection" data-connection-test="${esc(c.id)}" aria-label="Test ${esc(c.name)}" ${connectionState.testing?'disabled':''}>${uiIcon('play')}</button>`:''}`:'<span class="muted">Planned integration</span>'}</div></article>`;
}
function connectionsHub(){
  const items=connectionList(),categories=['All','Publishing','Local AI','Data & logs','Automation','Website','Notifications','Planned'];
  const problems=items.filter(c=>connectionHealth(c).tone==='warning');
  return `<div class="section-head connection-intro"><div><h2>Connection center</h2><p>Saved settings, verified tests and live worker signals. Choose a provider to manage its connection.</p></div><span class="muted">${items.filter(c=>c.implemented).length} available · ${items.filter(c=>!c.implemented).length} planned</span></div>${problems.length?`<div class="attention-strip"><strong>Action required: ${esc(problems.map(c=>c.name).join(', '))}</strong><p>Open the provider to inspect its status. Other services can continue independently.</p></div>`:''}<div class="connection-controls card"><div class="connection-toolbar"><label class="connection-search"><span class="sr-only">Find a connection</span>${uiIcon('search')}<input type="search" data-connection-search placeholder="Search connections…" value="${esc(connectionState.search)}"></label><div class="actions"><label class="switch-label"><input type="checkbox" data-configured-only ${connectionState.configuredOnly?'checked':''}>Configured only</label><button type="button" data-test-connections ${connectionState.testing?'disabled':''}>${connectionState.testing?'Testing connections…':'Test all configured'}</button></div></div><div class="category-chips" role="group" aria-label="Connection categories">${categories.filter(cat=>cat==='All'||items.some(c=>connectionCategory(c)===cat)).map(cat=>`<button type="button" data-connection-category-filter="${esc(cat)}" aria-pressed="${connectionState.category===cat}">${esc(cat)} <span>${cat==='All'?items.length:items.filter(c=>connectionCategory(c)===cat).length}</span></button>`).join('')}</div></div>${[['Available integrations',true],['Planned integrations',false]].map(([label,implemented])=>`<section class="provider-section" data-provider-section><div class="section-head"><h2>${label}</h2><span class="muted">${implemented?'Manage your connections':'Future adapters · cannot run yet'}</span></div><div class="connection-grid">${items.filter(c=>c.implemented===implemented).map(providerCard).join('')}</div></section>`).join('')}<div class="empty" id="connection-empty" hidden>No connections match these filters.</div><p class="muted">Local models run on the worker PC. Saved credentials are never returned to your browser.</p>`;
}
function filterConnections(){
  let visible=0;
  document.querySelectorAll('[data-connection-name]').forEach(card=>{card.hidden=!(card.dataset.connectionName.includes(connectionState.search.toLowerCase())&&(connectionState.category==='All'||card.dataset.connectionCategory===connectionState.category)&&(!connectionState.configuredOnly||card.dataset.configured==='true'));if(!card.hidden)visible++;});
  document.querySelectorAll('[data-provider-section]').forEach(section=>section.hidden=![...section.querySelectorAll('[data-connection-name]')].some(card=>!card.hidden));
  const empty=document.querySelector('#connection-empty');if(empty)empty.hidden=visible>0;
}
function connectionSettingsForm(title,fields,description=''){
  return `<div class="card"><h2>${esc(title)}</h2><p>${esc(description||'Leave secret fields blank to keep saved credentials.')}</p><form id="connection-settings-form">${fields}<button class="primary" type="submit">Save connection settings</button></form></div>`;
}
function facebookTokenView(){return `<div class="card"><h2>Facebook Page token</h2><p>Save a Page token under an alias and assign it to the matching Page. Use the long-lived setup below for continuing access.</p><form id="fb-secret">${input('alias','primary-page')}${input('graphVersion',state.graphVersion||configuration.graphVersion)}${input('value','','password')}<p class="muted">Saved aliases: ${esc((state.facebookAliases||[]).join(', ')||'none')}</p><button class="primary">Save Facebook token</button></form><button type="button" data-connection-test="facebook">Test Facebook Page</button></div>`;}
function drawerContent(id){
  const c=configuration;
  if(id==='facebook')return facebookTokenView()+facebookReconnectView()+`<details><summary>Token setup instructions</summary>${connectionInstructions()}</details>`;
  if(id==='sheets')return sheetsView()+`<details><summary>Service account setup instructions</summary>${connectionInstructions()}</details>`;
  if(id==='n8n')return n8nCredentialView()+`<div class="card"><h2>Live schedule</h2><p>${esc(c.workflow?.pipeline?.schedule?.reason||'Check the workflow status')}</p><div class="actions"><button type="button" data-connection-test="n8n">Test n8n API</button><button data-action="workflow-repair">Repair one-minute trigger</button><button data-action="workflow-start">Start workflow</button><button data-action="workflow-stop">Stop workflow</button></div><button data-drawer-navigate="workflow">Open workflow &amp; activity</button></div>`;
  if(id==='airtable')return connectionSettingsForm('Airtable',input('airtableBaseId',c.airtableBaseId)+input('airtableToken','','password'))+`<button data-connection-test="airtable">Test Airtable</button><p>Manage Page and feed records through Pages &amp; models and News feeds.</p>`;
  if(id==='neon')return connectionSettingsForm('Neon PostgreSQL',input('databaseURL','','password')+input('directDatabaseURL','','password'))+`<button data-connection-test="neon">Test Neon database</button>`;
  if(id==='embeddings')return connectionSettingsForm('Semantic deduplication',check('semanticEnabled',c.semanticEnabled)+input('embeddingURL',c.embeddingURL)+input('embeddingModel',c.embeddingModel)+input('embeddingToken','','password')+input('semanticThreshold',c.semanticThreshold,'number')+input('semanticTTLDays',c.semanticTTLDays,'number'),'Exact URL/title checks stay active. Enable semantic skipping only after evaluating an embedding model.')+`<button data-drawer-navigate="settings">Open all model settings</button>`;
  if(id==='website')return connectionSettingsForm('Optional website publishing',check('websiteEnabled',c.website?.enabled)+input('websitePageIds',(c.website?.pageIds||[]).join(', '))+check('websiteRequired',c.website?.requireBeforeFacebook)+input('websiteURL',c.website?.siteURL||'https://www.fabrything.com')+input('websiteAPIURL',c.website?.apiBaseURL||'https://fabrythingapi.vercel.app/api/store/nobleseek')+input('websiteSchema',c.website?.schema||'public')+input('websiteCategory',c.website?.categoryId||'')+input('websiteDatabaseURL','','password'),'Enable website delivery only for the numeric Facebook Page IDs listed. Leave the database credential blank to keep it. Required website delivery holds Facebook if website publication fails.')+`<button data-connection-test="website">Test website database</button><p>Automatic Facebook link comments: <strong>${c.automaticLinksEnabled?'enabled':'disabled'}</strong>. This setting is independent; changing website publication never enables link comments.</p>`;
  if(['ollama','lm-studio','localai','neon-ai-gateway'].includes(id)){
    const name=connectionList().find(p=>p.id===id)?.name,pages=(state.pages||[]).filter(p=>p.fields['AI Infrastructure Target']===name);
    return (id==='neon-ai-gateway'?connectionSettingsForm('Neon AI Gateway',input('gatewayURL',c.gatewayURL||'')+input('gatewayToken','','password'),'Use the server-side gateway base URL and credential. Choose the model for each Page.'): '')+`<div class="card"><h2>${esc(name)} model connections</h2><p>Models and endpoints are configured per Page. The worker reaches local AI endpoints on your PC, even when you use the live dashboard.</p>${pages.map(p=>`<div class="record"><strong>${esc(p.fields['FB Page Name'])}</strong><small>${esc(p.fields['Model Identifier'])} · ${esc(p.fields['Local Endpoint URL'])}</small></div>`).join('')||'<p>No Page uses this engine yet.</p>'}<button data-drawer-navigate="pages">Manage Pages &amp; models</button>${pages.length?`<button data-connection-test="${esc(id)}">Discover installed models</button>`:''}</div><div class="card"><h2>Optional AI authentication</h2><form id="ai-secret">${input('alias','local-model')}${input('value','','password')}<p class="muted">Use the saved alias in the Page configuration. Native Ollama usually needs no token.</p><button class="primary">Save AI token</button></form></div>`;
  }
  return connectionSettingsForm('Slack approvals',input('approvalWebhook','','password')+check('clearApprovalWebhook',false),`Incoming webhook: ${c.approvalWebhookConfigured?'saved':'missing'}. Save an incoming webhook from hooks.slack.com/services/ to notify reviewers. No test notification is sent.`);
}
function openConnection(id,opener){
  const item=connectionList().find(c=>c.id===id);if(!item?.implemented)return;
  const dialog=$('#connection-drawer');connectionState.drawer=id;connectionState.opener=opener||document.activeElement;
  $('#drawer-title').textContent=item.name+' settings';$('#drawer-icon').innerHTML=uiIcon(id);dialog.querySelector('.drawer-body').innerHTML=drawerContent(id);
  if(!dialog.open)dialog.showModal();dialog.querySelector('[data-connection-close]').focus();
}
function updateConnectionDrawer(){
  const dialog=$('#connection-drawer');
  if(!dialog?.open||formDirty||!connectionState.drawer)return;
  const hadFocus=dialog.contains(document.activeElement);
  dialog.querySelector('.drawer-body').innerHTML=drawerContent(connectionState.drawer);
  if(hadFocus)dialog.querySelector('[data-connection-close]').focus();
}
function closeConnection(){
  if(formDirty&&!confirm('Close without saving these changes?'))return;
  $('#connection-drawer').close();connectionState.drawer=null;formDirty=false;connectionState.opener?.focus();
}
function scrollConnection(id){openConnection(id);}
function canTestConnection(id){return ['facebook','sheets','airtable','neon','n8n','website','ollama','lm-studio','localai','neon-ai-gateway'].includes(id);}
async function testConnection(id){
  const item=connectionList().find(c=>c.id===id);if(!item?.implemented||!canTestConnection(id))return;
  let path,body={};
  if(id==='facebook'){
    const page=state.pages.find(p=>p.fields['FB Page ID']&&p.fields['FB Secret Alias']);
    if(!page)throw new Error('Configure a Facebook Page ID and saved token alias in Pages & models.');
    path='test-facebook';body={alias:page.fields['FB Secret Alias'],pageId:page.fields['FB Page ID']};
  }else if(['ollama','lm-studio','localai','neon-ai-gateway'].includes(id)){
    const page=state.pages.find(p=>p.fields['AI Infrastructure Target']===item.name);
    if(!page)throw new Error('Assign this engine to a Page before testing it.');
    path='models';body={endpoint:page.fields['Local Endpoint URL'],alias:page.fields['AI Secret Alias']};
  }else path=({sheets:'test-sheets',airtable:'test-airtable',neon:'test-database',n8n:'test-n8n',website:'test-website'})[id];
  try{
    const result=await api(path,body);if(result.result?.failed||result.failed)throw new Error(result.error||result.result?.error||'Connection test failed');
    const message=path==='models'?'Model discovery passed ('+(result.models||[]).length+' models); inference not tested':'Connection test passed';
    connectionState.tests.set(id,{label:'Test passed',tone:'success',message,at:Date.now()});return result;
  }catch(error){connectionState.tests.set(id,{label:'Needs attention',tone:'warning',message:error.message,at:Date.now()});throw error;}
}
async function saveConnectionForm(form=$('#connection-settings-form')){
  const body=Object.fromEntries(new FormData(form));
  for(const name of ['semanticEnabled','websiteEnabled','websiteRequired','clearApprovalWebhook'])if(form.elements[name])body[name]=form.elements[name].checked;
  await api('settings',body);form.reset();formDirty=false;await refresh();notice('Connection settings saved. Use Test to verify access.');
}
function closeNavigation(){document.body.classList.remove('nav-open');$('.menu-toggle')?.setAttribute('aria-expanded','false');$('.nav-scrim').hidden=true;}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.shell==='menu'){document.body.classList.toggle('nav-open');button.setAttribute('aria-expanded',String(document.body.classList.contains('nav-open')));$('.nav-scrim').hidden=!document.body.classList.contains('nav-open');return;}
  if(button.dataset.shell==='close'){closeNavigation();return;}
  if(button.hasAttribute('data-connection-close')){closeConnection();return;}
  if(button.dataset.connectionOpen){openConnection(button.dataset.connectionOpen,button);return;}
  if(button.dataset.drawerNavigate){const next=button.dataset.drawerNavigate;closeConnection();if($('#connection-drawer').open)return;tab=next;render();return;}
  if(button.dataset.connectionCategoryFilter){connectionState.category=button.dataset.connectionCategoryFilter;document.querySelectorAll('[data-connection-category-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));filterConnections();return;}
  if(button.dataset.connectionTest||button.hasAttribute('data-test-connections')){
    if(connectionState.testing)return;connectionState.testing=true;button.disabled=true;
    try{
      const ids=button.dataset.connectionTest?[button.dataset.connectionTest]:connectionList().filter(c=>c.implemented&&c.configured&&canTestConnection(c.id)).map(c=>c.id),failures=[];
      for(const id of ids){try{await testConnection(id);}catch(error){failures.push(id+': '+error.message);}}
      formDirty=false;await refresh();notice(failures.length?failures.join(' · '):ids.length+' connection test(s) passed. No posts or notifications were sent.',!!failures.length);
    }finally{connectionState.testing=false;button.disabled=false;if(tab==='connections'&&!formDirty){$('#view').innerHTML=connectionsHub();filterConnections();}}
  }
});
document.addEventListener('change',event=>{if(event.target.hasAttribute('data-configured-only')){connectionState.configuredOnly=event.target.checked;filterConnections();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeNavigation();});
document.querySelector('#connection-drawer').addEventListener('cancel',event=>{event.preventDefault();closeConnection();});
