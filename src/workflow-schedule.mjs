export function scheduleHealth(workflow) {
  const triggers=(workflow.nodes||[]).filter(node=>node.type==='n8n-nodes-base.scheduleTrigger');
  const rules=triggers[0]?.parameters?.rule?.interval||[],rule=rules[0];
  const minutes=triggers.length===1&&rules.length===1?rule?.field==='minutes'?(rule.minutesInterval??1):rule?.field==='hours'?(rule.hoursInterval??1)*60:null:null;
  return {triggerCount:triggers.length,cadenceMinutes:minutes,ready:minutes===1,
    reason:minutes===1?'Schedule checks due jobs every minute':minutes?`Schedule checks only every ${minutes} minutes; job intervals cannot make it run sooner`:'Schedule cadence needs review'};
}
export function minuteSchedule(workflow) {
  const copy=structuredClone(workflow),triggers=copy.nodes.filter(node=>node.type==='n8n-nodes-base.scheduleTrigger');
  if(triggers.length!==1)throw new Error('Expected one Schedule Trigger. Inspect the workflow before repairing it.');
  const node=triggers[0],old=node.name,name='Every minute';
  if(copy.nodes.some(other=>other!==node&&other.name===name))throw new Error('A different node already uses the Every minute name.');
  node.name=name;node.parameters={...node.parameters,rule:{interval:[{field:'minutes',minutesInterval:1}]}};
  const references=value=>{
    if(typeof value==='string'){
      for(const quote of ["'",'"'])for(const [prefix,suffix] of [['$(',')'],['$items(',')'],['$node[',']']]){
        const before=prefix+quote+old+quote;
        value=value.split(before+suffix).join(prefix+quote+name+quote+suffix);
        if(prefix==='$items(')value=value.split(before+',').join(prefix+quote+name+quote+',');
      }
      return value;
    }
    if(Array.isArray(value))return value.map(references);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,references(item)]));
    return value;
  };
  for(const item of copy.nodes)item.parameters=references(item.parameters);
  if(old!==name&&copy.connections[old]){copy.connections[name]=copy.connections[old];delete copy.connections[old];}
  for(const groups of Object.values(copy.connections))for(const outputs of Object.values(groups))for(const links of outputs)for(const link of links)if(link.node===old)link.node=name;
  return copy;
}
