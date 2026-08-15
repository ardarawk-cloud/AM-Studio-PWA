import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const nativeReader=fs.readFileSync(new URL('../public/native-reader.js',import.meta.url),'utf8');
const releaseGate=JSON.parse(fs.readFileSync(new URL('../public/play-release.json',import.meta.url),'utf8'));
const readerRegistry=JSON.parse(fs.readFileSync(new URL('../public/reader-assets.json',import.meta.url),'utf8'));
const catalog=JSON.parse(fs.readFileSync(new URL('../public/catalog.json',import.meta.url),'utf8'));
const assetUpload=fs.readFileSync(new URL('../public/asset-upload.js',import.meta.url),'utf8');

function completeReaderAsset(asset){
  if(!asset||asset.canonState!=='CANON_FINAL'||asset.qc!=='QC_PASS')return false;
  if(asset.replacementPending===true)return false;
  if(String(asset.readerState||'').includes('PARTIAL'))return false;
  const readerAsset=typeof asset.readerAsset==='string'&&asset.readerAsset.trim().length>0;
  const pages=Array.isArray(asset.pages)?asset.pages.filter(Boolean):[];
  const total=Number(asset.pageCount||0);
  const available=Number(asset.availablePageCount||pages.length||0);
  const missing=Array.isArray(asset.missingReaderPages)?asset.missingReaderPages.filter(Boolean):[];
  return readerAsset||(total>0&&pages.length>=total&&available>=total&&missing.length===0);
}

test('Google Play release gate stays owner-controlled and completeness-locked',()=>{
  assert.equal(releaseGate.applicationId,'com.ardacore.amstudio');
  assert.equal(releaseGate.mode,'PUBLIC_READER_ONLY');
  assert.equal(releaseGate.playReady,false);
  assert.equal(releaseGate.ownerReleaseApproval,false);
  assert.equal(releaseGate.requirements.completeReaderAssetsRequired,true);
  assert.equal(releaseGate.requirements.partialAssetRecoveryBlocked,true);
  assert.equal(releaseGate.requirements.missingReaderPagesBlocked,true);
});

test('Play reader guard targets the actual current UI selectors',()=>{
  assert.match(nativeReader,/\.card\[data-series\]/);
  assert.match(nativeReader,/\.episode\[data-episode\]/);
  assert.match(nativeReader,/missingReaderPages/);
  assert.match(nativeReader,/availablePageCount/);
  assert.match(nativeReader,/CANON_FINAL/);
  assert.match(nativeReader,/QC_PASS/);
  assert.match(nativeReader,/PARTIAL/);
  assert.doesNotMatch(nativeReader,/querySelectorAll\('\.ep'\)/);
});

test('partial or missing-page reader assets can never qualify for Play publication',()=>{
  for(const asset of readerRegistry.episodes||[]){
    const missing=Array.isArray(asset.missingReaderPages)?asset.missingReaderPages:[];
    if(missing.length>0||String(asset.readerState||'').includes('PARTIAL')){
      assert.equal(completeReaderAsset(asset),false,`${asset.seriesId} episode ${asset.episode} must remain blocked`);
    }
  }
});

test('AMU Episode 001 is synchronized as a complete 22-page Play Reader asset',()=>{
  const asset=(readerRegistry.episodes||[]).find(x=>x.seriesId==='amu'&&Number(x.episode)===1);
  assert.ok(asset,'AMU Episode 001 registry entry is required');
  assert.equal(asset.pageCount,22);
  assert.equal(asset.availablePageCount,22);
  assert.equal(asset.pages.length,22);
  assert.deepEqual(asset.missingReaderPages,[]);
  assert.equal(asset.readerState,'COMPLETE');
  assert.equal(asset.pages[0],'/media/comics/amu/ep001/page-01.jpg');
  assert.equal(asset.pages[21],'/media/comics/amu/ep001/page-22.jpg');
  assert.equal(completeReaderAsset(asset),true);
});

test('AMU catalog and owner upload tooling agree on the 22-page final state',()=>{
  const amu=(catalog.series||[]).find(x=>x.id==='amu');
  assert.ok(amu,'AMU catalog entry is required');
  assert.equal(amu.currentEpisode?.number,1);
  assert.equal(amu.currentEpisode?.publishedPages,22);
  assert.equal(amu.currentEpisode?.status,'COMPLETE');
  assert.equal(Object.hasOwn(amu.currentEpisode||{},'nextPage'),false);
  assert.match(assetUpload,/const EXPECTED_PAGES=22;/);
  assert.doesNotMatch(assetUpload,/Page 1–16/);
});
