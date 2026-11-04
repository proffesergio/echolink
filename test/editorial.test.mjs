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
  assert.equal(editorialReviewReason({body:'কোনো সংখ্যা নেই।',caption:'খবর #News24 #নির্বাচন২০২৬ https://example.com/2026/11/04',analysis:'Review facts and attribution. No conflicting figures found.'}),null);
  assert.match(editorialReviewReason({analysis:'সম্পাদকীয় যাচাই প্রয়োজন: সূত্রে অসংগতি।'}),/analysis flags/);
  assert.equal(needsReview({approval:false},{body:'হার ৫৩ শতাংশ।',caption:'হার ৫৩ শতাংশ।'}),false);
});

test('explicit numeric transitions cannot be reversed using the same supported figures',()=>{
  assert.match(editorialReviewReason({body:'ঝুঁকি ৫৩ থেকে ৪২ শতাংশে কমেছে।',caption:'ঝুঁকি ৪২ থেকে ৫৩ শতাংশে বেড়েছে।'}),/reverses a numeric transition/);
  assert.match(editorialReviewReason({body:'The rate fell from 53 percent to 42 percent.',caption:'হার ৪২ শতাংশ থেকে ৫৩ শতাংশে উঠেছে।'}),/reverses a numeric transition/);
  assert.match(editorialReviewReason({body:'দাম ১,৫০,০০০ টাকা থেকে ১,২৫,০০০ টাকায় নেমেছে।',caption:'দাম 125000 টাকা থেকে 150000 টাকা হয়েছে।'}),/reverses a numeric transition/);
  assert.equal(editorialReviewReason({body:'হার ৫৩ থেকে ৪২ হয়েছে।',caption:'হার ৫৩ শতাংশ থেকে ৪২ শতাংশে নেমেছে।'}),null);
  assert.equal(editorialReviewReason({body:'একটি হার ৫৩ থেকে ৪২ কমেছে; অন্যটি ৪২ থেকে ৫৩ বেড়েছে।',caption:'দ্বিতীয় হার ৪২ থেকে ৫৩ হয়েছে।'}),null,'Two distinct source-supported directions must not be conflated');
});

test('direct quotations need source wording; paraphrased or translated quotes require human review',()=>{
  const quote='অনুষ্ঠানের নতুন তারিখ পরে জানানো হবে';
  assert.equal(editorialReviewReason({body:`কর্তৃপক্ষ বলেছে, “${quote}।”`,caption:`কর্তৃপক্ষ জানিয়েছে, “${quote}।”`}),null);
  assert.match(editorialReviewReason({body:'তারিখ এখনো ঘোষণা করা হয়নি।',caption:`কর্তৃপক্ষ বলেছে, “${quote}।”`}),/direct quotation/);
  assert.match(editorialReviewReason({body:'They said the date would be announced later.',caption:`কর্তৃপক্ষ বলেছে, “${quote}।”`}),/translations or paraphrases/);
  assert.equal(editorialReviewReason({body:'The event date is unknown.',caption:'অনুষ্ঠানের তারিখ পরে জানানো হবে বলে কর্তৃপক্ষ জানিয়েছে।'}),null,'An unquoted paraphrase is outside this narrow quotation check');
});

test('matching figures and no explicit reversal do not establish general factual accuracy',()=>{
  assert.equal(editorialReviewReason({body:'দল ক পেয়েছে ৫৩ শতাংশ; দল খ ৪২ শতাংশ।',caption:'দল খ পেয়েছে ৫৩ শতাংশ; দল ক ৪২ শতাংশ।'}),null);
});

test('source-absent monitoring and renovation boilerplate requires review without overriding explicit approval',()=>{
  const source='জরিপে ঝুঁকিপূর্ণ স্থাপনার হার কমেছে; এর কারণ উল্লেখ করা হয়নি।';
  for(const caption of ['স্থানীয় প্রশাসন এই বিষয়ে নজর রাখছে এবং নিয়মিতভাবে স্থাপনাগুলোর সার্ভে চালিয়ে যাচ্ছে।','স্থানীয় প্রশাসন ঝুঁকিপূর্ণ ভবনগুলোর সংস্কার ও নিয়মিত তদারকির ওপর জোর দিচ্ছে।','স্থানীয় প্রশাসন ভবনগুলোর মেরামত শুরু করেছে।']){
    const article={body:source,caption,caption_hash:'reviewed'};
    assert.match(editorialReviewReason(article),/not described in the supplied source/);
    assert.equal(needsReview({approval:false},article),true);assert.equal(needsReview({approval:false},{...article,approval_hash:'reviewed'}),false);
  }
  assert.equal(editorialReviewReason({body:'স্থানীয় প্রশাসন নিয়মিত তদারকি করছে।',caption:'স্থানীয় প্রশাসন ঘটনাটি নজর রাখছে এবং তদারকি করছে।'}),null);
  assert.equal(editorialReviewReason({body:'কর্তৃপক্ষ সংস্কার শুরু করেছে।',caption:'কর্তৃপক্ষ ভবনগুলোর সংস্কার শুরু করেছে।'}),null);
});

test('previous/current percentage comparisons cannot label a numerical decrease as an increase',()=>{
  const body='আগের মাসে হার ৫৩ শতাংশ। চলতি মাসে হার ৪২ শতাংশ।';
  assert.match(editorialReviewReason({body,caption:'চলতি মাসে ঝুঁকিপূর্ণ স্থাপনার হার বেড়ে ৪২ শতাংশ হয়েছে, যেখানে আগের মাসে এই হার ছিল ৫৩ শতাংশ।'}),/increase\/decrease wording/);
  assert.match(editorialReviewReason({body,caption:'আগের মাসে হার ৪২ শতাংশ। চলতি মাসে হার কমে ৫৩ শতাংশ হয়েছে।'}),/increase\/decrease wording/);
  assert.equal(editorialReviewReason({body,caption:'আগের মাসে হার ৫৩ শতাংশ। চলতি মাসে হার কমে ৪২ শতাংশ হয়েছে।'}),null);
  assert.equal(editorialReviewReason({body,caption:'গত মাসে হার ৪২ শতাংশ। এই মাসে হার বেড়ে ৫৩ শতাংশ হয়েছে।'}),null);
  assert.equal(editorialReviewReason({body,caption:'আগের মাসে একটি হার ৫৩ শতাংশ, আগের মাসে অন্য হার ৪২ শতাংশ। চলতি মাসে দ্বিতীয় হার বেড়ে ৫৩ শতাংশ হয়েছে।'}),null,'Multiple metrics are ambiguous and must not be guessed');
});

test('unsupported figures in editorial notes require review; numbered notes are not figures',()=>{
  const article={body:'আগের মাসে হার ৫৩ শতাংশ। চলতি মাসে হার ৪২ শতাংশ।',caption:'হার কমে ৪২ শতাংশ হয়েছে।'};
  assert.match(editorialReviewReason({...article,analysis:'ঝুঁকিপূর্ণ স্থাপনার হার ৪১% কমেছে।'}),/analysis numbers.*41/);
  assert.equal(editorialReviewReason({...article,analysis:'১. আগের মাসে হার ৫৩ শতাংশ।\n২. চলতি মাসে হার ৪২ শতাংশ।'}),null);
});
