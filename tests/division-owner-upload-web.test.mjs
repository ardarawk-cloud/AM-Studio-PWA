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
