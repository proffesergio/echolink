import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
import '../server/env.mjs';
import {stripeWebhook,checkout,billingPortal} from '../server/billing.mjs';
import {query,transaction,closeDatabase} from '../server/db.mjs';
test('Stripe signature verification and event idempotency work without making provider calls',async()=>{
 if(process.env.PLATFORM_BRANCH!=='echolink-platform-local'||new URL(process.env.DATABASE_URL).pathname!=='/creator_test')throw new Error('Use isolated test database.');
 const oldKey=process.env.STRIPE_SECRET_KEY,oldSecret=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_SECRET_KEY='sk_test_local_fixture';process.env.STRIPE_WEBHOOK_SECRET='whsec_'+randomUUID();
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY),eventId='evt_fixture_'+randomUUID(),payload=JSON.stringify({id:eventId,type:'fixture.no_subscription',data:{object:{}}}),header=stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
 try{
  await assert.rejects(()=>stripeWebhook(payload+' ',header),e=>e.status===400);
  assert.deepEqual(await stripeWebhook(payload,header),{received:true});assert.deepEqual(await stripeWebhook(payload,header),{received:true,duplicate:true});
  assert.equal((await query("SELECT count(*)::int AS count FROM creator.billing_events WHERE provider='stripe' AND event_id=$1",[eventId])).rows[0].count,1);
 }finally{await query("DELETE FROM creator.billing_events WHERE provider='stripe' AND event_id=$1",[eventId]);process.env.STRIPE_SECRET_KEY=oldKey||'';process.env.STRIPE_WEBHOOK_SECRET=oldSecret||'';await closeDatabase();}
});
test('lost Stripe responses reuse a committed checkout key and existing subscriptions use the customer portal',async()=>{
 if(new URL(process.env.DATABASE_URL).pathname!=='/creator_test')throw new Error('Use isolated test database.');
 const id=randomUUID(),planId='fixture-'+id;let account,workspace,oldEnabled;const calls=[],sessions=new Map();let loseResponse=true;
 const sdk={checkout:{sessions:{async create(payload,options){calls.push({payload,key:options.idempotencyKey});let session=sessions.get(options.idempotencyKey);if(!session){session={id:'cs_'+randomUUID(),url:'https://checkout.stripe.com/fixture',status:'open'};sessions.set(options.idempotencyKey,session);}if(loseResponse){loseResponse=false;throw new Error('simulated lost response');}return session;},async retrieve(sessionId){return [...sessions.values()].find(s=>s.id===sessionId);}}},billingPortal:{sessions:{async create(body){assert.equal(body.customer,'cus_'+id);return {url:'https://billing.stripe.com/fixture'};}}}};
 try{
  await transaction(null,async db=>{oldEnabled=(await db.query("SELECT enabled FROM creator.payment_methods WHERE id='stripe'")).rows[0].enabled;await db.query("UPDATE creator.payment_methods SET enabled=true WHERE id='stripe'");await db.query('INSERT INTO creator.plans(id,name,page_limit,post_limit,generation_limit,period_days,usd_minor) VALUES($1,$2,3,90,180,30,1000)',[planId,'Fixture']);account=(await db.query("INSERT INTO creator.accounts(auth_subject,email,name) VALUES($1,$2,'Billing fixture') RETURNING id",[id,id+'@example.com'])).rows[0].id;workspace=(await db.query("INSERT INTO creator.workspaces(name,owner_id) VALUES('Billing fixture',$1) RETURNING id",[account])).rows[0].id;await db.query("INSERT INTO creator.subscriptions(workspace_id,plan_id) VALUES($1,'free')",[workspace]);},{owner:true});
  const actor={workspaceId:workspace,email:id+'@example.com'},body={plan_id:planId,currency:'USD'};
  await assert.rejects(()=>checkout(actor,body,sdk),/lost response/);
  const retries=await Promise.all(Array.from({length:3},()=>checkout(actor,body,sdk)));assert(retries.every(r=>r.url==='https://checkout.stripe.com/fixture'));assert.equal(new Set(calls.map(c=>c.key)).size,1);assert.equal(sessions.size,1);assert(calls.every(c=>JSON.stringify(c.payload)===JSON.stringify(calls[0].payload)));
  assert.equal((await transaction(workspace,db=>db.query('SELECT plan_id FROM creator.subscriptions WHERE workspace_id=$1',[workspace]))).rows[0].plan_id,'free','checkout does not grant paid access');
  [...sessions.values()][0].status='complete';await assert.rejects(()=>checkout(actor,body,sdk),e=>e.status===409);
  await transaction(workspace,db=>db.query("UPDATE creator.subscriptions SET provider='stripe',provider_customer=$2,provider_subscription=$3 WHERE workspace_id=$1",[workspace,'cus_'+id,'sub_'+id]));
  assert.equal((await checkout(actor,body,sdk)).url,'https://billing.stripe.com/fixture');assert.equal((await billingPortal(actor,sdk)).url,'https://billing.stripe.com/fixture');assert.equal(sessions.size,1);
 }finally{await transaction(null,async db=>{if(workspace){await db.query('DELETE FROM creator.checkout_intents WHERE workspace_id=$1',[workspace]);await db.query('DELETE FROM creator.subscriptions WHERE workspace_id=$1',[workspace]);await db.query('DELETE FROM creator.workspaces WHERE id=$1',[workspace]);}if(account)await db.query('DELETE FROM creator.accounts WHERE id=$1',[account]);await db.query('DELETE FROM creator.plans WHERE id=$1',[planId]);if(oldEnabled!==undefined)await db.query("UPDATE creator.payment_methods SET enabled=$1 WHERE id='stripe'",[oldEnabled]);},{owner:true});await closeDatabase();}
});
