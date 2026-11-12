import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {prepareJournalImages} from '../server/journal-images.mjs';
test('journal image export makes real responsive WebP sizes and requires alt text',async()=>{
 const bytes=await sharp({create:{width:1400,height:900,channels:3,background:'#cbd5e1'}}).png().toBuffer();
 const result=await prepareJournalImages(bytes,{alt:'The connector detail described in the guide'});
 assert.deepEqual(result.variants.map(v=>v.width),[480,800,1200]);
 for(const variant of result.variants){const m=await sharp(variant.bytes).metadata();assert.equal(m.format,'webp');assert.equal(m.width,variant.width);assert.equal(m.height,variant.height);}
 await assert.rejects(prepareJournalImages(bytes,{alt:''}),e=>e.status===400);
});
