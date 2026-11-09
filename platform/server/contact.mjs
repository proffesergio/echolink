import {z} from 'zod';
import {createHash} from 'node:crypto';
import nodemailer from 'nodemailer';
import {transaction} from './db.mjs';
import {AppError} from './errors.mjs';
const schema=z.object({name:z.string().trim().min(2).max(100),email:z.string().trim().email().max(254),company:z.string().trim().max(120).default(''),topic:z.enum(['Demo & onboarding','Plans & pricing','Partnership','Technical support']),message:z.string().trim().min(20).max(4000),consent:z.literal(true),website:z.string().max(500).default('')});
export async function saveInquiry(data,hash){
 return transaction(null,async db=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('creator:public-contact',0))");
  const duplicate=(await db.query("SELECT id FROM creator.contact_inquiries WHERE payload_hash=$1 AND created_at>now()-interval '10 minutes' LIMIT 1",[hash])).rows[0];if(duplicate)return {...duplicate,duplicate:true};
  const count=(await db.query("SELECT count(*) FILTER(WHERE created_at>now()-interval '1 day')::int AS daily,count(*) FILTER(WHERE lower(email)=lower($1) AND created_at>now()-interval '1 hour')::int AS sender FROM creator.contact_inquiries WHERE created_at>now()-interval '1 day'",[data.email])).rows[0];
  if(count.daily>=100||count.sender>=3)throw new AppError(429,'Please wait before sending another message, or contact us by WhatsApp.');
  return (await db.query('INSERT INTO creator.contact_inquiries(name,email,company,topic,message,payload_hash) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[data.name,data.email.toLowerCase(),data.company,data.topic,data.message,hash])).rows[0];
 },{owner:true});
}
export async function notifySupport(data){
 if(!process.env.SMTP_HOST||!process.env.SMTP_FROM)return false;
 const port=Number(process.env.SMTP_PORT||587),smtp=nodemailer.createTransport({host:process.env.SMTP_HOST,port,secure:process.env.SMTP_SECURE==='true'||port===465,requireTLS:port!==465,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
 await smtp.sendMail({from:process.env.SMTP_FROM,to:'support@fabrything.com',replyTo:{name:data.name,address:data.email},subject:'EchoLink inquiry · '+data.topic,text:['Name: '+data.name,'Email: '+data.email,'Company: '+(data.company||'—'),'Topic: '+data.topic,'',data.message].join('\n')});return true;
}
export async function submitContact(body,{save=saveInquiry,notify=notifySupport,markNotified=id=>transaction(null,db=>db.query('UPDATE creator.contact_inquiries SET notified_at=now() WHERE id=$1',[id]),{owner:true})}={}){
 const parsed=schema.safeParse(body);if(!parsed.success)throw new AppError(400,'Enter your name, a valid email and a message of 20–4,000 characters, and agree to be contacted.');
 const data=parsed.data;if(data.website)return {ok:true,message:'Thank you for your message.'};
 const hash=createHash('sha256').update(JSON.stringify([data.email.toLowerCase(),data.name,data.company,data.topic,data.message])).digest('hex');
 const stored=await save(data,hash);if(!stored.duplicate){try{if(await notify(data))await markNotified(stored.id);}catch{/* The durable owner inbox remains the source of truth. */}}
 return {ok:true,id:stored.id,message:'Your message has been received. Our team will follow up using the contact details you provided.'};
}
