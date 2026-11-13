import {AppError,uuid} from './errors.mjs';
import {ATTENTION_SQL,CONTENT_STATUS} from '../shared/content-status.mjs';

const statuses=new Set(['draft','review','approved','scheduled','publishing','published','failed','unknown','ready_manual']);
// Lists are queried in their own Page/status scope, never filtered from the
// dashboard's bounded overview sample. All sort orders have a stable ID tie-break.
export function contentListQuery(params){
 const page=params.get('page')||null,status=params.get('status')||null,bucket=params.get('bucket')||null;
 if(page&&!uuid(page))throw new AppError(400,'Invalid Page.');
 if(status&&!statuses.has(status)&&!['attention','preparing',...Object.keys(CONTENT_STATUS)].includes(status))throw new AppError(400,'Invalid content status.');
 if(bucket&&!['archive','trash'].includes(bucket))throw new AppError(400,'Invalid content bucket.');
 const offset=Math.floor(Math.max(0,Math.min(100000,Number(params.get('offset'))||0))),limit=Math.floor(Math.max(1,Math.min(300,Number(params.get('limit'))||100)));
 const filter=bucket==='trash'?'deleted_at IS NOT NULL':bucket==='archive'?'archived_at IS NOT NULL AND deleted_at IS NULL':'archived_at IS NULL AND deleted_at IS NULL';
 const canonical=({preparing:'PREPARING',draft:'DRAFT',review:'NEED_ATTENTION',approved:'APPROVED',scheduled:'SCHEDULED',published:'PUBLISHED',failed:'FAILED'})[status]||(Object.hasOwn(CONTENT_STATUS,status)?status:null);
 const statusFilter=status==='attention'?' AND '+ATTENTION_SQL:canonical?' AND content_status=$3':status?' AND status=$3':'';
 const order=bucket==='trash'?'deleted_at DESC, id DESC':bucket==='archive'?'archived_at DESC, id DESC':status==='published'?'published_at DESC NULLS LAST, updated_at DESC, id DESC':status==='scheduled'?'COALESCE(scheduled_at,planned_at) ASC NULLS LAST, id DESC':'updated_at DESC, created_at DESC, id DESC';
 return {page,status,bucket,offset,limit,where:`workspace_id=$1 AND ${filter} AND ($2::uuid IS NULL OR page_id=$2)${statusFilter}`,values:[page,...(status&&status!=='attention'?[canonical||status]:[])],order};
}
