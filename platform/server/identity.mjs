import {betterAuth} from 'better-auth';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import nodemailer from 'nodemailer';
import {database} from './db.mjs';
import {env} from './env.mjs';
import {AppError} from './errors.mjs';
let auth;
async function deliverEmail({to,subject,url}){
  if(process.env.SMTP_HOST){
    const smtp=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_SECURE==='true'||Number(process.env.SMTP_PORT)===465,requireTLS:Number(process.env.SMTP_PORT)!==465,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000,auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}:undefined});
    await smtp.sendMail({from:process.env.SMTP_FROM,to,subject,text:subject+'\n\n'+url+'\n\nIf you did not request this, ignore this message.'});return;
  }
  if(env().production)throw new AppError(503,'Email delivery is not configured.');
  const dir=new URL('../.local/mail/',import.meta.url);await mkdir(dir,{recursive:true});
  await writeFile(new URL(randomUUID()+'.json',dir),JSON.stringify({to,subject,url,createdAt:new Date().toISOString()}),{mode:0o600});
}
export function getAuth(){
  if(auth)return auth;
  if(!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET.length<32)throw new AppError(503,'The local account authentication secret is not configured.');
  return auth=betterAuth({appName:'EchoLink',baseURL:env().origin,basePath:'/api/auth',secret:process.env.BETTER_AUTH_SECRET,database:database(),
    trustedOrigins:[env().origin],user:{modelName:'auth_user'},account:{modelName:'auth_account',accountLinking:{enabled:true,trustedProviders:['google']}},
    session:{modelName:'auth_session',expiresIn:7*86400,updateAge:86400,cookieCache:{enabled:false}},verification:{modelName:'auth_verification'},
    emailAndPassword:{enabled:true,minPasswordLength:12,maxPasswordLength:256,requireEmailVerification:true,
      sendResetPassword:async({user,url})=>deliverEmail({to:user.email,subject:'Reset your EchoLink password',url})},
    emailVerification:{sendOnSignUp:true,autoSignInAfterVerification:true,sendVerificationEmail:async({user,url})=>deliverEmail({to:user.email,subject:'Verify your EchoLink email',url})},
    socialProviders:process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET?{google:{clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,prompt:'select_account'}}:{},
    rateLimit:{enabled:true,window:60,max:40},advanced:{useSecureCookies:env().production},
    logger:{level:'error',log(level,message){if(level==='error')console.error('Account authentication operation failed.');}}
  });
}
export function identityStatus(){return {provider:'better-auth',googleConfigured:!!process.env.GOOGLE_CLIENT_ID&&!!process.env.GOOGLE_CLIENT_SECRET,emailDelivery:process.env.SMTP_HOST?'smtp':env().production?'unconfigured':'local-preview',emailVerificationRequired:true};}
