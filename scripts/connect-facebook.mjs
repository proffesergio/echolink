import '../src/env.mjs';
import {exchangePageToken,tokenFingerprint} from '../src/facebook-auth.mjs';
import {FacebookError,clearConnectionPause} from '../src/facebook.mjs';
import {saveSettings} from '../src/settings.mjs';
import {query,closePools} from '../src/db.mjs';
const [alias,pageId]=process.argv.slice(2);
try{
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(alias||'')||!/^\d+$/.test(pageId||''))throw new Error('Usage: node scripts/connect-facebook.mjs TOKEN_ALIAS NUMERIC_PAGE_ID');
  const {token,connection}=await exchangePageToken({appId:process.env.META_APP_ID,appSecret:process.env.META_APP_SECRET,userToken:process.env.META_USER_ACCESS_TOKEN,pageId,version:process.env.META_GRAPH_VERSION});
  await saveSettings({FB_TOKENS_JSON:JSON.stringify({...JSON.parse(process.env.FB_TOKENS_JSON||'{}'),[alias]:token}),
    FB_CONNECTIONS_JSON:JSON.stringify({...JSON.parse(process.env.FB_CONNECTIONS_JSON||'{}'),[alias]:{...connection,fingerprint:tokenFingerprint(token)}}),META_USER_ACCESS_TOKEN:''});
  const linked=(await query("SELECT id FROM echolink.configurations WHERE kind='page' AND config->>'fbSecret'=$1 AND config->>'fbPageId'=$2",[alias,pageId])).rows;
  for(const p of linked)await clearConnectionPause(p.id);
  console.log(JSON.stringify({alias,connection,authPausesCleared:linked.length,userAuthorizationCleared:true}));
}catch(error){console.error(error instanceof FacebookError?error.diagnostic:'Facebook setup failed; inspect the supplied settings and local database connectivity.');process.exitCode=1;}
finally{await closePools();}
