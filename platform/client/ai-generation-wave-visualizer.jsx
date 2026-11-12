import React,{useId,useState} from 'react';
import {isPreparationWait} from './task-state.mjs';
import './ai-generation-wave-visualizer.css';
const kinds=new Set(['aggregate','import_products','generate','write_article','creative','render_reel']);
export function generationStage(task){
 const phase=String(task?.phase||'').toLowerCase();
 if(/render|compos|design|image|creative|typograph|logo|ছবি/.test(phase)||['creative','render_reel'].includes(task?.kind))return 'rendering';
 if(/source|research|fetch|ground|catalog|feed|evidence|reference/.test(phase)||['aggregate','import_products'].includes(task?.kind))return 'grounding';
 return 'synthesis';
}
function sine(layer){return Array.from({length:121},(_,i)=>{const x=i*10,y=90+Math.sin(i/12+layer*.8)*(18+layer*4)+Math.sin(i/6+layer)*7;return (i?'L':'M')+x.toFixed(1)+','+y.toFixed(1);}).join(' ');}
export function AIGenerationWaveVisualizer({tasks=[],pageId,languageMode,label='Content',offline=false}){
 const [paused,setPaused]=useState(false),id=useId().replaceAll(':','');
 const eligible=tasks.filter(t=>(!pageId||t.page_id===pageId)&&kinds.has(t.kind)),task=eligible.find(t=>t.status==='running')||eligible.find(isPreparationWait)||eligible.find(t=>t.status==='queued');
 const running=task?.status==='running'&&!offline,waiting=task&&isPreparationWait(task),stage=task?generationStage(task):'idle',status=offline?'Connection interrupted':running?'Preparing content':waiting?'Preparation waiting':task?'Queued for preparation':'No active preparation';
 const checkpoint=typeof task?.progress==='number'&&Number.isFinite(task.progress)?Math.min(100,Math.max(0,task.progress)):null;
 return <section className={'ai-wave stage-'+stage+(running&&!paused?' is-running':'')} data-stage={stage} data-task-kind={task?.kind||'none'} data-language-mode={languageMode||'inherited'} aria-label={label+' generation activity'}><div className="ai-wave-heading"><div><span className="ai-wave-kicker">{label} · generation activity</span><h3>{status}</h3></div>{running&&<button type="button" className="small" aria-pressed={paused} onClick={()=>setPaused(!paused)}>{paused?'Resume animation':'Pause animation'}</button>}</div><div className="ai-wave-art" aria-hidden="true"><svg viewBox="0 0 1200 180" preserveAspectRatio="none"><defs><linearGradient id={id+'-color'}><stop stopColor="var(--wave-a)"/><stop offset=".52" stopColor="var(--wave-b)"/><stop offset="1" stopColor="var(--wave-a)"/></linearGradient></defs>{[0,1,2,3,4].map(layer=><g key={layer} className={'ai-wave-layer layer-'+layer}><path className="ai-wave-fill" d={sine(layer)+' L1200,180 L0,180 Z'} fill={'url(#'+id+'-color)'} opacity={.025+layer*.012}/><path className="ai-wave-line" d={sine(layer)} stroke={'url(#'+id+'-color)'} opacity={.25+layer*.14} strokeWidth={layer===4?2.2:1.2} fill="none"/></g>)}</svg></div><div className="ai-wave-checkpoint"><span>{task?stage==='grounding'?'Source grounding':stage==='rendering'?'Creative rendering':'Content synthesis':'Standing by'}{languageMode==='DUAL_BILINGUAL'?' · English + Bangla':languageMode==='SINGLE_LANGUAGE'?' · Single language':''}</span>{checkpoint!==null&&<span>Worker checkpoint {checkpoint}%</span>}</div><p role="status" aria-live="polite">{offline?'Showing the last received task. Waiting for the worker connection.':task?.phase||'Waiting for a recorded worker phase.'}</p><small>Visual activity follows the recorded task phase. Worker checkpoints do not estimate completion or certify content.</small></section>;
}
