import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNewsSocial} from '../server/news-social-stage.mjs';
import {verifyNoblePublic} from '../server/nobleseek.mjs';
test('no Facebook model call occurs until the website URL is confirmed',async()=>{
 const page={website_publishing:true},task={workspace_id:'w'},post={id:'p',version:2,seo:{article:{socialPending:true,text:'পূর্ণ প্রতিবেদন',needsReview:false}}};let called=0;
 await assert.rejects(()=>prepareNewsSocial({task,page,post,connection:{}},{generate:async()=>{called++;},updateTask:async()=>{}}),/website report/);assert.equal(called,0);
 post.website_url='https://news.example/report';const events=[];
 await prepareNewsSocial({task,page,post,connection:{}},{updateTask:async(_t,_p,phase)=>events.push(phase),generate:async()=>{called++;return {caption:'সম্পূর্ণ প্রতিবেদনের সংক্ষিপ্ত বিবরণ।',notes:[],warnings:[]};},transact:async(_w,fn)=>fn({query:async()=>({rowCount:1,rows:[{version:3}]})})});
 assert.equal(called,1);assert.equal(post.seo.article.socialPending,false);assert.equal(post.seo.article.socialPreparedForURL,post.website_url);assert.equal(post.version,3);assert.match(events[0],/^Facebook/);
});
test('public website verification checks complete text, not merely an existing slug',async()=>{
 const site={url:'https://news.example'},text='প্রথম অনুচ্ছেদের বিস্তারিত বিবরণ।\n\nদ্বিতীয় অনুচ্ছেদের বিস্তারিত বিবরণ।';
 const request=async()=>({slug:'story',body_html:'<p>প্রথম অনুচ্ছেদের বিস্তারিত বিবরণ।</p>\n<p>দ্বিতীয় অনুচ্ছেদের বিস্তারিত বিবরণ।</p>'});
 assert((await verifyNoblePublic(site,'story',{request,expectedText:text})).verifiedAt);
 await assert.rejects(()=>verifyNoblePublic(site,'story',{request:async()=>({slug:'story',body_html:'Only the old short caption'}),expectedText:text}),/does not yet match/);
});
