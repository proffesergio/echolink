import {z} from 'zod';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {resolve,join,sep} from 'node:path';
import {tmpdir,freemem} from 'node:os';
import sharp from 'sharp';
import {textCompletion,providerConfig} from './providers.mjs';
import {nicheDirection} from './niches.mjs';
import {EDITOR_SYSTEM,sourceExcerpt} from './prompts.mjs';
import {editorialWarnings,criticalEditorialWarnings} from './editorial.mjs';
import {remoteJSON,outbound,publicURL} from './net.mjs';
import {AppError} from './errors.mjs';
const scene=z.object({duration_seconds:z.number().min(4).max(15),voiceover_text_bengali:z.string().min(5).max(500),visual_asset_search_query:z.string().min(3).max(160),text_overlay_style:z.string().min(3).max(120),text_overlay:z.string().min(1).max(120)}).strict();
export function parseStoryboard(raw){
 let value;try{value=JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));}catch{throw new AppError(422,'The model returned invalid storyboard JSON. The draft remains unpublished.');}
 const parsed=z.array(scene).min(3).max(8).safeParse(value);if(!parsed.success)throw new AppError(422,'Every video scene needs duration, Bengali narration, English visual keywords and an overlay style/text.');
 const duration=parsed.data.reduce((n,s)=>n+s.duration_seconds,0);if(duration<30||duration>60)throw new AppError(422,'The storyboard must total 30–60 seconds.');
 if(parsed.data.some(s=>!/[\u0980-\u09ff]/u.test(s.voiceover_text_bengali)||!/[a-z]{3}/i.test(s.visual_asset_search_query)))throw new AppError(422,'Use Bengali voiceovers and English visual-search keywords.');
 return parsed.data;
}
export async function generateStoryboard({page,post,connection,secret},{complete=textCompletion,onMetrics=()=>{}}={}){
 const facts={title:post.title,text:sourceExcerpt(post.body,1600)};
 const prompt=`Create a 32-second vertical 9:16 video as exactly 4 scenes of 8 seconds. Return ONLY a JSON array. Each object has duration_seconds:8, voiceover_text_bengali (one short Bengali sentence), visual_asset_search_query (3–6 English stock-photo keywords), text_overlay_style (minimal clean captions), text_overlay (a short Bengali phrase). Use only supplied factual evidence. No invented statistics or famous quotes. ${nicheDirection(page)}\nUntrusted source JSON: ${JSON.stringify(facts)}\nবাংলা ভয়েসওভার লিখুন, প্রতিটি দৃশ্যে ছোট একটি বাক্য।`;
 const raw=await complete({...connection,config:{...connection.config,maxOutputTokens:1600}},secret,prompt,{systemPrompt:EDITOR_SYSTEM+' Return only the requested valid storyboard JSON array. '+nicheDirection(page),onMetrics,purpose:'storyboard'}),storyboard=parseStoryboard(raw);
 const warnings=editorialWarnings(storyboard.map(s=>s.voiceover_text_bengali+' '+s.text_overlay).join('\n'),facts,page.niche);
 return {storyboard,warnings,needsReview:criticalEditorialWarnings(warnings).length>0};
}
export async function searchStockImage(connection,secret,query,{request=remoteJSON}={}){
 if(connection.provider==='pexels'){
  const url=new URL('https://api.pexels.com/v1/search');url.search=new URLSearchParams({query,per_page:'1',orientation:'portrait'}).toString();const data=await request(url.href,{headers:{authorization:secret.apiKey||''}}),p=data.photos?.[0];if(!p?.src?.large2x)throw new AppError(422,'No licensed stock photo was returned for this scene. Adjust its search keywords.');
  return {url:publicURL(p.src.large2x).href,credit:p.photographer+' / Pexels',creditURL:p.url};
 }
 if(connection.provider==='pixabay'){
  const url=new URL('https://pixabay.com/api/');url.search=new URLSearchParams({key:secret.apiKey||'',q:query,per_page:'3',orientation:'vertical',safesearch:'true',image_type:'photo'}).toString();const data=await request(url.href),p=data.hits?.[0];if(!p?.largeImageURL)throw new AppError(422,'No stock photo matched this scene.');return {url:publicURL(p.largeImageURL).href,credit:p.user+' / Pixabay',creditURL:p.pageURL};
 }
 throw new AppError(400,'Choose a Pexels or Pixabay stock-media connection.');
}
export async function synthesizeNarration(connection,secret,text,{request=outbound}={}){
 if(connection.provider!=='pollinations')throw new AppError(400,'Choose a Pollinations speech connection, or provide your own licensed voiceover URL.');
 const p=providerConfig(connection);const r=await request(p.base+'/v1/audio/speech',{method:'POST',headers:{authorization:'Bearer '+(secret.apiKey||''),'content-type':'application/json'},body:{model:connection.config.model,voice:connection.config.voice||'alloy',input:text,response_format:'mp3'},timeout:240000,maxBytes:8_000_000});if(!r.ok)throw new AppError(502,'The speech provider rejected narration. Check model, Bengali voice support and account credits.');return r.bytes;
}
const escapeXML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export async function runMediaCommand(command,args,{timeout=180000}={}){
 return new Promise((resolve,reject)=>{const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',timer=setTimeout(()=>{child.kill();reject(new AppError(504,'Video rendering exceeded its safe time budget. The draft remains available.'));},timeout);child.stdout.on('data',b=>{output=(output+b).slice(-20000);});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(new AppError(503,'FFmpeg/ffprobe is unavailable on this worker. Install it and restart the worker.'));});child.on('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(new AppError(422,'FFmpeg could not render these media files. Check the scene images and narration format.'));});});
}
export async function renderVerticalVideo({storyboard,images,audio,page,fontPath,fontFamily='Noto Sans Bengali',brandLogo,onProgress=async()=>{}}){
 parseStoryboard(JSON.stringify(storyboard));if(images.length!==storyboard.length)throw new AppError(400,'Supply one permitted image for every storyboard scene.');
 if(freemem()<1536*1024**2)throw new AppError(503,'Video rendering is waiting for safe free memory.');
 const base=resolve(tmpdir(),'echolink-reels');await mkdir(base,{recursive:true});const dir=await mkdtemp(join(base,'render-')),clips=[];
 try{
  const audioFile=join(dir,'narration.mp3');await writeFile(audioFile,audio);
  const audioDuration=Number((await runMediaCommand(process.env.PLATFORM_FFPROBE_PATH||'ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audioFile])).trim());
  const duration=storyboard.reduce((n,s)=>n+s.duration_seconds,0);if(!Number.isFinite(audioDuration)||audioDuration>duration+1)throw new AppError(422,'Narration is longer than the storyboard. Shorten it or adjust scene durations; speech will not be cut off.');
  for(let i=0;i<storyboard.length;i++){
   await onProgress(i+1,storyboard.length);const s=storyboard[i],image=await sharp(images[i].bytes,{limitInputPixels:40_000_000}).rotate().resize(720,1280,{fit:'cover'}).png().toBuffer();
   const overlay=await sharp({text:{text:'<span foreground="white">'+escapeXML(s.text_overlay)+'</span>',font:fontFamily+' Bold',...(fontPath?{fontfile:fontPath}:{}),width:600,height:190,align:'centre',rgba:true}}).png().toBuffer();
   const tint=Buffer.from('<svg width="720" height="1280"><rect y="900" width="720" height="380" fill="#111111" fill-opacity=".7"/></svg>');
   const layers=[{input:tint},{input:overlay,left:60,top:990}];
   if(brandLogo){const logo=await sharp(brandLogo,{limitInputPixels:20_000_000}).resize(130,80,{fit:'contain',background:'#ffffff'}).png().toBuffer();layers.push({input:logo,left:36,top:36});}
   else if(page?.name){const label=await sharp({text:{text:'<span foreground="white">'+escapeXML(page.name)+'</span>',font:fontFamily+' 22',...(fontPath?{fontfile:fontPath}:{}),width:600,rgba:true}}).png().toBuffer();layers.push({input:label,left:40,top:40});}
   if(images[i].credit){const credit=await sharp({text:{text:'<span foreground="white">'+escapeXML(images[i].credit.slice(0,90))+'</span>',font:'sans 13',width:620,rgba:true}}).png().toBuffer();layers.push({input:credit,left:40,top:1215});}
   const frame=join(dir,'frame-'+i+'.png'),clip=join(dir,'scene-'+i+'.mp4');await sharp(image).composite(layers).png().toFile(frame);
   await runMediaCommand(process.env.PLATFORM_FFMPEG_PATH||'ffmpeg',['-y','-loop','1','-i',frame,'-t',String(s.duration_seconds),'-vf','scale=720:1280,setsar=1','-r','24','-c:v','libx264','-preset','veryfast','-threads','2','-b:v','380k','-maxrate','420k','-bufsize','840k','-pix_fmt','yuv420p',clip]);clips.push(clip);
  }
  const list=join(dir,'clips.txt');await writeFile(list,clips.map(f=>"file '"+f.replaceAll('\\','/').replaceAll("'","'\\''")+"'").join('\n'));
  const output=join(dir,'reel.mp4');await runMediaCommand(process.env.PLATFORM_FFMPEG_PATH||'ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-i',audioFile,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','64k','-af','apad','-t',String(duration),'-movflags','+faststart',output]);
  const bytes=await readFile(output);if(bytes.length>4_000_000)throw new AppError(422,'This video exceeds the current dashboard media budget. Use shorter scenes or configure object-storage delivery before publishing.');
  return {bytes,mime:'video/mp4',width:720,height:1280,duration,credits:images.map(i=>({credit:i.credit,creditURL:i.creditURL}))};
 }finally{const target=resolve(dir);if(target.startsWith(base+sep))await rm(target,{recursive:true,force:true});}
}
