import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/owner-upload.html',import.meta.url),'utf8');

test('standalone owner uploader is browser-only and uses verified R2 publish flow',()=>{
  assert.match(html,/AM STUDIO Owner • browser only/);
  assert.match(html,/PUBLISH EPISODE/);
  assert.match(html,/\/api\/assets\/upload\?key=/);
  assert.match(html,/\/api\/assets\/meta/);
  assert.match(html,/\/api\/assets\/list\?prefix=/);
  assert.match(html,/\/trim\//);
  assert.match(html,/VERIFY_FAILED/);
  assert.match(html,/for\(let attempt=1;attempt<=3;attempt\+\+\)/);
});

test('owner uploader has no production generator or auto-produce dependency',()=>{
  assert.doesNotMatch(html,/generate-next|AUTO PRODUCE|OPENAI_API_KEY|Workers AI/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../public/owner-upload.html',import.meta.url),'utf8');
const runtime=fs.readFileSync(new URL('../src/owner-lite-runtime.js',import.meta.url),'utf8');

test('owner uploader can create a new comic without editing the static catalog',()=>{
  assert.match(html,/＋ KOMIK BARU/);
  assert.match(html,/JUDUL KOMIK BARU/);
  assert.match(html,/slugify/);
  assert.match(html,/\/api\/assets\/series-meta/);
  assert.match(html,/CATALOG_VERIFY_FAILED/);
  assert.match(html,/READER_VERIFY_FAILED/);
});

test('owner runtime persists dynamic series metadata in R2 and merges it into catalog',()=>{
  assert.match(runtime,/SERIES_META_KEY/);
  assert.match(runtime,/comics\/\$\{id\}\/series\.json/);
  assert.match(runtime,/OWNER_SERIES_META/);
  assert.match(runtime,/seriesMeta=new Map/);
  assert.match(runtime,/for\(const \[id,meta\] of \(inv\.seriesMeta/);
  assert.match(runtime,/OWNER_UPLOAD_READY/);
});

test('new comic is only considered published after pages, catalog and reader verify',()=>{
  const pageUpload=html.indexOf("await uploadFile(file");
  const seriesMeta=html.indexOf("await saveSeriesMeta");
  const catalogVerify=html.indexOf("CATALOG_VERIFY_FAILED");
  const readerVerify=html.indexOf("READER_VERIFY_FAILED");
  assert.ok(pageUpload>=0);
  assert.ok(seriesMeta>pageUpload);
  assert.ok(catalogVerify>seriesMeta);
  assert.ok(readerVerify>catalogVerify);
});
