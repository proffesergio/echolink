import test from 'node:test';
import assert from 'node:assert/strict';
import {CONTENT_STATUS,contentStatus} from '../shared/content-status.mjs';
import {contentListQuery} from '../server/content-list.mjs';

test('canonical content state preserves transport uncertainty and review holds',()=>{
 assert.equal(contentStatus({status:'review'}),'NEED_ATTENTION');
 assert.equal(contentStatus({status:'review',content_status:'PREPARING'}),'PREPARING');
 assert.equal(contentStatus({status:'unknown'}),'NEED_ATTENTION');
 assert.equal(contentStatus({status:'publishing'}),'SCHEDULED');
 assert.equal(contentStatus({status:'published',last_error:'old error'}),'PUBLISHED');
 assert.equal(contentStatus({status:'approved',seo:{editorialWarnings:['Check source']}}),'NEED_ATTENTION');
 assert.equal(Object.keys(CONTENT_STATUS).length,7);
});
test('canonical filters use the persisted classification with tenant and profile scope',()=>{
 const page='1189994b-2ea0-4bd6-a19f-a212a23295be';
 for(const status of Object.keys(CONTENT_STATUS)){
  const q=contentListQuery(new URLSearchParams({page,status}));
  assert.deepEqual(q.values,[page,status]);assert.match(q.where,/workspace_id=\$1.*page_id=\$2.*content_status=\$3/);
 }
 assert.deepEqual(contentListQuery(new URLSearchParams({status:'preparing'})).values,[null,'PREPARING']);
 assert.match(contentListQuery(new URLSearchParams({status:'attention'})).where,/content_status IN \('NEED_ATTENTION','FAILED'\)/);
});
