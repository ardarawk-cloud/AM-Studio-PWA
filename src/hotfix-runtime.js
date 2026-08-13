import runtime from './runtime.js';

const AMU_EP001_STRIP='/comics/amu/ep001/episode-001-recovery-strip.jpg';
const AMU_EP001_STATUS='/api/recovery/amu/ep001/status';
const AMU_EP001_CHUNKS=[
  'strip-00.b64','strip-01.b64','strip-02.b64','strip-03a.b64',
  'strip-04.b64','strip-05.b64','strip-06.b64','strip-07.b64',
  'strip-08.b64','strip-09.b64','strip-10.b64','strip-11.b64',
  'strip-12.b64','strip-13.b64','strip-14.b64','strip-15.b64','strip-16.b64'
];

function decodeBase64(b64){
  const clean=b64.replace(/\s+/g,'');
  const raw=atob(clean);
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return{bytes,clean};
}

async function loadRecovery(env,request){
  const chunks=[];
  let joined='';
  for(const name of AMU_EP001_CHUNKS){
    const u=new URL(`/comics/amu/ep001/recovery/${name}`,request.url);
    const r=await env.ASSETS.fetch(new Request(u.toString(),{headers:{accept:'text/plain'}}));
    if(!r.ok)return{ok:false,error:'CHUNK_MISSING',name,status:r.status,chunks};
    const text=await r.text();
    chunks.push({name,length:text.length});
    joined+=text;
  }
  try{
    const {bytes,clean}=decodeBase64(joined);
    const jpegStart=bytes.length>=2&&bytes[0]===0xff&&bytes[1]===0xd8;
    const jpegEnd=bytes.length>=2&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9;
    return{ok:true,bytes,cleanLength:clean.length,chunks,jpegStart,jpegEnd};
  }catch(e){
    return{ok:false,error:'BASE64_DECODE_FAILED',message:String(e?.message||e),joinedLength:joined.replace(/\s+/g,'').length,chunks};
  }
}

async function recoveryStrip(request,env){
  const x=await loadRecovery(env,request);
  if(!x.ok)return Response.json(x,{status:500,headers:{'cache-control':'no-store'}});
  if(!x.jpegStart)return Response.json({ok:false,error:'JPEG_MAGIC_INVALID',byteLength:x.bytes.length,cleanLength:x.cleanLength,jpegEnd:x.jpegEnd},{status:500,headers:{'cache-control':'no-store'}});
  return new Response(x.bytes,{headers:{
    'content-type':'image/jpeg',
    'cache-control':'public, max-age=300',
    'x-am-recovery-asset':'AMU_EP001_FB_CAPTURE',
    'x-am-recovery-bytes':String(x.bytes.length)
  }});
}

async function recoveryStatus(request,env){
  const x=await loadRecovery(env,request);
  if(!x.ok)return Response.json(x,{status:500,headers:{'cache-control':'no-store'}});
  return Response.json({ok:true,chunkCount:x.chunks.length,chunks:x.chunks,cleanLength:x.cleanLength,byteLength:x.bytes.length,jpegStart:x.jpegStart,jpegEnd:x.jpegEnd},{headers:{'cache-control':'no-store'}});
}

function injectReaderHotfix(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  return response.text().then(html=>{
    const src='/reader-hotfix.js?v=20260813d';
    const marker=`<script src="${src}" defer></script>`;
    let out=html.replace(/<script src="\/reader-hotfix\.js\?v=[^"]+" defer><\/script>/g,'');
    out=out.includes('</body>')?out.replace('</body>',`${marker}</body>`):`${out}${marker}`;
    const h=new Headers(response.headers);h.set('cache-control','no-store');
    return new Response(out,{status:response.status,statusText:response.statusText,headers:h});
  });
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===AMU_EP001_STRIP&&request.method==='GET')return recoveryStrip(request,env);
    if(url.pathname===AMU_EP001_STATUS&&request.method==='GET')return recoveryStatus(request,env);
    const response=await runtime.fetch(request,env,ctx);
    return injectReaderHotfix(response);
  },
  async scheduled(controller,env,ctx){
    if(runtime.scheduled)return runtime.scheduled(controller,env,ctx);
  }
};
