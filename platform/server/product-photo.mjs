import sharp from 'sharp';

// Inspect the actual alpha channel. A PNG extension or one transparent pixel
// does not establish that the background was successfully removed.
export async function inspectProductPhoto(bytes){
 const {data,info}=await sharp(bytes,{limitInputPixels:40000000}).rotate().ensureAlpha().extractChannel('alpha').raw().toBuffer({resolveWithObject:true});
 let foreground=0,soft=0,border=0,borderCount=0,left=info.width,top=info.height,right=-1,bottom=-1;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[y*info.width+x];if(a>20){foreground++;if(a<230)soft++;}
  if(a>8){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  if(x===0||y===0||x===info.width-1||y===info.height-1){borderCount++;if(a>230)border++;}
 }
 const coverage=foreground/data.length,softFraction=soft/Math.max(1,foreground),borderFraction=border/Math.max(1,borderCount),usableCutout=coverage>=.025&&coverage<=.95&&softFraction<.48&&borderFraction<.55;
 const pad=2,bounds=right<0?null:{left:Math.max(0,left-pad),top:Math.max(0,top-pad),width:Math.min(info.width-1,right+pad)-Math.max(0,left-pad)+1,height:Math.min(info.height-1,bottom+pad)-Math.max(0,top-pad)+1};
 return {width:info.width,height:info.height,coverage:Number(coverage.toFixed(4)),softFraction:Number(softFraction.toFixed(4)),borderFraction:Number(borderFraction.toFixed(4)),usableCutout,bounds};
}

export async function prepareProductPhoto(bytes){
 const quality=await inspectProductPhoto(bytes),image=sharp(bytes,{limitInputPixels:40000000}).rotate();
 // Never trim by RGB colour: that can cut white garments, pale packaging or
// uniform product edges. Retain the entire original when isolation is uncertain.
 if(quality.usableCutout)image.extract(quality.bounds);
 return {bytes:await image.png().toBuffer(),mode:quality.usableCutout?'isolated-product':'original-photo-panel',quality};
}
