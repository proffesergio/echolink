import {AppError} from './errors.mjs';
export const modelPurposes=['research','product_analysis','news_article','news_review','news_caption','first_comment','design_brief','product_caption','instagram_caption','storyboard','reference_analysis'];
const complex=new Set(['news_article','storyboard','reference_analysis','news_bundle','product_bundle']);
export function modelRoute(connection,purpose='general',prompt=''){
 const config=connection.config||{};if(connection.provider!=='ollama'||!config.automaticRouting)return {connection,purpose,complexity:'default'};
 const complexity=complex.has(purpose)||prompt.length>6000?'complex':'standard';
 const model=config.taskModels?.[purpose]||(complexity==='complex'?config.complexModel:config.simpleModel)||config.model;
 return {connection:{...connection,config:{...config,model,...(config.taskContextTokens?.[purpose]?{contextTokens:config.taskContextTokens[purpose]}:{})}},purpose,complexity,routedFrom:model!==config.model?config.model:null};
}
export function assertModelUse(connection){
 const model=String(connection.config?.model||'');
 if(/qwen2\.5(?::|-).*3b/i.test(model)&&connection.config?.researchEvaluation!==true&&process.env.PLATFORM_QWEN25_3B_COMMERCIAL_LICENSED!=='true')throw new AppError(400,'Qwen2.5 3B has research-only terms. Use a commercially permitted model for publishing, or configure your separately obtained commercial licence with the operator.','model_licence');
}
