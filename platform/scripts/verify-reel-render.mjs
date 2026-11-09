import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {renderVerticalVideo,runMediaCommand} from '../server/reels.mjs';
const dir=new URL('../.local/verification/reels/',import.meta.url);await mkdir(dir,{recursive:true});const audioURL=new URL('test-tone.wav',dir),output=new URL('vertical-smoke.mp4',dir);
try{
 await runMediaCommand('ffmpeg',['-y','-f','lavfi','-i','sine=frequency=220:duration=30','-c:a','pcm_s16le',fileURLToPath(audioURL)]);
 const storyboard=Array.from({length:3},(_,i)=>({duration_seconds:10,voiceover_text_bengali:'এটি প্রকাশযোগ্য সংবাদ নয়, পরীক্ষার দৃশ্য।',visual_asset_search_query:'minimal abstract background',text_overlay_style:'clean Bengali typography',text_overlay:['নতুন ভাবনা','নিজস্ব গল্প','পরের পদক্ষেপ'][i]}));
 const images=await Promise.all(['#293943','#53442e','#333d36'].map(background=>sharp({create:{width:720,height:1280,channels:3,background}}).png().toBuffer().then(bytes=>({bytes,credit:'Local synthetic test fixture'}))));
 const start=Date.now(),video=await renderVerticalVideo({storyboard,images,audio:await readFile(audioURL),page:{name:'EchoLink render test'},fontPath:fileURLToPath(new URL('../assets/fonts/NotoSansBengali.ttf',import.meta.url)),onProgress:async i=>console.log('Rendering test scene '+i+' of 3')});await writeFile(output,video.bytes);
 const metadata=JSON.parse(await runMediaCommand('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',fileURLToPath(output)]));
 if(!metadata.streams.some(s=>s.codec_type==='video'&&s.width===720&&s.height===1280)||!metadata.streams.some(s=>s.codec_type==='audio')||Number(metadata.format.duration)<29.9)throw new Error('The rendered video failed its media checks.');
 console.log(JSON.stringify({passed:true,width:720,height:1280,duration:metadata.format.duration,bytes:video.bytes.length,seconds:Math.round((Date.now()-start)/1000),audio:'synthetic test tone, not a TTS-provider test',publicationSubmitted:false}));
}finally{await unlink(audioURL).catch(()=>{});}
