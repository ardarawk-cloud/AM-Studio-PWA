const RELEASE_HOUR_WITA = 19;
const FREE_LIMIT = 10;
const META_GRAPH_VERSION = 'v26.0';
const META_PAGE_PREFIX = 'AM Studio';

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

function validComicKey(pathname) {
  const key = decodeURIComponent(pathname.replace(/^\/comics\//, ''));
  if (!key || key.includes('..') || key.startsWith('/') || key.includes('\\')) return null;
  return key;
}

async function comicAsset(env, pathname) {
  if (!env.COMIC_ASSETS) return Response.json({ ok:false, error:'COMIC_STORAGE_NOT_BOUND' }, { status:503 });
  const key = validComicKey(pathname);
  if (!key) return Response.json({ ok:false, error:'INVALID_COMIC_ASSET_PATH' }, { status:400 });
  const object = await env.COMIC_ASSETS.get(key);
  if (!object) return Response.json({ ok:false, error:'COMIC_ASSET_NOT_FOUND' }, { status:404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=86400, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

function metaTokenReady(env) {
  return Boolean(env.META_SYSTEM_USER_TOKEN);
}

async function metaRequest(env, path, params = {}) {
  if (!metaTokenReady(env)) {
    return { ok:false, status:503, error:'META_SYSTEM_USER_TOKEN_NOT_CONFIGURED' };
  }

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${path.replace(/^\//, '')}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  url.searchParams.set('access_token', env.META_SYSTEM_USER_TOKEN);

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'accept': 'application/json' }
  });

  let data;
  try {
    data = await response.json();
  } catch {
    return { ok:false, status:502, error:'META_INVALID_RESPONSE' };
  }

  if (!response.ok || data?.error) {
    return {
      ok:false,
      status:response.status || 502,
      error:'META_API_ERROR',
      metaError:data?.error ? {
        message:data.error.message,
        type:data.error.type,
        code:data.error.code,
        subcode:data.error.error_subcode
      } : undefined
    };
  }

  return { ok:true, status:200, data };
}

async function managedAmStudioPages(env) {
  const result = await metaRequest(env, 'me/accounts', { fields:'id,name' });
  if (!result.ok) return result;
  const pages = Array.isArray(result.data?.data) ? result.data.data : [];
  return {
    ok:true,
    status:200,
    data:pages.filter(page => typeof page?.name === 'string' && page.name.trim().startsWith(META_PAGE_PREFIX))
  };
}

async function requireManagedPage(env, pageId) {
  if (!/^\d+$/.test(pageId)) return { ok:false, status:400, error:'INVALID_PAGE_ID' };
  const result = await managedAmStudioPages(env);
  if (!result.ok) return result;
  const page = result.data.find(item => item.id === pageId);
  if (!page) return { ok:false, status:403, error:'PAGE_NOT_IN_AM_STUDIO_SCOPE' };
  return { ok:true, status:200, data:page };
}

function safeLimit(url, fallback = 10, max = 25) {
  const raw = Number(url.searchParams.get('limit') || fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(raw)));
}

function apiJson(result, extra = {}) {
  if (!result.ok) {
    return Response.json({ ok:false, error:result.error, metaError:result.metaError, ...extra }, {
      status:result.status || 500,
      headers:{ 'cache-control':'no-store' }
    });
  }
  return Response.json({ ok:true, data:result.data, ...extra }, {
    headers:{ 'cache-control':'no-store' }
  });
}

async function metaPagesApi(env) {
  const result = await managedAmStudioPages(env);
  return apiJson(result, { controller:'ARDA_ACC_HUB', scope:'AM_STUDIO_ONLY' });
}

async function metaPostsApi(env, pageId, url, withEngagement = false) {
  const pageCheck = await requireManagedPage(env, pageId);
  if (!pageCheck.ok) return apiJson(pageCheck);

  const limit = safeLimit(url);
  const fields = withEngagement
    ? 'id,message,created_time,permalink_url,reactions.limit(0).summary(true),comments.limit(0).summary(true)'
    : 'id,message,created_time,permalink_url';

  const result = await metaRequest(env, `${pageId}/posts`, { fields, limit });
  return apiJson(result, {
    page:pageCheck.data,
    controller:'ARDA_ACC_HUB',
    mode:withEngagement ? 'ENGAGEMENT_READ' : 'CONTENT_READ'
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/comics/')) return comicAsset(env, url.pathname);

    if (url.pathname === '/api/meta/status') {
      return Response.json({
        ok:true,
        controller:'ARDA_ACC_HUB',
        graphVersion:META_GRAPH_VERSION,
        tokenConfigured:metaTokenReady(env),
        scope:'AM_STUDIO_ONLY',
        mode:'READ_CONTROL_V1',
        writeActions:'LOCKED_UNTIL_ADMIN_AUTH'
      }, { headers:{ 'cache-control':'no-store' } });
    }

    if (url.pathname === '/api/meta/pages') {
      return metaPagesApi(env);
    }

    const postsMatch = url.pathname.match(/^\/api\/meta\/pages\/(\d+)\/posts$/);
    if (postsMatch) return metaPostsApi(env, postsMatch[1], url, false);

    const engagementMatch = url.pathname.match(/^\/api\/meta\/pages\/(\d+)\/engagement$/);
    if (engagementMatch) return metaPostsApi(env, engagementMatch[1], url, true);

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
      return Response.json({
        ok:true,
        service:'AM STUDIO Reader',
        scheduler:'ACTIVE',
        policy:'QC_PASS_ONLY',
        readerRegistry:'ACTIVE',
        recoveryVault:'ACTIVE',
        comicStorage:env.COMIC_ASSETS ? 'BOUND' : 'WAITING_FOR_R2',
        metaPageController:metaTokenReady(env) ? 'READY' : 'WAITING_FOR_SECRET'
      });
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(controller, env, ctx) {
    const state = releaseState(new Date(controller.scheduledTime));
    console.log(JSON.stringify({ event: 'ACC_AUTO_RELEASE_TICK', ...state }));
    // Safety gate: publish only CANON_FINAL + QC_PASS + complete public assets.
  }
};
