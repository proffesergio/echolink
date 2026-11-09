export const isPreparationWait=task=>task?.status==='queued'&&(
 ['inference_resource_wait','inference_host_wait'].includes(task.result?.waiting?.code)||
 /^Memory reserve protected|^The local inference host is unavailable|^The local model exceeded its response time budget/.test(task.phase||'')
);
export const selectStatusTask=(tasks,clock=Date.now())=>tasks.find(t=>t.status==='running'&&t.kind==='publish')||
 tasks.find(t=>t.status==='running')||tasks.find(t=>t.status==='queued'&&+new Date(t.not_before)<=clock+5000)||
 tasks.filter(isPreparationWait).sort((a,b)=>new Date(a.not_before)-new Date(b.not_before))[0];
export const retrySeconds=(task,clock=Date.now())=>Math.max(0,Math.ceil((new Date(task.not_before)-clock)/1000));
