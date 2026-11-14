import test from 'node:test';
import assert from 'node:assert/strict';
import {contentListQuery} from '../server/content-list.mjs';
import {contentListPath,fetchContentWindow} from '../client/content-list.mjs';
const page='1189994b-2ea0-4bd6-a19f-a212a23295be';

test('Content query scopes Page and status before pagination and sorts by delivery time',()=>{
 const q=contentListQuery(new URLSearchParams({page,status:'published',offset:'100',limit:'100'}));
 assert.match(q.where,/workspace_id=\$1/);assert.match(q.where,/page_id=\$2/);assert.match(q.where,/status=\$3/);assert.deepEqual(q.values,[page,'PUBLISHED']);assert.match(q.order,/^published_at DESC NULLS LAST/);assert.equal(q.offset,100);
 const scheduled=contentListQuery(new URLSearchParams({status:'scheduled'}));assert.match(scheduled.order,/scheduled_at,planned_at\) ASC/);
 const attention=contentListQuery(new URLSearchParams({status:'attention'}));assert.match(attention.where,/content_status IN \('NEED_ATTENTION','FAILED'\)/);assert.deepEqual(attention.values,[null]);
 assert.throws(()=>contentListQuery(new URLSearchParams({status:'published;DELETE'})),/Invalid content status/);
 assert.throws(()=>contentListQuery(new URLSearchParams({page:'not-a-page'})),/Invalid Page/);
});
test('Content pagination preserves Page, status and bucket scope',()=>{
 const params=new URL('https://example.test'+contentListPath({view:'published',pageId:page,offset:100,limit:100})).searchParams;
 assert.equal(params.get('page'),page);assert.equal(params.get('status'),'published');assert.equal(params.get('offset'),'100');
 const archive=new URL('https://example.test'+contentListPath({view:'archive',pageId:page})).searchParams;assert.equal(archive.get('bucket'),'archive');assert.equal(archive.get('status'),null);
 assert.match(contentListPath({view:'drafts'}),/status=draft/);
 assert.match(contentListPath({view:'review'}),/status=review/);
 const review=contentListQuery(new URLSearchParams({status:'review'}));assert.deepEqual(review.values,[null]);assert.match(review.where,/status='review'/);assert.match(review.where,/NOT COALESCE/);
});
test('Refreshing a loaded content window retains later pages rather than resetting to dashboard sample',async()=>{
 const requests=[];let version=1;
 const request=async path=>{requests.push(path);const p=new URL('https://example.test'+path).searchParams,offset=Number(p.get('offset')),limit=Number(p.get('limit'));return {posts:Array.from({length:Math.min(limit,215-offset)},(_,i)=>({id:String(offset+i),version})),total:215,hasMore:offset+limit<215};};
 const first=await fetchContentWindow(request,{view:'published',pageId:page,count:200});assert.equal(first.posts.length,200);assert.equal(first.hasMore,true);
 version=2;const refreshed=await fetchContentWindow(request,{view:'published',pageId:page,count:300});assert.equal(refreshed.posts.length,215);assert.equal(refreshed.posts.at(-1).version,2);assert.equal(refreshed.hasMore,false);assert(requests.every(p=>p.includes('page='+page)&&p.includes('status=published')));
});
