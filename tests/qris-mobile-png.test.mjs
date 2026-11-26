import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import qrcode from 'qrcode-generator';
import {qrisPng} from '../src/qris-png.js';
import {NADMO_QRIS_PAYLOAD} from '../src/static-qris.js';

const header=[137,80,78,71,13,10,26,10];
function parsePng(bytes){
  assert.deepEqual(Array.from(bytes.slice(0,8)),header);
  let i=8,ihdr,compressed;
  while(i<bytes.length){
    const length=new DataView(bytes.buffer,bytes.byteOffset+i,4).getUint32(0);
    const type=new TextDecoder().decode(bytes.slice(i+4,i+8));
    const data=bytes.slice(i+8,i+8+length);
    if(type==='IHDR')ihdr=data;
    if(type==='IDAT')compressed=data;
    if(type==='IEND')break;
    i+=length+12;
  }
  assert.ok(ihdr&&compressed);
  const w=new DataView(ihdr.buffer,ihdr.byteOffset,8).getUint32(0),h=new DataView(ihdr.buffer,ihdr.byteOffset+4,4).getUint32(0);
  assert.equal(ihdr[8],1,'1-bit monochrome');
  assert.equal(ihdr[9],0,'grayscale PNG, safe for QR scanning and gallery');
  const raw=inflateSync(compressed);
  const stride=Math.ceil(w/8)+1;
  assert.equal(raw.byteLength,h*stride);
  for(let y=0;y<h;y++)assert.equal(raw[y*stride],0,'filter=none');
  const color=(x,y)=>Number(Boolean(raw[y*stride+1+(x>>3)]&(1<<(7-(x&7)))));
  return {w,h,color};
}

test('real Nadmo Studio QRIS converts to saveable PNG with accurate merchant QR modules',async()=>{
  const qr=qrcode(0,'M');qr.addData(NADMO_QRIS_PAYLOAD);qr.make();
  const data=await qrisPng(qr);
  const png=parsePng(data),scale=12,quiet=4;
  assert.ok(data.byteLength>200,'PNG must not be empty');
  assert.ok(data.byteLength<500000,'PNG suitable for Android downloads');
  assert.equal(png.w,(qr.getModuleCount()+quiet*2)*scale);
  assert.equal(png.h,png.w);
  assert.equal(png.color(0,0),1,'quiet zone is white');
  assert.equal(png.color(png.w-1,png.h-1),1,'quiet zone is white');
  for(let row=0;row<qr.getModuleCount();row+=3){
    for(let col=0;col<qr.getModuleCount();col+=3){
      const x=(col+quiet)*scale+5,y=(row+quiet)*scale+5;
      assert.equal(png.color(x,y),qr.isDark(row,col)?0:1,`module ${row},${col}`);
    }
  }
});
test('reject invalid renderer input rather than generating corrupted QRIS',async()=>{
  await assert.rejects(qrisPng(null),/QR_CODE_REQUIRED/);
  const qr=qrcode(0,'M');qr.addData('QRIS TEST');qr.make();
  await assert.rejects(qrisPng(qr,{scale:0}),/INVALID_QR_RENDER_OPTIONS/);
  await assert.rejects(qrisPng(qr,{quiet:0}),/INVALID_QR_RENDER_OPTIONS/);
});
