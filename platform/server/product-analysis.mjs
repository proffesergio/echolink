const profiles=[
 {type:'fan',pattern:/\bfan\b|পাখা/iu,style:'technical',specs:['battery','runtime','rpm','oscillation','power','speeds'],useCase:'Personal airflow; show only documented operating specifications.'},
 {type:'charger',pattern:/charger|power.?bank|চার্জার/iu,style:'technical',specs:['power','battery','ports'],useCase:'Device charging; preserve documented power ratings and connections.'},
 {type:'apparel',pattern:/shirt|polo|socks|trouser|clothing|fashion|apparel|hoodie|denim|jeans|kurti|kameez|salwar|shorts|পোশাক/iu,style:'fashion',specs:['material','gsm','fit'],useCase:'Fabric, fit and everyday wear; preserve the real garment and any original photographed model.'},
 {type:'beauty',pattern:/cosmetic|skincare|serum|shampoo|perfume|lotion|beauty|hand.?wash|saniti[sz]er|soap/iu,style:'editorial',specs:['volume'],useCase:'Show the actual package and documented quantity; no added health or efficacy claims.'},
 {type:'electronics',pattern:/electronics|headphone|speaker|cable|adapter|watch|gadget/iu,style:'technical',specs:['power','battery','runtime','connectivity','ports'],useCase:'Show the actual device with source-confirmed specifications.'},
 {type:'toy',pattern:/\btoy\b|dancing cactus|cactus dancing|playset|পুতুল/iu,style:'playful',specs:['battery','power','material','dimensions'],useCase:'Playful visual presentation of the actual toy; never infer age suitability or safety certification.'},
 {type:'home',pattern:/home|kitchen|bottle|container|cookware|household/iu,style:'minimal',specs:['capacity','material','dimensions'],useCase:'Everyday use, documented capacity and actual construction.'}
];
const definitions={
 battery:{label:'BATTERY',pattern:/\b\d[\d,.]*\s*(?:mAh|Ah)\b/i},
 runtime:{label:'RUNTIME',pattern:/(?:runtime|battery life|backup|working time|operating time)\s*[:=-]?\s*(?:up to\s+)?\d+(?:\s*[-–]\s*\d+)?\s*(?:hours?|hrs?)\b/i,value:/^(?:up to\s+)?\d+(?:\s*[-–]\s*\d+)?\s*(?:hours?|hrs?)\b/i},
 rpm:{label:'MOTOR',pattern:/\b\d[\d,]*\s*RPM\b/i},
 oscillation:{label:'OSCILLATION',pattern:/\b\d{2,3}\s*(?:°|degrees?)\s*(?:oscillation|rotation)?/i},
 power:{label:'POWER',pattern:/\b\d+(?:\.\d+)?\s*(?:W|watts?)\b/i},
 speeds:{label:'SPEEDS',pattern:/\b\d+\s*(?:speed(?:s| settings)?|levels?)\b/i},
 gsm:{label:'FABRIC WEIGHT',pattern:/\b\d{2,3}(?:\+)?\s*GSM\b/i},
 material:{label:'MATERIAL',pattern:/(?:\b\d{1,3}%\s*)?\b(?:organic ringspun combed compact cotton|combed compact cotton|combed cotton|cotton|polyester|stainless steel|aluminium|silicone|elastane|spandex|mesh|denim)\b/i},
 fit:{label:'FIT',pattern:/\b(?:regular|slim|relaxed|oversized|athletic)\s*fit\b/i},
 volume:{label:'VOLUME',pattern:/\b\d+(?:\.\d+)?\s*(?:ml|litres?|liters?|l)\b/i},
 capacity:{label:'CAPACITY',pattern:/\b\d+(?:\.\d+)?\s*(?:ml|litres?|liters?|l|kg)\b/i},
 ports:{label:'CONNECTION',pattern:/\b(?:USB[- ]?C|USB[- ]?A|Type[- ]?C|Lightning|HDMI)\b/i},
 connectivity:{label:'CONNECTIVITY',pattern:/\b(?:Bluetooth\s*\d(?:\.\d)?|Wi[- ]?Fi(?:\s*\d)?)\b/i},
 dimensions:{label:'DIMENSIONS',pattern:/\b\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?(?:\s*[x×]\s*\d+(?:\.\d+)?)?\s*(?:cm|mm|inches?)\b/i}
};
const directions={
 polo:{layout:'fashion',font:'Bahnschrift',secondaryFont:'Georgia',motif:'folds',descriptor:'POLO',palette:['#f2f4f2','#dbe3e5','#183c41','#376965'],direction:'Tailored polo campaign: light folded-paper geometry, faint oversized POLO lettering behind the hero and a precise condensed headline. Give collar, placket and fabric room to read.'},
 kidswear:{layout:'playful',font:'Segoe Print',secondaryFont:'Bahnschrift',motif:'rays',descriptor:'PLAY',palette:['#fff7eb','#f4e2c7','#28485a','#b04f50'],direction:'Kidswear: restrained radial paper rays, warm off-white space, rounded expressive headline and contrasting compact second line. Preserve the actual print; no invented characters or age claims.'},
 denim:{layout:'fashion',font:'Bahnschrift',secondaryFont:'Bahnschrift',motif:'denim',descriptor:'DENIM',palette:['#f1f3f5','#d8e1e9','#19394f','#4c7494'],direction:'Denim editorial: bold condensed type, faint oversized DENIM lettering and subtle vertical framing. Preserve the full garment, wash, distressing, pockets and original photographed pose.'},
 womenswear:{layout:'editorial',font:'Georgia',secondaryFont:'Segoe UI',motif:'arch',descriptor:'',palette:['#f9f5ef','#e6ded4','#514342','#966959'],direction:'Quiet fashion editorial: ivory space, a soft architectural arch and a refined serif headline. Preserve embroidery, drape and the real photographed model. Never synthesize a replacement model.'},
 sportswear:{layout:'fashion',font:'Bahnschrift',secondaryFont:'Segoe UI',motif:'motion',descriptor:'MOVE',palette:['#f1f5f3','#dce6e2','#213b36','#568276'],direction:'Athletic studio: fine diagonal movement lines, a compact assertive headline and generous product scale. Performance callouts must come from catalogue facts.'},
 apparel:{layout:'fashion',font:'Georgia',secondaryFont:'Segoe UI',motif:'folds',descriptor:'',palette:['#f6f5f0','#e3e5dc','#2c3f3a','#7c8263'],direction:'Clean garment editorial: light paper geometry, restrained serif/sans hierarchy, a large undistorted garment and a short factual details rail.'},
 technical:{layout:'technical',font:'Bahnschrift',secondaryFont:'Segoe UI',motif:'technical',descriptor:'',palette:['#f0f6f7','#d9e8ea','#173b48','#397786'],direction:'Device studio: cool light surfaces, thin engineering arcs and a clear specification rail. Show the complete real device. Do not invent components, ratings, compatibility or use-case accessories.'},
 beauty:{layout:'editorial',font:'Georgia',secondaryFont:'Segoe UI',motif:'arch',descriptor:'',palette:['#faf5ee','#e9ded0','#51443e','#98715e'],direction:'Refined package editorial: warm ivory, soft architectural curves and elegant serif lettering. Preserve original packaging. Only documented quantity and ingredient details.'},
 playful:{layout:'playful',font:'Segoe Print',secondaryFont:'Bahnschrift',motif:'rays',descriptor:'',palette:['#fcf6e9','#e9ead3','#344a3b','#8a7744'],direction:'Playful object campaign with subtle paper rays, rounded typography and one dominant real product. No invented age ranges, safety badges or moving parts.'},
 minimal:{layout:'editorial',font:'Segoe UI',secondaryFont:'Georgia',motif:'folds',descriptor:'',palette:['#f5f5ef','#e2e6dc','#2a4039','#6f8162'],direction:'Useful-object studio: tactile light paper, balanced negative space and clean humanist type. Let the real product and its documented use lead.'}
};
function apparelKind(identity){
 if(/kid|\bboy|\bgirl|child|baby/iu.test(identity))return 'kidswear';
 if(/denim|jeans/iu.test(identity))return 'denim';
 if(/kurti|kameez|salwar|saree|sari|women|wonen|ladies/iu.test(identity))return 'womenswear';
 if(/polo/iu.test(identity))return 'polo';
 if(/sport|activewear|shorts|socks|jersey|athletic/iu.test(identity))return 'sportswear';
 return 'apparel';
}
export function analyzeProduct(product={}){
 const attributes=product.attributes||{},identity=[product.title,attributes.category,attributes.productType].filter(Boolean).join(' '),source=[product.title,attributes.category,attributes.productType,product.description,JSON.stringify(attributes.specifications||{})].filter(Boolean).join('\n');
 // The product title wins over broad or incorrect store categories.
 const profile=profiles.find(p=>p.pattern.test(product.title||''))||profiles.find(p=>p.pattern.test(identity))||profiles.find(p=>p.pattern.test(source))||{type:'general',style:'minimal',specs:['material','capacity','power'],useCase:'Let the catalogue description establish the actual use case.'};
 const subType=profile.type==='apparel'?apparelKind(identity):profile.type,key=profile.type==='apparel'?subType:profile.style==='technical'?'technical':profile.type==='beauty'?'beauty':profile.style==='playful'?'playful':'minimal',callouts=[];
 for(const spec of profile.specs){
  const d=definitions[spec];if(!d)continue;const explicit=attributes[spec]||attributes.specifications?.[spec],candidate=typeof explicit==='string'?explicit.trim():'';
  const found=candidate?(candidate.match(d.value||d.pattern)?.[0]||candidate.match(d.pattern)?.[0]):source.match(d.pattern)?.[0];
  if(found&&!/(?:[$€£৳]|\b(?:BDT|USD|price|discount|cures?)\b)/iu.test(found))callouts.push({key:spec,label:profile.type==='apparel'&&spec==='material'?'FABRIC':d.label,value:found.slice(0,65),evidence:candidate?'catalog attribute':'catalog text'});
 }
 return {type:profile.type,subType,style:profile.style,font:directions[key].font,category:attributes.category||'Uncategorized',recommendedRatio:['apparel','fan','charger'].includes(profile.type)?'4:5':'1:1',callouts:callouts.slice(0,3),useCase:profile.useCase,design:{key,...directions[key]},missingFacts:profile.specs.filter(k=>!callouts.some(c=>c.key===k)),rules:'Use the actual product. Never infer battery life, motor speed, certification, medical benefits or compatibility from appearance. Omit missing facts. No prices, Colour or Collection callouts, supplier logos or invented promotional badges.'};
}
