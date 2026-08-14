import runtime from './runtime.js';

async function injectReaderHotfix(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  const html=await response.text();
  const src='/reader-hotfix.js?v=20260814hpg1';
  const marker=`<script src="${src}" defer></script>`;
  let out=html.replace(/<script src="\/reader-hotfix\.js\?v=[^"]+" defer><\/script>/g,'');
  out=out.includes('</body>')?out.replace('</body>',`${marker}</body>`):`${out}${marker}`;
  const h=new Headers(response.headers);h.set('cache-control','no-store');
  return new Response(out,{status:response.status,statusText:response.statusText,headers:h});
}

export default{
  async fetch(request,env,ctx){
    const response=await runtime.fetch(request,env,ctx);
    return injectReaderHotfix(response);
  },
  async scheduled(controller,env,ctx){
    if(runtime.scheduled)return runtime.scheduled(controller,env,ctx);
  }
};
