import {test} from 'node:test';
import assert from 'node:assert/strict';
import {websitePayload,websiteConfiguration,websiteApplies,validateWebsiteConfiguration} from '../src/website.mjs';
import {automaticLinksEnabled,captionLinkProblem,sourceCommentMessage} from '../src/link-policy.mjs';
import {hash} from '../src/core.mjs';
const article={id:'00000000-0000-4000-8000-000000000001',title:'বাংলাদেশের নতুন সংবাদ',caption:'<script>alert("x")</script> খবর।\n\nআরও তথ্য। #বাংলাদেশ',source_url:'https://example.com/story?utm_source=x',image_url:'https://example.com/photo.jpg'};
test('website mapping escapes HTML, preserves source/photo attribution and supplies Django defaults',()=>{
  const p=websitePayload(article,{status:'DRAFT',now:'2026-11-04T00:00:00Z'});
  assert.equal(p.status,'DRAFT');assert.equal(p.published_at,null);assert.equal(p.hero_image,article.image_url);
  assert.match(p.body_html,/&lt;script&gt;/);assert.ok(!p.body_html.includes('<script>'));assert.match(p.body_html,/href="https:\/\/example.com\/story"/);
  assert.deepEqual(p.tags,['বাংলাদেশ']);assert.equal(p.view_count,0);assert.equal(p.read_time_minutes,1);
  assert.equal(p.source_url,'https://example.com/story');assert.equal(p.source_name,'example.com');assert.equal(p.category_id,null);
  assert.equal(p.slug,websitePayload({...article,caption:'Edited'}).slug);
  assert.ok(websitePayload(article).published_at);assert.throws(()=>websitePayload({...article,image_url:'http://example.com/image'}));
  assert.throws(()=>websitePayload({...article,image_url:'https://example.com/'+'x'.repeat(500)}));
});
test('website destination is optional and scoped to explicitly selected numeric Page IDs',()=>{
  const env={NOBLESEEK_DATABASE_URL:'postgresql://private:secret@db.example/db',NOBLESEEK_ENABLED:'true',NOBLESEEK_FACEBOOK_PAGE_IDS:'123'};
  assert.equal(websiteApplies({fbPageId:'123'},env),true);assert.equal(websiteApplies({fbPageId:'456'},env),false);
  assert.equal(websiteApplies({fbPageId:'123'},{...env,NOBLESEEK_ENABLED:'false'}),false);
  assert.ok(!JSON.stringify(websiteConfiguration(env)).includes('secret'));
  assert.throws(()=>validateWebsiteConfiguration({...env,NOBLESEEK_DATABASE_SCHEMA:'public; DROP TABLE x'}));
  assert.throws(()=>validateWebsiteConfiguration({...env,NOBLESEEK_FACEBOOK_PAGE_IDS:''}));
});
test('automatic link comments default off; explicit manual captions can be approved without hidden edits',()=>{
  assert.equal(automaticLinksEnabled({}),false);assert.equal(automaticLinksEnabled({FB_AUTOMATIC_LINKS_ENABLED:'true'}),true);
  const post={caption:'Read https://example.com/story'};
  assert.ok(captionLinkProblem(post,{}));assert.equal(captionLinkProblem({...post,approval_hash:hash(post.caption)},{}),null);
  assert.ok(captionLinkProblem({...post,approval_hash:hash('Old caption')},{}));
  assert.equal(captionLinkProblem({caption:'Native photo caption'},{}),null);
  assert.equal(sourceCommentMessage({source_url:'https://original.example'}),'সূত্র: https://original.example');
  assert.equal(sourceCommentMessage({website_status:'Published',website_url:'https://www.fabrything.com/nobleseek/example'}),'বিস্তারিত: https://www.fabrything.com/nobleseek/example');
});
