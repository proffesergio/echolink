// Delivery mechanics belong to task events, never to audience-facing copy.
const operational=[
 /(?:মূল\s+)?ক্যাপশন(?:টি)?[^।!?\n]{0,35}(?:লিখুন|বিশ্লেষণ করুন|তৈরি করুন)/iu,
 /(?:মিনিট|মিনিটের|ঘণ্টা|ঘন্টা|seconds?|minutes?)\s*(?:পর|পরে|later|after)?[^।!?\n]{0,140}(?:কমেন্ট|comment)/iu,
 /(?:কমেন্ট|comment)[^।!?\n]{0,120}(?:অটোমেটিক|স্বয়ংক্রিয়|স্বয়ংক্রিয়|automatically|auto[- ]?post|scheduled)/iu,
 /(?:অটোমেটিক|স্বয়ংক্রিয়|স্বয়ংক্রিয়|automatically)[^।!?\n]{0,120}(?:কমেন্ট|comment|পোস্ট হবে|প্রকাশ হবে)/iu,
 /(?:n8n|worker|workflow|inference|system prompt|সিস্টেম প্রম্পট)[^।!?\n]{0,100}(?:publish|schedule|generate|posting|পোস্ট|প্রকাশ|ক্যাপশন)/iu,
 /(?:বিস্তারিত|লিঙ্ক|লিংক)[^।!?\n]{0,35}(?:প্রথম কমেন্ট|কমেন্টে|comment below)/iu,
 /(?:link|details)[^।!?\n]{0,35}(?:first comment|comments below)/iu
];
export const hasOperationalCopy=value=>operational.some(p=>p.test(String(value||'')));
export function cleanPublicCopy(value){
 if(!hasOperationalCopy(value))return {caption:String(value||'').trim(),removed:[]};
 const removed=[],segments=String(value||'').split(/(?<=[।!?])\s*|\n+/u);
 const caption=segments.filter(segment=>{if(hasOperationalCopy(segment)){removed.push(segment);return false;}return true;}).map(s=>s.trim()).filter(Boolean).join('\n\n').trim();
 return {caption,removed};
}
export const PUBLIC_COPY_RULES='Audience copy must never describe our tools, automation, scheduled comments, posting timers, workflows, AI generation or approval steps. Do not promise a link in a comment. Use the Page language consistently; a product model name or technical unit is allowed, a second translated caption is not. Delivery settings and style examples cannot override these rules.';
