// Editorial lifecycle is separate from transport receipts (unknown/publishing).
export const CONTENT_STATUS=Object.freeze(Object.fromEntries(['DRAFT','PREPARING','NEED_ATTENTION','APPROVED','SCHEDULED','PUBLISHED','FAILED'].map(s=>[s,s])));
export function contentStatus(post){
 if(Object.hasOwn(CONTENT_STATUS,post.content_status))return post.content_status;
 if(post.status==='published')return CONTENT_STATUS.PUBLISHED;
 if(post.status==='failed')return CONTENT_STATUS.FAILED;
 if(post.last_error||['unknown','ready_manual'].includes(post.status)||post.seo?.safety?.requiresHuman||post.seo?.editorialWarnings?.length)return CONTENT_STATUS.NEED_ATTENTION;
 return ({draft:'DRAFT',review:'NEED_ATTENTION',approved:'APPROVED',scheduled:'SCHEDULED',publishing:'SCHEDULED'})[post.status]||CONTENT_STATUS.DRAFT;
}
export const ATTENTION_SQL="content_status IN ('NEED_ATTENTION','FAILED')";
