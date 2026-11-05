import '../server/env.mjs';
import {readdir,readFile,unlink} from 'node:fs/promises';
import {env} from '../server/env.mjs';
if(env().production||process.env.SMTP_HOST||process.env.PLATFORM_BRANCH!=='echolink-platform-local')throw new Error('This private helper is only for the isolated local email-preview environment.');
const email=(process.argv[2]||'').trim().toLowerCase();if(!email.includes('@'))throw new Error('Usage: node scripts/verify-local-email.mjs your-email@example.com');
const dir=new URL('../.local/mail/',import.meta.url),messages=[];
for(const name of await readdir(dir)){const file=new URL(name,dir);let mail;try{mail=JSON.parse(await readFile(file,'utf8'));}catch{continue;}if(mail.to.toLowerCase()===email&&mail.subject==='Verify your EchoLink email')messages.push({...mail,file});}
const mail=messages.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];if(!mail)throw new Error('No local verification message for that email. Create the account first.');
const url=new URL(mail.url);if(url.origin!==env().origin||url.pathname!=='/api/auth/verify-email')throw new Error('The preview does not belong to this local app.');
const response=await fetch(url,{redirect:'manual'});if(![200,302].includes(response.status))throw new Error('Verification could not be completed. Request a new verification message.');
for(const message of messages)await unlink(message.file);
console.log('Local email verified. Return to '+env().origin+' and sign in using your account password. Google sign-in does not need this helper.');
