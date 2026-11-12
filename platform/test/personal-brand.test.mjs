import test from 'node:test';
import assert from 'node:assert/strict';
import {personalBrandAnalytics,insightRecords} from '../server/insights.mjs';

test('personal analytics preserve unavailable saves and do not invent topic authority',()=>{
 const rows=insightRecords([{publishedAt:'2026-11-13T00:00:00Z',reach:100,comments:4,shares:2,topicPillar:'AI/Tech'}]);
 const result=personalBrandAnalytics(rows);
 assert.equal(result.engagementDepth,.06);assert.equal(result.saveShareRatio,null);
 assert.equal(result.topics[0].posts,1);assert.equal(result.topics[0].reviewedAnalogyScore,null);assert.equal(result.topics[1].engagementPerReach,null);
 assert.equal(personalBrandAnalytics([]).engagementDepth,null);
});
test('save/share and human analogy scores use only supplied observations',()=>{
 const row={publishedAt:'2026-11-13T00:00:00Z',reach:100,comments:4,shares:2,saves:6,topicPillar:'Digital Ethics',techFaithAnalogyScore:4};
 const result=personalBrandAnalytics(insightRecords([row]));
 assert.equal(result.saveShareRatio,3);assert.equal(result.topics[2].reviewedAnalogyScore,4);
 assert.equal(personalBrandAnalytics(insightRecords([{...row,shares:0}])).saveShareRatio,null);
 assert.throws(()=>insightRecords([{...row,techFaithAnalogyScore:6}]),/Import/);
});
