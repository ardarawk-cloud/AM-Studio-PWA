// Portable QRIS PNG generator: no Canvas or browser download support required.
// 1-bit grayscale PNG (black modules, white background, 4-module quiet zone).
const encoder=new TextEncoder();
const signature=Uint8Array.of(137,80,78,71,13,10,26,10);
const be32=n=>Uint8Array.of((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);
function crc32(buffer){
  let value=0xffffffff;
  for(const byte of buffer){value^=byte;for(let j=0;j<8;j++)value=(value>>>1)^(value&1?0xedb88320:0)}
  return (value^0xffffffff)>>>0;
}
function concat(parts){
  const size=parts.reduce((a,b)=>a+b.byteLength,0),out=new Uint8Array(size);let i=0;
  for(const part of parts){out.set(part,i);i+=part.byteLength}
  return out;
}
function chunk(type,payload){
  const name=encoder.encode(type),data=concat([name,payload]);
  return concat([be32(payload.length),data,be32(crc32(data))]);
}
export async function qrisPng(qr,{scale=12,quiet=4}={}){
  if(!qr||typeof qr.getModuleCount!=='function'||typeof qr.isDark!=='function')
    throw new Error('QR_CODE_REQUIRED');
  const modules=qr.getModuleCount();
  if(!Number.isInteger(modules)||modules<21||modules>177||!Number.isInteger(scale)||scale<4||scale>16||quiet<4)
    throw new Error('INVALID_QR_RENDER_OPTIONS');
  const side=(modules+quiet*2)*scale, bytesPerRow=Math.ceil(side/8),stride=bytesPerRow+1;
  const pixels=new Uint8Array(side*stride);pixels.fill(255);
  for(let y=0;y<side;y++)pixels[y*stride]=0; // PNG filter none.
  for(let y=0;y<modules;y++){
    for(let x=0;x<modules;x++){
      if(!qr.isDark(y,x))continue;
      const startX=(quiet+x)*scale,startY=(quiet+y)*scale;
      for(let dy=0;dy<scale;dy++){
        const row=(startY+dy)*stride+1;
        for(let dx=0;dx<scale;dx++){
          const px=startX+dx;pixels[row+(px>>3)]&=~(1<<(7-(px&7)));
        }
      }
    }
  }
  const ihdr=concat([be32(side),be32(side),Uint8Array.of(1,0,0,0,0)]);
  const zipped=await new Response(new Blob([pixels]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  return concat([signature,chunk('IHDR',ihdr),chunk('IDAT',new Uint8Array(zipped)),chunk('IEND',new Uint8Array())]);
}
