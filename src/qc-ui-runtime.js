import base from './workers-ai-production-runtime.js';

async function injectQcUi(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  const html=await response.text();
  const src='/private-production-qc-v2.js?v=20260815c';
  const marker=`<script src="${src}" defer></script>`;
  const out=html.includes(src)?html:(html.includes('</body>')?html.replace('</body>',`${marker}</body>`):`${html}${marker}`);
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
