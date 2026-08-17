import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const zoom=fs.readFileSync(new URL('../public/reader-zoom.js',import.meta.url),'utf8');
const firewall=fs.readFileSync(new URL('../src/play-firewall-runtime.js',import.meta.url),'utf8');

test('Play HTML injects the dedicated continuous comic Zoom Reader',()=>{
  assert.match(firewall,/am-reader-zoom-server/);
  assert.match(firewall,/\/reader-zoom\.js\?v=1/);
  assert.match(firewall,/x-am-reader-zoom/);
});

test('Zoom Reader supports continuous magnification up to 5x on mobile',()=>{
  assert.match(zoom,/MAX_SCALE=5/);
  assert.match(zoom,/MIN_SCALE=1/);
  assert.match(zoom,/touchstart/);
  assert.match(zoom,/touchmove/);
  assert.match(zoom,/touchend/);
  assert.match(zoom,/event\.touches\.length!==2/);
  assert.match(zoom,/touch-action:pan-x pan-y/);
  assert.match(zoom,/user-scalable=yes/);
});

test('Zoom Reader exposes continuous reset, hint and page accessibility labels',()=>{
  assert.match(zoom,/am-reader-continuous-reset/);
  assert.match(zoom,/am-reader-continuous-zoom-level/);
  assert.match(zoom,/am-reader-zoom-entry-hint/);
  assert.match(zoom,/aria-label/);
  assert.match(zoom,/PAGE \$\{pad\(index\+1\)\}/);
});

test('Zoom Reader is injected only through the Play firewall path',()=>{
  assert.match(firewall,/function isPlayRequest\(request\)/);
  assert.match(firewall,/if\(!isPlayRequest\(request\)\)return response/);
  assert.match(firewall,/return playHtml\(response\)/);
  assert.match(firewall,/am-reader-zoom-server/);
});
