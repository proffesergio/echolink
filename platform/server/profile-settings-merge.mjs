// Merge before validation: schema defaults must not erase omitted dashboard settings.
// Explicit empty strings/arrays/null remain edits; objects merge by supplied keys.
export function mergeSettings(prior, supplied) {
 if(!supplied || typeof supplied!=='object' || Array.isArray(supplied))return supplied;
 const result={...(prior&&typeof prior==='object'&&!Array.isArray(prior)?prior:{})};
 for(const [key,value] of Object.entries(supplied)){
  if(['__proto__','constructor','prototype'].includes(key))continue;
  result[key]=value&&typeof value==='object'&&!Array.isArray(value)?mergeSettings(result[key],value):value;
 }
 return result;
}
export function preserveProfileSettings(body, prior) {
 const result={...body};
 for(const key of ['creative_policy','profile_config','brand'])result[key]=Object.hasOwn(body,key)?mergeSettings(prior[key],body[key]):prior[key];
 return result;
}
