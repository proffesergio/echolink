import {Startup} from './startup.jsx';
import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {Analytics} from '@vercel/analytics/react';
// The showcase never mounts auth, state polling or production workspace code.
const publicDemo=/^\/demo(?:\/|$)/.test(location.pathname);
const Screen=publicDemo?lazy(()=>import('./demo.jsx')):lazy(()=>import('./app.jsx'));
createRoot(document.getElementById('root')).render(<><Suspense fallback={<Startup/>}><Screen/></Suspense>{import.meta.env.PROD&&!['localhost','127.0.0.1'].includes(location.hostname)&&<Analytics beforeSend={event=>({...event,url:event.url.split('?')[0]})}/>}</>);
