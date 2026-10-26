import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';

test('compiled browser script initializes pricing with bundler name helpers and no login session',async()=>{
  const result=await build({entryPoints:[new URL('../src/membership-ui.js',import.meta.url).pathname],bundle:true,platform:'node',format:'esm',keepNames:true,write:false});
  const compiled=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const html=await compiled.memberDocument('/membership').text(),script=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];
  let rendered='',resolveRendered;const ready=new Promise(r=>{resolveRendered=r});
  const content={set innerHTML(value){rendered=value;resolveRendered()},get innerHTML(){return rendered}},message={textContent:'',className:''};
  const document={getElementById:id=>id==='content'?content:message};
  const fetch=async url=>url==='/api/member/me'?Response.json({error:'LOGIN_REQUIRED'},{status:401}):Response.json({plan:{name:'AM STUDIO Comics Member'},prices:[{id:'monthly',amount_idr:9900,period_months:1},{id:'yearly',amount_idr:99000,period_months:12}],checkout_available:false});
  vm.runInNewContext(script,{document,location:{pathname:'/membership',search:''},fetch,Intl,URLSearchParams,console},{timeout:1000});
  await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Pricing script did not render')),1000))]);
  assert.match(rendered,/9\.900/);assert.match(rendered,/99\.000/);assert.match(rendered,/bonus 2 bulan/);assert.equal(message.textContent,'');
  assert.match(compiled.readerClient,/const __name=/,'the reader integration needs the same isolated helper');
});
