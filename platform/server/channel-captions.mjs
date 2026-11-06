export const captionStyles={consistent:'Keep the Page voice and the same useful level of detail.',concise:'Use a short opening and 2–3 compact sentences. Keep all essential qualifications.',editorial:'Use a factual editorial opening, short paragraphs and relevant context.',conversational:'Use a warm conversational opening and one useful question about the actual topic.',showcase:'Use a polished visual-first opening, short topic detail and one clear message CTA.'};
export function channelDirection(page,channel='facebook'){
 const config=page.creative_policy?.channelCaptions?.[channel]||{},style=config.style||(channel==='instagram'?'showcase':'editorial');
 return `Destination: ${channel}. ${captionStyles[style]||captionStyles.consistent} ${String(config.instructions||'').slice(0,1500)} Keep the same names, claims, language policy and source facts as the other channel. Never introduce new claims to vary the style.`;
}
export function instagramCaption(post){return post.seo?.channelCaptions?.instagram?.trim()||post.caption;}
