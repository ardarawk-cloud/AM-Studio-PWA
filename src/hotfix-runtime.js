import runtime from './runtime.js';

const BOOTSTRAP='<script id="am-reader-bootstrap" src="/reader-bootstrap.js?v=20260916a"></script>';

async function injectBootstrap(response){
  const ct=response.headers.get('content-type')||'';
  if(!response.ok||!ct.includes('text/html'))return response;
  let html=await response.text();
  if(!html.includes('id="am-reader-bootstrap"'))html=html.includes('</head>')?html.replace('</head>',`${BOOTSTRAP}</head>`):`${BOOTSTRAP}${html}`;
  const headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.set('x-am-reader-bootstrap','v1');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const response=await runtime.fetch(request,env,ctx);
    return injectBootstrap(response);
  },
  async scheduled(controller,env,ctx){
    if(runtime.scheduled)return runtime.scheduled(controller,env,ctx);
  }
};
