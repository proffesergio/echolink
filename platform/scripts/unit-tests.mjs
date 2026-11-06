import {readdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=new URL('../test/',import.meta.url),files=(await readdir(dir)).filter(f=>f.endsWith('.test.mjs')&&!['platform.test.mjs','billing.test.mjs'].includes(f)).map(f=>fileURLToPath(new URL(f,dir)));
// CI tests never connect to a real database or need deployment credentials.
const child=spawn(process.execPath,['--test',...files],{windowsHide:true,stdio:'inherit',env:{...process.env,DATABASE_URL:'',DATABASE_URL_UNPOOLED:'',PLATFORM_ENCRYPTION_KEY:randomBytes(32).toString('hex'),PLATFORM_ENV:'development',SMTP_HOST:''}});
child.on('error',()=>{process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
