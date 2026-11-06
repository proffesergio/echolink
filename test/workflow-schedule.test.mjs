import {test} from 'node:test';
import assert from 'node:assert/strict';
import {minuteSchedule,scheduleHealth} from '../src/workflow-schedule.mjs';
import {pipeline} from '../scripts/workflows.mjs';
test('repair converts an hourly trigger to bounded standby and all node references without changing credentials or other workflow behavior',()=>{
  const source=pipeline(),trigger=source.nodes.find(n=>n.type==='n8n-nodes-base.scheduleTrigger');
  const minute=trigger.name;trigger.name='Every hour';trigger.parameters={rule:{interval:[{field:'hours'}]}};
  source.connections['Every hour']=source.connections[minute];delete source.connections[minute];
  const context=source.nodes.find(n=>n.name==='Execution context');context.parameters.jsCode="return [{json:{scheduled:$('Every hour').isExecuted}}];";
  const http=source.nodes.find(n=>n.type==='n8n-nodes-base.httpRequest');http.credentials={httpHeaderAuth:{id:'keep-this',name:'Keep existing worker credential'}};
  const original=structuredClone(source);
  assert.equal(scheduleHealth(source).cadenceMinutes,60);
  const fixed=minuteSchedule(source);
  assert.equal(scheduleHealth(fixed).ready,true);assert.equal(fixed.nodes.length,21);
  assert.match(fixed.nodes.find(n=>n.name==='Execution context').parameters.jsCode,/\$\('Every 15 minutes'\)/);
  assert.ok(fixed.connections['Every 15 minutes']);assert.equal(fixed.connections['Every hour'],undefined);
  assert.deepEqual(fixed.nodes.find(n=>n.id===http.id).credentials,http.credentials);
  assert.deepEqual(source,original,'The original graph is preserved for backup');
  const untouched=source.nodes.filter(n=>![trigger.id,context.id].includes(n.id));
  for(const node of untouched)assert.deepEqual(fixed.nodes.find(n=>n.id===node.id),node);
  assert.deepEqual(minuteSchedule(fixed),fixed,'Repair is idempotent');
});
test('ambiguous trigger graphs require operator inspection',()=>{
  assert.equal(scheduleHealth({nodes:[]}).ready,false);
  const source=pipeline();source.nodes.push({...source.nodes.find(n=>n.type==='n8n-nodes-base.scheduleTrigger'),name:'Another timer'});
  assert.throws(()=>minuteSchedule(source),/one Schedule Trigger/);
});
