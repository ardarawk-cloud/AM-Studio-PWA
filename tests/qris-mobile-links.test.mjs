import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memberDocument,readerClient} from '../src/membership-ui.js';

const ui=readFileSync(new URL('../src/membership-ui.js',import.meta.url),'utf8');
const routes=readFileSync(new URL('../src/membership-runtime.js',import.meta.url),'utf8');
test('QRIS download and open image links interpolate real invoice id, never literal placeholder',()=>{
  const start=ui.indexOf('Simpan QRIS ke HP (PNG)');
  assert.ok(start>0,'expected save link');
  const section=ui.slice(start-250,start+350);
  assert.match(section,/href="\/api\/billing\/invoices\/'\+i\.id\+'\/qr\.png" download=/);
  assert.match(section,/href="\/api\/billing\/invoices\/'\+i\.id\+'\/qr\.png\?view=1"/);
  assert.doesNotMatch(section,/href="\/api\/billing\/invoices\/\$\{i\.id\}/);
  assert.match(routes,/status\|qr\|qr\\\.png/);
});
test('Payment status page still contains executable client and QRIS upload flow',async()=>{
  const page=memberDocument('/payment-status');
  assert.ok((await page.text()).includes('membership-reader.js'));
  assert.match(readerClient,/Simpan QRIS ke HP \(PNG\)/);
  assert.match(readerClient,/Konfirmasi pembayaran/);
});
