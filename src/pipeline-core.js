export const PIPELINE_STATES=['DRAFT','ASSET_WAIT','QC_WAIT','QC_PASS','OWNER_APPROVED','SCHEDULED','PUBLISHED','HOLD'];

export function normalizeEpisode(input={}){
  const seriesId=String(input.seriesId||'').trim().toLowerCase();
  const episode=Number(input.episode);
  const pageCount=Number(input.pageCount||0);
  const pages=[...(input.pages||[])].map(Number).filter(Number.isInteger).sort((a,b)=>a-b);
  return {seriesId,episode,pageCount,pages,hasCover:Boolean(input.hasCover),meta:input.meta||{}};
}

export function validateEpisode(input={}){
  const x=normalizeEpisode(input),issues=[];
  if(!/^[a-z0-9-]+$/.test(x.seriesId))issues.push('INVALID_SERIES_ID');
  if(!Number.isInteger(x.episode)||x.episode<1||x.episode>999)issues.push('INVALID_EPISODE_NUMBER');
  if(!Number.isInteger(x.pageCount)||x.pageCount<1||x.pageCount>999)issues.push('PAGE_COUNT_REQUIRED');
  if(!x.hasCover)issues.push('COVER_REQUIRED');
  const set=new Set(x.pages),duplicates=x.pages.filter((n,i,a)=>i>0&&n===a[i-1]);
  if(duplicates.length)issues.push('DUPLICATE_PAGE_NUMBER');
  const missing=[];
  if(x.pageCount>0)for(let i=1;i<=x.pageCount;i++)if(!set.has(i))missing.push(i);
  if(missing.length)issues.push('MISSING_PAGES');
  const outOfRange=x.pageCount>0?x.pages.filter(n=>n<1||n>x.pageCount):[];
  if(outOfRange.length)issues.push('PAGE_NUMBER_OUT_OF_RANGE');
  return {ok:issues.length===0,issues,missingPages:missing,outOfRangePages:outOfRange,pageCount:x.pageCount,availablePageCount:set.size};
}

export function derivePipelineState(input={}){
  const meta=input.meta||{};
  if(meta.releaseState==='HOLD')return 'HOLD';
  if(meta.releaseState==='PUBLISHED')return 'PUBLISHED';
  const qc=validateEpisode(input);
  if(!qc.ok)return 'ASSET_WAIT';
  if(meta.technicalQc!=='QC_PASS')return 'QC_WAIT';
  if(!meta.ownerApproved)return 'QC_PASS';
  if(meta.releaseState==='SCHEDULED')return 'SCHEDULED';
  return 'OWNER_APPROVED';
}

export function nextReleaseAt(nowMs=Date.now(),releaseHour=19,utcOffsetMinutes=480){
  const localMs=nowMs+utcOffsetMinutes*60_000;
  const local=new Date(localMs);
  const slotLocal=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),releaseHour,0,0,0);
  const chosen=localMs<=slotLocal?slotLocal:slotLocal+86_400_000;
  return new Date(chosen-utcOffsetMinutes*60_000).toISOString();
}

export function isReaderPublished(meta={}){
  if(!meta||Object.keys(meta).length===0)return true;
  if(!meta.releaseState)return true;
  return meta.releaseState==='PUBLISHED';
}
