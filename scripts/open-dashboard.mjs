import '../src/env.mjs';
import { spawn } from 'node:child_process';
const base = `http://127.0.0.1:${process.env.PORT || 8787}`;
const response = await fetch(`${base}/admin/api/ticket`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WORKER_API_KEY}` }, signal: AbortSignal.timeout(10000) });
if (!response.ok) throw new Error('Dashboard login failed. Start or restart the worker with npm start.');
const { ticket } = await response.json();
if (!/^[a-f0-9]{64}$/.test(ticket)) throw new Error('Invalid login ticket');
const url = `${base}/admin#ticket=${ticket}`;
if (process.platform === 'win32') {
  const child = spawn('powershell.exe', ['-NoProfile','-Command', `Start-Process '${url}'`], { stdio: 'ignore', windowsHide: true });
  child.unref();
} else { const child = spawn('xdg-open', [url], { stdio:'ignore', detached:true }); child.unref(); }
console.log('Opened the EchoLink dashboard in your browser. Login link expires in two minutes.');
