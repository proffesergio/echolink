import {CONTENT_STATUS,contentStatus} from '../shared/content-status.mjs';
const aliases={drafts:'DRAFT',draft:'DRAFT',preparing:'PREPARING',review:'NEED_ATTENTION',approved:'APPROVED',scheduled:'SCHEDULED',published:'PUBLISHED',failed:'FAILED'};
export function contentCount(state,status){
 if(status==='attention')return contentCount(state,CONTENT_STATUS.NEED_ATTENTION)+contentCount(state,CONTENT_STATUS.FAILED);
 if(status==='ready_manual')return Number(state?.postCounts?.ready_manual??state?.posts?.filter(p=>!p.deleted_at&&!p.archived_at&&p.status===status).length??0);
 const canonical=aliases[status]||status;
 return Number(state?.contentStatusCounts?.[canonical]??state?.posts?.filter(p=>!p.deleted_at&&!p.archived_at&&contentStatus(p)===canonical).length??0);
}
