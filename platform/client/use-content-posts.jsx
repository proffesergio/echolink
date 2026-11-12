import {useCallback,useEffect,useRef,useState} from 'react';
import {CONTENT_VIEWS,fetchContentWindow} from './content-list.mjs';

export function useContentPosts({request,view,pageId,revision,receivedAt,enabled=true}){
 const key=pageId+':'+view,active=enabled&&CONTENT_VIEWS.has(view),sequence=useRef(0),window=useRef({key,count:100});
 const [result,setResult]=useState({key:null,posts:[],total:0,hasMore:false}),[progress,setProgress]=useState({key:null,loading:false,error:null});
 const load=useCallback(async count=>{
  const ticket=++sequence.current;window.current={key,count};setProgress({key,loading:true,error:null});
  try{const next=await fetchContentWindow(request,{view,pageId,count});if(ticket===sequence.current){setResult({key,...next,updatedAt:new Date().toISOString()});setProgress({key,loading:false,error:null});}}
  catch(error){if(ticket===sequence.current)setProgress({key,loading:false,error:error.message});}
 },[request,key,view,pageId]);
 useEffect(()=>{if(active)load(window.current.key===key?window.current.count:100);return()=>{sequence.current++;};},[active,key,revision,receivedAt,load]);
 const optimisticPost=(id,patch)=>{
  let previous,next;
  setResult(current=>{if(current.key!==key)return current;previous=current.posts.find(p=>p.id===id);if(!previous)return current;next={...previous,...patch};return {...current,posts:current.posts.map(p=>p.id===id?next:p)};});
  return ()=>setResult(current=>current.key===key&&previous?{...current,posts:current.posts.map(p=>p===next?previous:p)}:current);
 };
 const matching=result.key===key;
 return {active,optimisticPost,posts:matching?result.posts:[],total:matching?result.total:0,updatedAt:matching?result.updatedAt:null,hasMore:matching&&result.hasMore,loading:active&&(progress.key!==key||progress.loading),error:progress.key===key?progress.error:null,loadMore:()=>load((window.current.key===key?window.current.count:100)+100),refresh:()=>load(window.current.key===key?window.current.count:100)};
}
