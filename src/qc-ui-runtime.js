import base from './workers-ai-production-runtime.js';

async function injectQcUi(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  const html=await response.text();
  const scripts=[
    '/private-production-qc-v2.js?v=20260815c',
    '/admin-upload-queue-fix.js?v=20260816c'
  ];
  let out=html;
  for(const src of scripts){
    if(out.includes(src))continue;
    const marker=`<script src="${src}" defer></script>`;
    out=out.includes('</body>')?out.replace('</body>',`${marker}</body>`):`${out}${marker}`;
  }
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store');
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
