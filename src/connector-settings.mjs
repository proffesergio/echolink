import {validateWebsiteConfiguration} from './website.mjs';
export class ConnectorSettingError extends Error{}
export function connectorSettings(body,env=process.env){
  const values={};
  const bool=(field,key)=>{if(body[field]!==undefined){if(typeof body[field]!=='boolean')throw new ConnectorSettingError('Invalid '+field);values[key]=String(body[field]);}};
  for(const [field,key]of [['websiteEnabled','NOBLESEEK_ENABLED'],['websiteRequired','NOBLESEEK_REQUIRE_BEFORE_FACEBOOK']])bool(field,key);
  for(const [field,key]of [['websiteURL','NOBLESEEK_SITE_URL'],['websiteAPIURL','NOBLESEEK_API_BASE_URL'],['websiteSchema','NOBLESEEK_DATABASE_SCHEMA'],['websiteCategory','NOBLESEEK_CATEGORY_ID']])if(body[field]!==undefined)values[key]=String(body[field]).trim();
  if(body.websitePageIds!==undefined){const ids=String(body.websitePageIds).split(',').map(s=>s.trim()).filter(Boolean);if(ids.some(id=>!/^\d+$/.test(id)))throw new ConnectorSettingError('Website Page IDs must be numeric, separated by commas.');values.NOBLESEEK_FACEBOOK_PAGE_IDS=[...new Set(ids)].join(',');}
  if(body.websiteDatabaseURL){let u;try{u=new URL(body.websiteDatabaseURL);}catch{}if(!u||!['postgres:','postgresql:'].includes(u.protocol))throw new ConnectorSettingError('Use a PostgreSQL website database URL.');values.NOBLESEEK_DATABASE_URL=body.websiteDatabaseURL;}
  if(Object.keys(values).some(k=>k.startsWith('NOBLESEEK_'))){
    const candidate={...env,...values};
    // Validate URL/schema constraints even when disabled, without requiring a
    // saved database just to turn website delivery off.
    try{validateWebsiteConfiguration({...candidate,NOBLESEEK_DATABASE_URL:candidate.NOBLESEEK_DATABASE_URL||'postgresql://localhost/placeholder'});}catch(error){throw new ConnectorSettingError(error.message);}
    if(candidate.NOBLESEEK_ENABLED==='true'&&!candidate.NOBLESEEK_DATABASE_URL)throw new ConnectorSettingError('Save a website database connection before enabling website delivery.');
  }
  if(body.gatewayURL!==undefined){
    let url;try{url=new URL(String(body.gatewayURL).trim());}catch{}
    if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new ConnectorSettingError('Use an HTTPS AI Gateway base URL without credentials or query parameters.');
    values.NEON_AI_GATEWAY_BASE_URL=url.href.replace(/\/$/,'').replace(/\/v1$/,'');
  }
  if(body.gatewayToken)values.NEON_AI_GATEWAY_TOKEN=String(body.gatewayToken);
  if(body.approvalWebhook){
    let url;try{url=new URL(body.approvalWebhook);}catch{}
    if(!url||url.protocol!=='https:'||url.hostname!=='hooks.slack.com'||url.username||url.password||url.search||url.hash||!url.pathname.startsWith('/services/'))throw new ConnectorSettingError('Use an HTTPS Slack incoming-webhook URL from hooks.slack.com/services/.');
    values.APPROVAL_NOTIFICATION_URL=url.href;
  }
  if(body.clearApprovalWebhook===true)values.APPROVAL_NOTIFICATION_URL='';
  return values;
}
