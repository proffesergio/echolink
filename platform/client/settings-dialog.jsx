import React,{useEffect,useId,useRef,useState} from 'react';
import {CmsIcon} from './cms.jsx';
import './settings-dialog.css';
import generalIcon from './assets/settings/added-006-information-circle.svg';
import brandIcon from './assets/settings/added-007-palette.svg';
import channelsIcon from './assets/settings/added-011-share-nodes.svg';
import publishingIcon from './assets/settings/added-013-paper-plane.svg';
import connectionsIcon from './assets/settings/added-015-layer-group.svg';
import advancedIcon from './assets/settings/added-018-sliders.svg';
import gearIcon from './assets/settings/added-022-gear.svg';

export function SettingsDialog({title,subtitle,kind,close,busy=false,children}){
 const dialog=useRef(null),latest=useRef({close,busy});latest.current={close,busy};const heading=useId();
 useEffect(()=>{
  const launcher=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const frame=requestAnimationFrame(()=>{const first=dialog.current?.querySelector('input:not([type=file]),select,textarea,button');(first||dialog.current)?.focus({preventScroll:true});});
  const key=e=>{if(e.key==='Escape'){e.preventDefault();if(!latest.current.busy)latest.current.close();return;}if(e.key!=='Tab')return;
   const items=[...dialog.current.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length&&!el.closest('[hidden]'));
   const first=items[0],last=items.at(-1);if(!first){e.preventDefault();dialog.current.focus();}else if(e.shiftKey&&(document.activeElement===first||!dialog.current.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.current.contains(document.activeElement))){e.preventDefault();first.focus();}
  };document.addEventListener('keydown',key);return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(launcher?.isConnected)launcher.focus({preventScroll:true});};
 },[]);
 return <div className="backdrop cms-dialog-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)close();}}><section ref={dialog} className={'modal cms-dialog cms-dialog--'+kind} role="dialog" aria-modal="true" aria-labelledby={heading} aria-busy={busy} tabIndex="-1"><header><span className="settings-dialog-icon" aria-hidden="true">{kind==='page'?<span className="settings-masked-icon" style={{maskImage:`url("${gearIcon}")`,WebkitMaskImage:`url("${gearIcon}")`}}/>:<CmsIcon name={kind==='post'||kind==='details'?'posts':'connections'}/>}</span><div><h2 id={heading}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="icon" onClick={close} disabled={busy} aria-label="Close dialog">×</button></header>{children}</section></div>;
}

const icons={general:generalIcon,brand:brandIcon,channels:channelsIcon,publishing:publishingIcon,connections:connectionsIcon,advanced:advancedIcon};
function SettingsIcon({name}){const asset=icons[name];return asset?<span aria-hidden="true" className="settings-masked-icon" style={{maskImage:`url("${asset}")`,WebkitMaskImage:`url("${asset}")`}}/>:<CmsIcon name="prompts"/>;}
export function SettingsSection({title,description,children}){return <><div className="settings-section-heading"><h3>{title}</h3>{description&&<p>{description}</p>}</div><div className="settings-fields">{children}</div></>;}
export function PageSettingsSections({children,label='Profile settings sections'}){
 const sections=React.Children.toArray(children),[active,setActive]=useState('general'),id=useId(),root=useRef(null),invalid=useRef(null);
 useEffect(()=>()=>{if(invalid.current)cancelAnimationFrame(invalid.current);},[]);
 const revealInvalid=e=>{const panel=e.target.closest('[data-settings-section]');if(!panel||!panel.hidden)return;e.preventDefault();if(invalid.current)return;setActive(panel.dataset.settingsSection);const input=e.target;invalid.current=requestAnimationFrame(()=>{invalid.current=null;input.focus();input.reportValidity();});};
 const keyboard=(e,index)=>{let next;if(['ArrowDown','ArrowRight'].includes(e.key))next=(index+1)%sections.length;if(['ArrowUp','ArrowLeft'].includes(e.key))next=(index+sections.length-1)%sections.length;if(e.key==='Home')next=0;if(e.key==='End')next=sections.length-1;if(next==null)return;e.preventDefault();setActive(sections[next].props.id);root.current.querySelectorAll('[role=tab]')[next].focus();};
 return <div ref={root} className="page-settings-layout" onInvalidCapture={revealInvalid}><div className="settings-section-nav" role="tablist" aria-label={label} aria-orientation="vertical">{sections.map((s,i)=><button type="button" key={s.props.id} role="tab" id={id+'-'+s.props.id+'-tab'} aria-selected={active===s.props.id} aria-controls={id+'-'+s.props.id} tabIndex={active===s.props.id?0:-1} onKeyDown={e=>keyboard(e,i)} onClick={()=>setActive(s.props.id)}><SettingsIcon name={s.props.id}/><span>{s.props.label}</span></button>)}</div><div className="settings-section-panels">{sections.map(s=><section key={s.props.id} id={id+'-'+s.props.id} data-settings-section={s.props.id} role="tabpanel" aria-labelledby={id+'-'+s.props.id+'-tab'} hidden={active!==s.props.id}>{s}</section>)}</div></div>;
}
