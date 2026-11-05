import {test} from 'node:test';
import assert from 'node:assert/strict';
import {connectorSettings} from '../src/connector-settings.mjs';
import {integrationCatalog} from '../src/integrations.mjs';

test('optional website controls are Page scoped and never modify Facebook link-comment policy',()=>{
  const env={NOBLESEEK_DATABASE_URL:'postgresql://test:test@localhost/site',NOBLESEEK_ENABLED:'false'};
  const values=connectorSettings({websiteEnabled:true,websitePageIds:'123, 456, 123',websiteRequired:false,websiteSchema:'public'},env);
  assert.equal(values.NOBLESEEK_ENABLED,'true');assert.equal(values.NOBLESEEK_FACEBOOK_PAGE_IDS,'123,456');
  assert.equal(values.FB_AUTOMATIC_LINKS_ENABLED,undefined);assert.equal(env.NOBLESEEK_ENABLED,'false');
  assert.deepEqual(connectorSettings({websiteEnabled:false},{}),{NOBLESEEK_ENABLED:'false'});
  for(const body of [{websiteEnabled:true,websitePageIds:'123'},{websiteEnabled:true,websitePageIds:'slug'},{websiteURL:'http://localhost'},{websiteSchema:'public;DROP TABLE x'},{websiteDatabaseURL:'https://example.com'},{websiteEnabled:'true'}])assert.throws(()=>connectorSettings(body,{}));
});
test('AI gateway and approval webhook settings validate URLs without making network calls',()=>{
  assert.deepEqual(connectorSettings({gatewayURL:'https://gateway.example.com/v1/',gatewayToken:'test-secret'}),{NEON_AI_GATEWAY_BASE_URL:'https://gateway.example.com',NEON_AI_GATEWAY_TOKEN:'test-secret'});
  assert.equal(connectorSettings({approvalWebhook:'https://hooks.slack.com/services/T/B/token'}).APPROVAL_NOTIFICATION_URL,'https://hooks.slack.com/services/T/B/token');
  assert.equal(connectorSettings({clearApprovalWebhook:true}).APPROVAL_NOTIFICATION_URL,'');
  for(const gatewayURL of ['http://example.com','https://user:password@example.com','https://example.com?key=secret'])assert.throws(()=>connectorSettings({gatewayURL}));
  for(const approvalWebhook of ['https://example.com/services/foo','https://hooks.slack.com.evil.example/services/x','http://hooks.slack.com/services/x'])assert.throws(()=>connectorSettings({approvalWebhook}));
});
test('provider inventory contains supported and planned adapters with honest saved states',()=>{
  const catalog=integrationCatalog([],{databaseConfigured:true,website:{databaseConfigured:true},embeddingModel:'embeddinggemma',embeddingURL:'http://localhost:11434/v1/embeddings'});
  assert.equal(catalog.length,16);assert.equal(catalog.filter(c=>!c.implemented).length,4);
  assert.equal(catalog.find(c=>c.id==='neon').status,'Saved');assert.equal(catalog.find(c=>c.id==='website').configured,true);
  assert.equal(catalog.find(c=>c.id==='embeddings').configured,true);assert.ok(!catalog.some(c=>c.status==='Connected'));
});
