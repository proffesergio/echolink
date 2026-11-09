export const nichePresets=[
 {id:'news_standard',group:'News',name:'Standard news',kind:'news',rules:'Use neutral, precise standard Bengali. Preserve dates, names, allegations and uncertainty. Never sensationalize tragedy.'},
 {id:'news_tech',group:'News',name:'Technology',kind:'news',rules:'Explain technology clearly. Preserve model names and technical units. Distinguish announcements, estimates and released products; do not invent benchmarks.'},
 {id:'news_sports',group:'News',name:'Sports',kind:'news',rules:'Use natural sports vocabulary. Preserve teams, scores, fixtures and match dates; distinguish previews from final results.'},
 {id:'commerce_fashion',group:'E-commerce',name:'Fashion',kind:'ecommerce',rules:'Emphasize documented fabric, fit, construction and styling. Never infer size availability or supplier endorsements. Preserve the real garment silhouette.'},
 {id:'commerce_gadgets',group:'E-commerce',name:'Gadgets',kind:'ecommerce',rules:'Emphasize verified power, battery, compatibility and practical use. Never invent certification, battery life or performance.'},
 {id:'commerce_groceries',group:'E-commerce',name:'Groceries',kind:'ecommerce',rules:'Use verified quantity, ingredients, storage and availability. No unverified medical, nutrition, organic or freshness guarantees.'},
 {id:'reels_motivation',group:'Entertainment Reels',name:'Motivational',kind:'entertainment',rules:'Create original encouraging Bengali narration. Avoid invented quotes, celebrity endorsements, medical advice or guaranteed success.'},
 {id:'reels_facts',group:'Entertainment Reels',name:'Daily facts',kind:'entertainment',rules:'Use only supplied verifiable facts. Do not invent scientific statistics or present folklore as evidence. Keep uncertainty explicit.'},
 {id:'reels_riddles',group:'Entertainment Reels',name:'Riddle videos',kind:'entertainment',rules:'Create an original, internally consistent Bengali riddle, a short thinking pause and a clear answer. Check that the clues support the answer.'},
];
export function nicheDirection(page){const p=nichePresets.find(p=>p.id===page.creative_policy?.nichePreset);return p?'Niche vocabulary and brand direction: '+p.rules+' Preserve this Page’s own logo, handles and website; never borrow another brand identity.':'';}
