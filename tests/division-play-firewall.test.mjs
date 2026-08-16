import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  completeReaderAsset,
  filterReaderRegistry,
  filterCatalog,
  stripInternalScripts,
  isPlayRequest,
  publicDocument
} from '../src/play-firewall-runtime.js';

const readerRegistry=JSON.parse(fs.readFileSync(new URL('../public/reader-assets.json',import.meta.url),'utf8'));
const catalog=JSON.parse(fs.readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
const wrangler=fs.readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const privacy=fs.readFileSync(new URL('../public/privacy-policy.html',import.meta.url),'utf8');
const firewallSource=fs.readFileSync(new URL('../src/play-firewall-runtime.js',import.meta.url),'utf8');

test('Worker entrypoint is the Play firewall outer layer',()=>{
  assert.match(wrangler,/\.\/src\/play-firewall-runtime\.js/);
});

test('Play firewall strips every owner-only injected script from HTML',()=>{
  const html=`<html><body>
    <script src="/page-control.js?v=1" defer></script>
    <script src="/admin-panel.js?v=2" defer></script>
    <script src="/asset-upload.js?v=3" defer></script>
    <script src="/private-production.js?v=4" defer></script>
    <script src="/private-production-qc-v2.js?v=5" defer></script>
    <script src="/admin-upload-queue-fix.js?v=6" defer></script>
    <script src="/reader-hotfix.js?v=7" defer></script>
  </body></html>`;
  const out=stripInternalScripts(html);
  for(const forbidden of [
    'page-control.js','admin-panel.js','asset-upload.js','private-production.js',
    'private-production-qc-v2.js','admin-upload-queue-fix.js'
  ]) assert.doesNotMatch(out,new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(out,/reader-hotfix\.js/,'reader-only visual hotfix may remain');
});

test('Play mode is sticky for native Play WebView even when an internal URL loses channel query',()=>{
  assert.equal(isPlayRequest(new Request('https://am-studio-pwa.ardarawk.workers.dev/',{headers:{'user-agent':'Android WebView AMStudioAndroid/1.0.0 PlayReader'}})),true);
  assert.equal(isPlayRequest(new Request('https://am-studio-pwa.ardarawk.workers.dev/?channel=play')),true);
  assert.equal(isPlayRequest(new Request('https://am-studio-pwa.ardarawk.workers.dev/')),false);
});

test('Privacy document is public-safe on both source and Cloudflare clean routes',async()=>{
  const source='<html><body><script src="/admin-panel.js?v=1" defer></script><p>Privacy</p></body></html>';
  const response=await publicDocument(new Response(source,{headers:{'content-type':'text/html'}}));
  const out=await response.text();
  assert.doesNotMatch(out,/admin-panel\.js/);
  assert.doesNotMatch(out,/native-reader\.js|growth-reader\.js/);
  assert.equal(response.headers.get('x-am-public-document'),'safe');
  assert.match(privacy,/href="\/\?channel=play"/);
  assert.match(firewallSource,/url\.pathname==='\/privacy-policy\.html'/);
  assert.match(firewallSource,/url\.pathname==='\/privacy-policy'/);
});

test('static Play registry exposes only complete CANON_FINAL QC_PASS episodes',()=>{
  const filtered=filterReaderRegistry(readerRegistry);
  assert.ok(filtered.episodes.length>0);
  assert.ok(filtered.episodes.every(completeReaderAsset));
  assert.deepEqual(filtered.episodes.map(x=>`${x.seriesId}:${x.episode}`),['amu:1']);
  assert.equal(filtered.registry.readerMode,'PUBLIC_READER_ONLY');
  assert.equal(filtered.registry.playFirewall,true);
});

test('static Play catalog exposes only public-ready series with public-facing status',()=>{
  const registry=filterReaderRegistry(readerRegistry);
  const filtered=filterCatalog(catalog,registry);
  assert.deepEqual(filtered.series.map(x=>x.id),['amu']);
  assert.equal(filtered.series[0].publicReaderState,'READY');
  assert.equal(filtered.series[0].status,'PUBLISHED');
  assert.equal(filtered.series[0].qc,'PUBLIC_READER_READY');
  assert.equal(filtered.series[0].episodes,1);
  assert.ok(filtered.series.every(x=>!String(x.status||'').includes('AUDIT_PENDING')));
  assert.ok(filtered.series.every(x=>!String(x.status||'').includes('CANON_HOLD')));
  assert.equal(filtered.studio.mode,'PUBLIC_READER_ONLY');
  assert.equal(filtered.studio.playFirewall,true);
});
