import runtime from './runtime.js';

const AMU_EP001_STRIP='/comics/amu/ep001/episode-001-recovery-strip.jpg';
const AMU_EP001_CHUNKS=[
  'strip-00.b64','strip-01.b64','strip-02.b64','strip-03a.b64',
  'strip-04.b64','strip-05.b64','strip-06.b64','strip-07.b64',
  'strip-08.b64','strip-09.b64','strip-10.b64','strip-11.b64',
  'strip-12.b64','strip-13.b64','strip-14.b64','strip-15.b64'
];

function decodeBase64(b64){
  const raw=atob(b64.replace(/\s+/g,''));
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
}

async function recoveryStrip(request,env){
  let joined='';
  for(const name of AMU_EP001_CHUNKS){
    const u=new URL(`/comics/amu/ep001/recovery/${name}`,request.url);
    const r=await env.ASSETS.fetch(new Request(u.toString()));
    if(!r.ok)return new Response(`Recovery chunk missing: ${name}`,{status:503});
    joined+=await r.text();
  }
  let bytes;
  try{bytes=decodeBase64(joined)}catch{return new Response('Recovery strip decode failed',{status:500})}
  return new Response(bytes,{headers:{'content-type':'image/jpeg','cache-control':'public, max-age=3600','x-am-recovery-asset':'AMU_EP001_FB_CAPTURE'}});
}

function injectReaderHotfix(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  return response.text().then(html=>{
    const marker='<script src="/reader-hotfix.js?v=20260813b" defer></script>';
    const out=html.includes(marker)?html:(html.includes('</body>')?html.replace('</body>',`${marker}</body>`):`${html}${marker}`);
    const h=new Headers(response.headers);h.set('cache-control','no-store');
    return new Response(out,{status:response.status,statusText:response.statusText,headers:h});
  });
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname===AMU_EP001_STRIP&&request.method==='GET')return recoveryStrip(request,env);
    const response=await runtime.fetch(request,env,ctx);
    return injectReaderHotfix(response);
  },
  async scheduled(controller,env,ctx){
    if(runtime.scheduled)return runtime.scheduled(controller,env,ctx);
  }
};
