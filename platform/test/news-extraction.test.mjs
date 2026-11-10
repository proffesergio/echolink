import test from 'node:test';
import assert from 'node:assert/strict';
import {extractNewsHTML} from '../server/news-extraction.mjs';
test('full article paragraphs exclude navigation, sidebar and related stories',()=>{
 const sentence='সড়ক সংস্কারের বিষয়ে নগর কর্তৃপক্ষ বিস্তারিত পরিকল্পনা প্রকাশ করেছে।';
 const result=extractNewsHTML('<main><nav>UNRELATED MENU</nav><article><div itemprop="articleBody"><p>'+sentence.repeat(4)+'</p><p>'+sentence.repeat(4)+'</p><aside>UNRELATED STORY</aside><div class="related-news"><p>UNRELATED RECOMMENDATION</p></div></div></article></main>');
 assert(result.body.includes('\n\n'));assert(!result.body.includes('UNRELATED'));assert.equal(result.extraction,'[itemprop="articleBody"]');
});
test('JSON-LD articleBody is read before scripts are removed, and a menu-only main is not reporting',()=>{
 const body='সংশ্লিষ্ট কর্তৃপক্ষ পরিকল্পনার বিস্তারিত জানিয়েছে। '.repeat(15),result=extractNewsHTML('<script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',articleBody:body})+'</script><main>Navigation only</main>');assert(result.body.length>500);assert.equal(result.extraction,'structured_article');assert.equal(extractNewsHTML('<main><p>Menu and link list</p></main>').body,'');
});
