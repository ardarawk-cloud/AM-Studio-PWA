import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const catalog=JSON.parse(fs.readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
const hotfix=fs.readFileSync(new URL('../public/reader-hotfix.js',import.meta.url),'utf8');

test('HPG public cover metadata uses the live R2 media route',()=>{
  const hpg=catalog.series.find(x=>x.id==='hikayat-pohon-ganja');
  assert.ok(hpg);
  assert.equal(hpg.cover?.publicReaderAsset,'/media/comics/hikayat-pohon-ganja/cover.jpg');
  assert.doesNotMatch(hpg.cover?.publicReaderAsset||'',/^\/comics\//);
});

test('reader card covers use one standard R2 media path with no stale HPG static special case',()=>{
  assert.match(hotfix,/`\/media\/comics\/\$\{id\}\/cover\.jpg`/);
  assert.doesNotMatch(hotfix,/id==='hikayat-pohon-ganja'/);
  assert.doesNotMatch(hotfix,/\/comics\/hikayat-pohon-ganja\/cover\.jpg\?v=/);
});
