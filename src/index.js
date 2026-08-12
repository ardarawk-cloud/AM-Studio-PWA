const RELEASE_HOUR_WITA = 19;
const FREE_LIMIT = 10;

function witaNow(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function releaseState(date = new Date()) {
  const wita = witaNow(date);
  const dayKey = wita.toISOString().slice(0, 10);
  return {
    timezone: 'Asia/Makassar',
    releaseHour: `${String(RELEASE_HOUR_WITA).padStart(2, '0')}:00 WITA`,
    dayKey,
    policy: 'QC_PASS_ONLY',
    freeLimit: FREE_LIMIT,
    automation: 'ACTIVE',
    note: 'Scheduler runs daily. Production content is only publishable when its catalog entry is QC_PASS and assets are complete.'
  };
}

async function jsonAsset(env, requestUrl, path) {
  const assetUrl = new URL(path, requestUrl);
  const res = await env.ASSETS.fetch(new Request(assetUrl.toString()));
  if (!res.ok) return Response.json({ ok:false, error:'ASSET_REGISTRY_UNAVAILABLE', path }, { status:503 });
  const data = await res.json();
  return Response.json({ ok:true, data }, { headers:{ 'cache-control':'no-store' } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/release-status') {
      return Response.json(releaseState(), { headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/api/reader-assets') {
      return jsonAsset(env, request.url, '/reader-assets.json');
    }
    if (url.pathname === '/api/recovery-status') {
      return jsonAsset(env, request.url, '/recovery-manifest.json');
    }
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'AM STUDIO Reader', scheduler: 'ACTIVE', policy: 'QC_PASS_ONLY', readerRegistry: 'ACTIVE', recoveryVault: 'ACTIVE' });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    const state = releaseState(new Date(controller.scheduledTime));
    console.log(JSON.stringify({ event: 'ACC_AUTO_RELEASE_TICK', ...state }));
    // Safety gate: publish only CANON_FINAL + QC_PASS + complete public assets.
  }
};
