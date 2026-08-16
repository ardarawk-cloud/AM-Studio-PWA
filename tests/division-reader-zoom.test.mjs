import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const zoom=fs.readFileSync(new URL('../public/reader-zoom.js',import.meta.url),'utf8');
const firewall=fs.readFileSync(new URL('../src/play-firewall-runtime.js',import.meta.url),'utf8');

test('Play HTML injects the dedicated accessible comic Zoom Reader',()=>{
  assert.match(firewall,/am-reader-zoom-server/);
  assert.match(firewall,/\/reader-zoom\.js\?v=1/);
  assert.match(firewall,/x-am-reader-zoom/);
});

test('Zoom Reader supports magnification up to 5x with pinch and pan',()=>{
  assert.match(zoom,/MAX_SCALE=5/);
  assert.match(zoom,/pointerdown/);
  assert.match(zoom,/pointermove/);
  assert.match(zoom,/type:'pinch'/);
  assert.match(zoom,/type:'pan'/);
  assert.match(zoom,/touch-action:none/);
});

test('Zoom Reader has accessible controls and keyboard entry',()=>{
  for(const id of ['am-reader-zoom-out','am-reader-zoom-reset','am-reader-zoom-in','am-reader-zoom-close']){
    assert.match(zoom,new RegExp(id));
  }
  assert.match(zoom,/aria-modal/);
  assert.match(zoom,/aria-live/);
  assert.match(zoom,/tabindex/);
  assert.match(zoom,/event\.key==='Enter'/);
  assert.match(zoom,/event\.key==='Escape'/);
});

test('Zoom Reader only activates inside the public Play reader',()=>{
  assert.match(zoom,/dataset\.amDistribution==='play'/);
  assert.match(zoom,/get\('channel'\)==='play'/);
  assert.match(zoom,/if\(!isPlay\(\)\)return/);
});
