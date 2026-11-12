import {AppError} from './errors.mjs';
export const NEWS_STAGE_BUDGETS=Object.freeze({news_article:150000,news_review:180000,total:360000});
export async function boundedNewsStage(run,{deadlineMs,purpose}={}){
 // The HTTP adapter owns cancellation; racing a promise would leave the model
 // consuming memory while the following task starts.
 if(deadlineMs<=0)throw new AppError(422,'The local news preparation time budget is exhausted. This source remains held; the queue can continue.','news_stage_timeout');
 try{return await run(deadlineMs);}catch(error){
  if(error.status!==504)throw error;
  throw new AppError(422,(purpose==='news_review'?'News evidence review':'News writing')+' exceeded its short local time budget. This source is retained; preparation can move to the next story.','news_stage_timeout');
 }
}
