import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const path=fileURLToPath(new URL('../.env.local',import.meta.url));
if(existsSync(path))process.loadEnvFile(path);
export const env=()=>({port:Number(process.env.PLATFORM_PORT||8790),origin:process.env.PLATFORM_ORIGIN||'http://localhost:8790',
  production:process.env.PLATFORM_ENV==='production',ownerEmail:(process.env.PLATFORM_OWNER_EMAIL||'').trim().toLowerCase(),
  authURL:process.env.NEON_AUTH_BASE_URL||'',jwksURL:process.env.NEON_AUTH_JWKS_URL||'',
  publishing:process.env.PLATFORM_PUBLISHING_ENABLED==='true',billingMode:process.env.PLATFORM_BILLING_MODE||'sandbox'});
