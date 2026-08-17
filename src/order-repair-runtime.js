import app from './admin-delete-runtime.js';

// Historical order repairs are one-time migrations. Running R2 marker checks on every
// cold isolate adds unnecessary work to normal reader requests and can contribute to
// Cloudflare Worker CPU exhaustion. Keep the runtime layer for compatibility, but make
// it a zero-cost pass-through. Any future migration must be an explicit admin action.
export default {
  async fetch(request,env,ctx){
    return app.fetch(request,env,ctx);
  },
  async scheduled(controller,env,ctx){
    if(app.scheduled)return app.scheduled(controller,env,ctx);
  }
};
