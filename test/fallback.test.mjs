import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extract} from '../src/jobs.mjs';
const rss='<?xml version="1.0"?><rss version="2.0"><channel><title>বাংলা সংবাদ</title><link>https://example.com</link><description>Test</description><item><title>পরীক্ষামূলক খবর</title><link>https://example.com/story</link></item></channel></rss>';
test('blocked primary feed falls back to a parsed alternate feed',async()=>{
  const attempted=[];
  const items=await extract({url:'https://primary.test/rss',fallback:'https://backup.test/rss'},async url=>{attempted.push(url);if(url.includes('primary'))throw new Error('HTTP 403');return rss;});
  assert.equal(items[0].title,'পরীক্ষামূলক খবর');assert.deepEqual(attempted,['https://primary.test/rss','https://backup.test/rss']);
});
test('malformed primary feed triggers fallback rather than losing the batch',async()=>{
  const items=await extract({url:'https://primary.test/rss',fallback:'https://backup.test/rss'},async url=>url.includes('primary')?'not an RSS document':rss);
  assert.equal(items.length,1);
});
test('both feed routes failing is reported for audit logging',async()=>{
  await assert.rejects(extract({url:'https://primary.test/rss',fallback:'https://backup.test/rss'},async()=>{throw new Error('HTTP 503');}));
});
