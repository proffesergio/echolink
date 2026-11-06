export function scopeState(value,pageId){
 if(!value||pageId==='all')return value;const page=value.pages.find(p=>p.id===pageId);if(!page)return value;
 const site=value.websites.find(w=>w.id===page.website_id),bindings=(value.pageConnections||[]).filter(c=>c.page_id===page.id).map(c=>c.connection_id),ids=new Set([...bindings,page.facebook_connection_id,page.text_connection_id,page.image_connection_id,site?.connection_id,...(value.pageMirrors||[]).filter(m=>m.page_id===page.id&&m.enabled).map(m=>m.connection_id)].filter(Boolean));
 const out={...value,posts:value.posts.filter(p=>p.page_id===page.id),calendar:(value.calendar||[]).filter(p=>p.page_id===page.id),connections:value.connections.filter(c=>ids.has(c.id)),feeds:value.feeds.filter(f=>f.page_id===page.id),products:value.products.filter(p=>p.website_id===page.website_id),websites:value.websites.filter(w=>w.id===page.website_id),tasks:value.tasks.filter(t=>t.page_id===page.id||ids.has(t.input?.connectionId)),automation_rules:value.automation_rules.filter(r=>r.page_id===page.id),campaigns:value.campaigns.filter(c=>c.page_id===page.id)};
 const resourceIds=new Set([page.id,page.website_id,...ids,...out.posts.map(p=>p.id),...out.tasks.map(t=>t.id),...out.feeds.map(f=>f.id),...out.automation_rules.map(r=>r.id),...out.campaigns.map(c=>c.id)].filter(Boolean));
 out.activity=(value.activity||[]).filter(a=>a.page_id?a.page_id===page.id:resourceIds.has(a.resource_id));
 const postIds=new Set(out.posts.map(p=>p.id));out.mirrorStatus=(value.mirrorStatus||[]).filter(m=>postIds.has(m.post_id));
 out.insights=(value.insights||[]).filter(s=>s.page_id===page.id);
 out.pageMirrors=(value.pageMirrors||[]).filter(m=>m.page_id===page.id);
 out.archiveCounts=(value.pageArchiveCounts||[]).find(c=>c.page_id===page.id)||{archived:0,trash:0};
 out.postCounts=Object.fromEntries((value.pagePostCounts||[]).filter(x=>x.page_id===page.id).map(x=>[x.status,x.count]));return out;
}
