import test from 'node:test';
import assert from 'node:assert/strict';
import {submitContact} from '../server/contact.mjs';
const body={name:'Demo client',email:'test@example.com',company:'Example brand',topic:'Demo & onboarding',message:'I would like a walkthrough for my business Page.',consent:true,website:''};
test('contact validation and the honeypot do not send or store invalid requests',async()=>{
 let calls=0;const options={save:async()=>{calls++;},notify:async()=>{calls++;}};
 await assert.rejects(()=>submitContact({...body,email:'invalid'},options),e=>e.status===400);await assert.rejects(()=>submitContact({...body,consent:false},options),e=>e.status===400);await submitContact({...body,website:'bot-filled'},options);assert.equal(calls,0);
});
test('a saved inquiry remains received if SMTP fails and duplicate submissions do not resend',async()=>{
 let saved,notifications=0;const first=await submitContact({...body,recipient:'attacker@example.com',role:'super_admin'},{save:async(data,hash)=>{saved=data;assert.match(hash,/^[a-f0-9]{64}$/);return {id:'fixture'};},notify:async()=>{notifications++;throw new Error('mail unavailable');}});
 assert.equal(first.ok,true);assert.equal(saved.recipient,undefined);assert.equal(saved.role,undefined);
 await submitContact(body,{save:async()=>({id:'fixture',duplicate:true}),notify:async()=>{notifications++;}});assert.equal(notifications,1);
});
