import runtime from './runtime.js';

// Reader/owner scripts are injected once in qc-ui-runtime. Avoid repeatedly reading,
// rewriting, and reconstructing the same HTML response in multiple runtime layers.
export default{
  async fetch(request,env,ctx){
    return runtime.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(runtime.scheduled)return runtime.scheduled(controller,env,ctx);
  }
};
