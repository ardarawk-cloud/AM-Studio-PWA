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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/release-status') {
      return Response.json(releaseState(), { headers: { 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/api/health') {
      return Response.json({ ok: true, service: 'AM STUDIO Reader', scheduler: 'ACTIVE', policy: 'QC_PASS_ONLY' });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    const state = releaseState(new Date(controller.scheduledTime));
    console.log(JSON.stringify({ event: 'ACC_AUTO_RELEASE_TICK', ...state }));
    // Safety gate: no fictional episode/artwork is generated or published here.
    // Future catalog storage will release only entries explicitly marked QC_PASS with complete assets.
  }
};
