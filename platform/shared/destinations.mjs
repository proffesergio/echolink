export const websiteDestination=page=>page?.destination_type==='website';
export const automaticDestination=page=>page?.fb_verified===true||page?.destination_type==='facebook_profile'||websiteDestination(page)&&page.kind==='blog'&&page.website_publishing===true&&!!page.website_id&&page.creative_policy?.journal?.enabled===true;
export function websiteConfigurationProblem(page){
 if(!websiteDestination(page))return null;
 if(page.kind!=='blog'||!page.website_publishing||!page.website_id||!page.creative_policy?.journal?.enabled)return 'A website profile needs an enabled journal plan and publishing website.';
 if(page.facebook_connection_id||page.fb_page_id||page.fb_verified)return 'Website profiles do not use Facebook identities or Page verification.';
 return null;
}
