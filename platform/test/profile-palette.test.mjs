import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {renderNewsCreative} from '../server/news-design.mjs';

test('specialized news rendering uses the selected profile background and text palette',async()=>{
 const result=await renderNewsCreative({post:{title:'A clear factual headline for readers',creative:{},seo:{}},page:{name:'Independent profile',language:'English',profile_config:{typography_config:{palette:{background:'#201060',text:'#00ff00',primary:'#ff0000'}}}},width:1080,height:1080});
 const {data,info}=await sharp(result.bytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const corner=Array.from(data.subarray(0,3));
 assert(Math.abs(corner[0]-32)<10&&Math.abs(corner[1]-16)<10&&Math.abs(corner[2]-96)<10);
 let green=0;for(let y=190;y<500;y++)for(let x=0;x<info.width;x++){const i=(y*info.width+x)*info.channels;if(data[i]<80&&data[i+1]>180&&data[i+2]<80)green++;}
 assert(green>100,'Headline contains the profile’s selected green ink');
});
