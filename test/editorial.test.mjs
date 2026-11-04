import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editorialReviewReason} from '../src/editorial.mjs';
import {needsReview} from '../src/publishing-policy.mjs';

test('explicit source-conflict warnings require review even on approval-free Pages',()=>{
  const article={title:'Poll',body:'53% and 42%',caption:'৫৩% এবং ৪২%',analysis:'EDITORIAL REVIEW REQUIRED: conflicting figures, 53% versus 42%.',caption_hash:'new'};
  assert.match(editorialReviewReason(article),/analysis flags/);
  assert.equal(needsReview({approval:false},article),true);
  assert.equal(needsReview({approval:false},{...article,approval_hash:'new'}),false,'A matching human approval remains authoritative');
  assert.equal(needsReview({approval:false},{...article,approval_hash:'old'}),true,'An edited caption needs fresh approval');
  assert.equal(needsReview({approval:false},{...article,approval_hash:'new'},true),true);
});

test('caption numbers normalize Bengali digits, grouping and decimal precision without rounding',()=>{
  const article={title:'২০২৬ সালের হিসাব',body:'মূল্য ১,৫০,০০০ টাকা। হার ১২.৫০ শতাংশ। সংখ্যা 9007199254740993।',caption:'2026 সালে 150000 টাকা, 12.5 শতাংশ এবং 9007199254740993।'};
  assert.equal(editorialReviewReason(article),null);
  assert.match(editorialReviewReason({...article,caption:'হার ১৩.৫ শতাংশ।'}),/13.5/);
  assert.match(editorialReviewReason({...article,caption:'সংখ্যা 9007199254740992।'}),/9007199254740992/);
});

test('URLs and hashtags are excluded; routine review advice is not a conflict warning',()=>{
  assert.equal(editorialReviewReason({body:'কোনো সংখ্যা নেই।',caption:'খবর #News24 https://example.com/2026/11/04',analysis:'Review facts and attribution. No conflicting figures found.'}),null);
  assert.match(editorialReviewReason({analysis:'সম্পাদকীয় যাচাই প্রয়োজন: সূত্রে অসংগতি।'}),/analysis flags/);
  assert.equal(needsReview({approval:false},{body:'হার ৫৩ শতাংশ।',caption:'হার ৫৩ শতাংশ।'}),false);
});

test('matching figures alone do not establish factual accuracy or catch reversed relationships',()=>{
  assert.equal(editorialReviewReason({body:'ঝুঁকি ৫৩ থেকে ৪২ শতাংশে কমেছে।',caption:'ঝুঁকি ৪২ থেকে ৫৩ শতাংশে বেড়েছে।'}),null);
});
