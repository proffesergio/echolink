export const automaticLinksEnabled=(env=process.env)=>env.FB_AUTOMATIC_LINKS_ENABLED==='true';
export const captionHasLink=caption=>/(?:https?:\/\/|www\.)\S+/iu.test(String(caption||''));
export function captionLinkProblem(article,env=process.env){
  if(typeof article==='string')article={caption:article};
  const approved=article.approval_hash&&article.approval_hash===hash(article.caption||'');
  return !automaticLinksEnabled(env)&&captionHasLink(article.caption)&&!approved
    ?'Automatic Facebook links are disabled. Review this caption URL explicitly before approval, or remove it. No website/source link will be added automatically.'
    :null;
}
export function sourceCommentMessage(article){
  return article.website_status==='Published'&&article.website_url
    ?`বিস্তারিত: ${article.website_url}`:`সূত্র: ${article.source_url}`;
}
import {hash} from './core.mjs';
