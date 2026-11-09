// An idle queue has no reason to poll Postgres at generation speed.
export function queueDelay({worked=false,idle=0,errors=0}={}){
 if(errors)return Math.min(120000,15000*2**Math.min(errors,3));
 return worked?1500:Math.min(15000,1500*2**Math.min(idle,4));
}
export function queueLoop(run,{onError=()=>{},schedule=setTimeout,cancel=clearTimeout}={}){
 let stopped=false,timer,idle=0,errors=0;
 const tick=async()=>{if(stopped)return;let worked=false;try{worked=!!await run();errors=0;idle=worked?0:idle+1;}catch(error){errors++;onError(error);}finally{if(!stopped)timer=schedule(tick,queueDelay({worked,idle,errors}));}};
 timer=schedule(tick,1500);return()=>{stopped=true;cancel(timer);};
}
