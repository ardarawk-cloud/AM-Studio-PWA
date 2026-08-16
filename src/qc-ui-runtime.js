import base from './workers-ai-production-runtime.js';

async function injectQcUi(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  const html=await response.text();
  const scripts=[
    '/private-production-qc-v2.js?v=20260815c',
    '/admin-upload-queue-fix.js?v=20260816c',
    '/reader-zoom.js?v=2'
  ];
  let out=html;
  for(const src of scripts){
    const baseSrc=src.split('?')[0];
    if(out.includes(src)||out.includes(`src="${baseSrc}`)||out.includes(`src='${baseSrc}`))continue;
    const marker=`<script src="${src}" defer></script>`;
    out=out.includes('</body>')?out.replace('</body>',`${marker}</body>`):`${out}${marker}`;
  }
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('x-am-reader-zoom','continuous-v2');
  return new Response(out,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    return injectQcUi(await base.fetch(request,env,ctx));
  },
  async scheduled(controller,env,ctx){
    if(base.scheduled)return base.scheduled(controller,env,ctx);
  }
};
