import React from 'react';
import './startup.css';
export function Startup({label='Opening EchoLink…'}){return <main className="boot-screen" role="status" aria-live="polite"><div className="boot-emblem" aria-hidden="true"><svg viewBox="0 0 80 80"><circle className="boot-track" cx="40" cy="40" r="34"/><circle className="boot-orbit" cx="40" cy="40" r="34"/></svg><span>E</span></div><strong>EchoLink</strong><p>{label}</p><span className="boot-dots" aria-hidden="true"><i/><i/><i/></span></main>;}
