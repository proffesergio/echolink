import Stripe from 'stripe';
import {createHash,randomUUID} from 'node:crypto';
import {transaction,workspaceLock,audit} from './db.mjs';
import {AppError} from './errors.mjs';
import {env} from './env.mjs';
let stripe;
function client(){const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new AppError(503,'The owner has not configured Stripe.');if(env().billingMode!=='live'&&!key.startsWith('sk_test_'))throw new AppError(409,'Sandbox billing requires a Stripe test key.');return stripe||=new Stripe(key);}
export async function grantPlan(db,workspaceId,planId,{provider='manual',customer=null,subscription=null,periodStart=new Date(),periodEnd}={}){
 await workspaceLock(db,workspaceId);const plan=(await db.query('SELECT * FROM creator.plans WHERE id=$1',[planId])).rows[0];if(!plan||plan.id==='free')throw new AppError(400,'Choose a premium plan.');
 const end=periodEnd||new Date(+periodStart+plan.period_days*86400000);
 await db.query(`UPDATE creator.subscriptions SET plan_id=$2,status='active',period_start=$3,period_end=$4,provider=$5,provider_customer=$6,provider_subscription=$7,updated_at=now() WHERE workspace_id=$1`,[workspaceId,planId,periodStart,end,provider,customer,subscription]);
}
export async function billingPortal(actor,sdk=client()){
 const subscription=await transaction(actor.workspaceId,async db=>(await db.query('SELECT provider_customer FROM creator.subscriptions WHERE workspace_id=$1',[actor.workspaceId])).rows[0]);
 if(!subscription?.provider_customer)throw new AppError(409,'No Stripe customer is connected to this workspace.');
 const session=await sdk.billingPortal.sessions.create({customer:subscription.provider_customer,return_url:env().origin+'/?view=billing'});return {url:session.url};
}
export async function checkout(actor,body,sdk=client()){
 if(!['USD','BDT'].includes(body.currency))throw new AppError(400,'Choose USD or BDT.');
 const {plan,method}=await transaction(actor.workspaceId,async db=>({plan:(await db.query("SELECT * FROM creator.plans WHERE id=$1 AND enabled AND id<>'free'",[body.plan_id])).rows[0],method:(await db.query("SELECT * FROM creator.payment_methods WHERE id='stripe' AND enabled")).rows[0]}));
 const amount=body.currency==='BDT'?plan?.bdt_minor:plan?.usd_minor;if(!plan||!method||!amount)throw new AppError(409,'This plan, currency or payment method is not configured for checkout.');
 const metadata={workspace_id:actor.workspaceId,plan_id:plan.id};
 // Commit the key and exact payload before contacting Stripe. A lost response must
 // retry that same operation, even if package prices change in the meantime.
 const intent=await transaction(actor.workspaceId,async db=>{
  await workspaceLock(db,actor.workspaceId);
  const subscription=(await db.query('SELECT * FROM creator.subscriptions WHERE workspace_id=$1',[actor.workspaceId])).rows[0];
  if(subscription?.provider_subscription&&subscription.provider_customer)return {portal:true};
  let prior=(await db.query('SELECT * FROM creator.checkout_intents WHERE workspace_id=$1',[actor.workspaceId])).rows[0];
  if(prior?.session_id){
   const session=await sdk.checkout.sessions.retrieve(prior.session_id);
   if(session.status==='complete')throw new AppError(409,'Payment is processing. Wait for your subscription to update before starting another checkout.');
   if(session.status==='expired'){await db.query('DELETE FROM creator.checkout_intents WHERE workspace_id=$1',[actor.workspaceId]);prior=null;}
   else if(prior.payload.metadata.plan_id===plan.id&&prior.payload.line_items[0].price_data.currency===body.currency.toLowerCase())return {url:session.url||prior.checkout_url};
   else throw new AppError(409,'Finish or let your existing checkout expire before choosing another package.');
  }
  if(prior){
   if(Date.now()-new Date(prior.created_at)>23*3600000)throw new AppError(409,'An earlier payment request needs owner reconciliation before a new checkout can start.');
   if(prior.payload.metadata.plan_id!==plan.id||prior.payload.line_items[0].price_data.currency!==body.currency.toLowerCase())throw new AppError(409,'Retry your original package and currency while the earlier payment request is being resolved.');
   return prior;
  }
  const payload={mode:'subscription',client_reference_id:actor.workspaceId,customer_email:actor.email,metadata,subscription_data:{metadata},line_items:[{price_data:{currency:body.currency.toLowerCase(),unit_amount:amount,recurring:{interval:'day',interval_count:plan.period_days},product_data:{name:'EchoLink '+plan.name}},quantity:1}],success_url:env().origin+'/?view=billing&billing=processing',cancel_url:env().origin+'/?view=billing&billing=canceled',expires_at:Math.floor(Date.now()/1000)+3600};
  return (await db.query('INSERT INTO creator.checkout_intents(workspace_id,intent_id,payload) VALUES($1,$2,$3) RETURNING *',[actor.workspaceId,randomUUID(),JSON.stringify(payload)])).rows[0];
 });
 if(intent.portal)return billingPortal(actor,sdk);if(intent.url)return {url:intent.url};
 const session=await sdk.checkout.sessions.create(intent.payload,{idempotencyKey:intent.intent_id});
 await transaction(actor.workspaceId,db=>db.query('UPDATE creator.checkout_intents SET session_id=$3,checkout_url=$4 WHERE workspace_id=$1 AND intent_id=$2',[actor.workspaceId,intent.intent_id,session.id,session.url]));
 return {url:session.url};
}
export async function stripeWebhook(raw,signature){
 if(!process.env.STRIPE_WEBHOOK_SECRET)throw new AppError(503,'Stripe webhook is not configured.');let event;
 try{event=client().webhooks.constructEvent(raw,signature,process.env.STRIPE_WEBHOOK_SECRET);}catch{throw new AppError(400,'Invalid Stripe webhook signature.');}
 const object=event.data.object;let subscriptionId=event.type.startsWith('customer.subscription.')?object.id:object.subscription||object.parent?.subscription_details?.subscription;
 if(typeof subscriptionId==='object')subscriptionId=subscriptionId.id;
 const subscription=subscriptionId?await client().subscriptions.retrieve(subscriptionId,{expand:['latest_invoice']}):null;
 return transaction(null,async db=>{
  const inserted=await db.query("INSERT INTO creator.billing_events(provider,event_id,payload_hash) VALUES('stripe',$1,$2) ON CONFLICT DO NOTHING RETURNING event_id",[event.id,createHash('sha256').update(raw).digest('hex')]);if(!inserted.rowCount)return {received:true,duplicate:true};
  const workspaceId=subscription?.metadata?.workspace_id,planId=subscription?.metadata?.plan_id;if(!workspaceId||!planId)return {received:true};
  const existing=(await db.query('SELECT * FROM creator.subscriptions WHERE workspace_id=$1',[workspaceId])).rows[0];if(!existing)return {received:true};
  const start=subscription.items?.data?.[0]?.current_period_start||subscription.current_period_start,end=subscription.items?.data?.[0]?.current_period_end||subscription.current_period_end;
  if(subscription.status==='active'&&subscription.latest_invoice?.status==='paid'&&start&&end){await grantPlan(db,workspaceId,planId,{provider:'stripe',customer:subscription.customer,subscription:subscription.id,periodStart:new Date(start*1000),periodEnd:new Date(end*1000)});}
  else if(existing.provider_subscription===subscription.id)await db.query("UPDATE creator.subscriptions SET status=$2,updated_at=now() WHERE workspace_id=$1",[workspaceId,['past_due','unpaid'].includes(subscription.status)?'past_due':'canceled']);
  await audit(db,workspaceId,null,'billing.stripe_event','subscription',subscription.id,{type:event.type});return {received:true};
 },{owner:true});
}
