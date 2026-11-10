import {isPreparationWait,retrySeconds} from './task-state.mjs';
const deliveryKinds=['publish','publish_instagram','post_link_comment'];
const failed=s=>['failed','unknown','blocked'].includes(s);
const time=t=>+new Date(t.started_at||t.created_at||0);
export function pipelineForPage(state,page,{postId=null,now=Date.now()}={}){
 const tasks=(state.tasks||[]).filter(t=>t.page_id===page.id).sort((a,b)=>time(b)-time(a));
 const posts=(state.posts||[]).filter(p=>p.page_id===page.id&&!p.deleted_at&&!p.archived_at);
 const live=tasks.find(t=>t.status==='running'),retry=tasks.filter(isPreparationWait).sort((a,b)=>new Date(a.not_before)-new Date(b.not_before))[0],chosen=posts.find(p=>p.id===(postId||live?.post_id||retry?.post_id))||posts.find(p=>p.id===tasks.find(t=>t.post_id)?.post_id)||posts[0];
 const chain=chosen?tasks.filter(t=>t.post_id===chosen.id):tasks.filter(t=>!t.post_id);
 const stage=(id,label,kinds,evidence=false,{off=false,note=''}={})=>{
  const matches=chain.filter(t=>kinds.includes(t.kind)),running=matches.find(t=>t.status==='running'),latest=matches[0],queued=matches.find(t=>t.status==='queued');
  const task=running||queued||latest,waiting=isPreparationWait(task),succeeded=['completed','succeeded'].includes(latest?.status);
  const status=off?'off':running?'running':evidence?'done':waiting?'waiting':queued?'queued':failed(latest?.status)?latest.status:succeeded?'done':'pending';
  return {id,label,status,task,note:off?note:running?.phase||queued?.phase||latest?.phase||note,progress:running||waiting?task.progress:evidence||succeeded?100:0,retrySeconds:waiting?retrySeconds(task,now):null};
 };
 const prep=page.kind==='ecommerce'?'Product catalogue':'News research',manual=page.destination_type==='facebook_profile';
 const ig=(state.social_destinations||[]).some(d=>d.page_id===page.id&&d.enabled&&d.platform==='instagram');
 const destinations=(state.publicationDeliveries||[]).filter(d=>d.post_id===chosen?.id),instagram=(state.social_deliveries||[]).find(d=>d.post_id===chosen?.id),comment=(state.linkComments||[]).find(d=>d.post_id===chosen?.id);
 const stages=[stage('source',page.kind==='news'||page.kind==='ecommerce'?prep:'Content brief',page.kind==='ecommerce'?['import_products']:['aggregate'],!!(chosen?.body||chosen?.product_id)),
  stage('write',chosen?.type==='reel'?'Video storyboard':page.kind==='news'?'Full report + evidence review':'Channel copy',['generate','write_article'],page.kind==='news'?!!chosen?.seo?.article?.wordCount&&!chosen.seo.article.needsReview:!!chosen?.caption),
  stage('design',chosen?.type==='reel'?'9:16 video':'Branded design',['creative','render_reel'],!!chosen?.creative?.assetId),
  stage('schedule',page.require_review?'Review → calendar':'Auto-check → calendar',[],['scheduled','publishing','published','ready_manual'].includes(chosen?.status),{note:chosen?.scheduled_at?'Booked '+new Date(chosen.scheduled_at).toLocaleString():chosen?.planned_at?'Planned · awaiting preparation':chosen?.status==='review'?'Waiting for content checks':''}),
  stage('website','Website first',['publish'],!!chosen?.website_url||destinations.some(d=>d.destination==='website'&&d.status==='published'),{off:!page.website_publishing,note:'Optional website publishing is off'}),
  stage('facebook',manual?'Profile handoff':'Facebook',['publish','manual_handoff'],!!chosen?.fb_post_id||!!chosen?.manual_url),
  stage('instagram','Instagram',['publish_instagram'],instagram?.status==='published',{off:!ig,note:'Instagram delivery is off'}),
  stage('comment','Link comment · +5m',['post_link_comment'],comment?.status==='published',{off:!page.creative_policy?.linkComments?.enabled,note:'Automatic link comments are off'})];
 // A combined publish task reports website and Facebook as separate phases.
 const publishing=chain.find(t=>t.kind==='publish'&&t.status==='running');
 if(publishing){const web=stages.find(s=>s.id==='website'),fb=stages.find(s=>s.id==='facebook');
  if(page.website_publishing&&publishing.progress<50){fb.status='pending';fb.progress=0;fb.note='Waiting for website confirmation';}
  else if(page.website_publishing){web.status=chosen?.website_url?'done':'pending';web.progress=chosen?.website_url?100:0;web.note=chosen?.website_url?'Website URL confirmed':'Awaiting website receipt';}
 }
 if(page.creative_policy?.contentFormat==='news_desk_v3'){
  const web=stages.find(s=>s.id==='website'),design=stages.find(s=>s.id==='design'),creating=chain.find(t=>t.kind==='creative'&&t.status==='running');
  if(creating&&/^Website/.test(creating.phase||'')){web.status='running';web.task=creating;web.progress=creating.progress;web.note=creating.phase;design.status='pending';design.progress=0;design.note='Waiting for the full website report to be verified';}
  const index=stages.indexOf(web);stages.splice(index,1);stages.splice(2,0,web);const social=stage('social','Facebook summary',[],!!chosen?.caption&&!chosen?.seo?.article?.socialPending);if(creating&&/^Facebook/.test(creating.phase||'')){social.status='running';social.task=creating;social.note=creating.phase;social.progress=creating.progress;design.status='pending';design.progress=0;design.note='Waiting for the checked Facebook summary';}else if(!chosen?.caption){social.status='pending';social.progress=0;social.note='Waiting for the confirmed website report';}stages.splice(3,0,social);
 }
 const active=tasks.filter(t=>t.status==='running'),waiting=tasks.filter(t=>t.status==='queued');
 return {page,post:chosen,posts,stages,tasks:chain,active,waiting,retry:chain.filter(isPreparationWait).sort((a,b)=>new Date(a.not_before)-new Date(b.not_before))[0],next:posts.filter(p=>p.status==='scheduled'&&p.scheduled_at).sort((a,b)=>new Date(a.scheduled_at)-new Date(b.scheduled_at))[0],events:chain.flatMap(t=>(t.events||[]).map(e=>({...e,taskId:t.id,kind:t.kind,status:t.status}))).sort((a,b)=>new Date(a.at)-new Date(b.at)).slice(-70),now};
}
export const pipelineDeliveryKinds=deliveryKinds;
