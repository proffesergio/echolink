export const CONTENT_VIEWS=new Set(['attention','preparing','posts','review','drafts','scheduled','published','ready_manual','archive','trash']);
export function contentListPath({view='posts',pageId='all',offset=0,limit=100}){
 const params=new URLSearchParams({limit:String(limit),offset:String(offset)});
 if(pageId&&pageId!=='all')params.set('page',pageId);
 if(['archive','trash'].includes(view))params.set('bucket',view);
 else if(view!=='posts')params.set('status',view==='drafts'?'draft':view==='review'?'NEED_ATTENTION':view);
 return '/api/posts?'+params;
}
export async function fetchContentWindow(request,{view,pageId,count=100}){
 const posts=[],ids=new Set();let total=0,offset=0;
 while(offset<count){
  const limit=Math.min(100,count-offset),next=await request(contentListPath({view,pageId,offset,limit}));
  total=next.total??next.posts.length;
  for(const post of next.posts)if(!ids.has(post.id)){ids.add(post.id);posts.push(post);}
  offset+=next.posts.length;
  if(!next.posts.length||next.hasMore===false||offset>=total)break;
 }
 return {posts,total,hasMore:offset<total};
}
