// Shared chart/terminal preparation: values remain native counts, never guesses.
export function operationBuckets(series,minutes=60,now=Date.now()){
 const windowMinutes=[60,360,1440].includes(Number(minutes))?Number(minutes):60,stepMinutes=Math.ceil(windowMinutes/24),step=stepMinutes*60000,end=Math.floor(now/step)*step,start=end-(Math.ceil(windowMinutes/stepMinutes)-1)*step;
 const buckets=Array.from({length:Math.ceil(windowMinutes/stepMinutes)},(_,i)=>({at:start+i*step,requests:0,errors:0,inputTokens:0,outputTokens:0}));
 for(const item of series||[]){const index=Math.floor((item.at-start)/step);if(index<0||index>=buckets.length||item.at>now)continue;for(const key of ['requests','errors','inputTokens','outputTokens'])if(Number.isFinite(item[key]))buckets[index][key]+=Math.max(0,item[key]);}
 return {buckets,stepMinutes};
}
export function operationsQueueSummary(rows=[]){return rows.reduce((r,q)=>{if(q.status==='queued'){r.queued+=q.count;r.due+=q.due;}if(q.status==='running')r.running+=q.count;if(q.status==='failed'||q.status==='unknown')r.failed+=q.count;return r;},{queued:0,due:0,running:0,failed:0});}
