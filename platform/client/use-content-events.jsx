import {useEffect,useRef} from 'react';
// Finite authenticated frames also work through the buffering bridge/proxy.
// Pulse polling continues independently for task phases and connection recovery.
export function useContentEvents({enabled,pollState,refresh,onError}){
 const handlers=useRef({refresh,onError});handlers.current={refresh,onError};
 useEffect(()=>{
  if(!enabled||typeof EventSource==='undefined')return;
  let stream,stopped=false,pending=false;
  const open=()=>{
   if(stopped||document.hidden||stream)return;
   stream=new EventSource('/api/content-events',{withCredentials:true});
   stream.addEventListener('content',async event=>{
    let data;try{data=JSON.parse(event.data);}catch{return;}
    if(stopped||pending||data.revision==null||String(data.revision)===String(pollState.current?.telemetry?.contentRevision))return;
    pending=true;try{await handlers.current.refresh();}catch(error){if(!stopped)handlers.current.onError?.(error);}finally{pending=false;}
   });
   // EventSource honors the backend retry interval; pulse remains the fallback.
  };
  const visible=()=>{if(document.hidden){stream?.close();stream=null;}else open();};
  open();document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;stream?.close();document.removeEventListener('visibilitychange',visible);};
 },[enabled,pollState]);
}
