export const PRIVATE_RELEASE_STATES=new Set(['PRIVATE_STAGING','PRIVATE_REVIEW','PRIVATE_HOLD']);

export function isPrivateMeta(meta={}){
  return PRIVATE_RELEASE_STATES.has(String(meta?.releaseState||''));
}

export function isPublicMeta(meta={}){
  const state=String(meta?.releaseState||'');
  return !state||state==='PUBLISHED';
}

export function evaluatePrivateProductionContext(context={}){
  const errors=[];
  const passport=context.passport||{};
  const manifest=context.contextManifest||{};
  const lock=context.bootMemory?.CANON_LOCK||{};
  const state=context.currentState||{};
  if(passport.production?.generationAllowed===false)errors.push('PASSPORT_GENERATION_BLOCKED');
  if(manifest.generationAllowed===false)errors.push('CONTEXT_GENERATION_BLOCKED');
  if(lock.generationAllowed===false)errors.push('CANON_LOCK_GENERATION_BLOCKED');
  if(String(passport.identity?.status||'').includes('CANON_RECOVERY_HOLD'))errors.push('CANON_RECOVERY_HOLD');
  if(!state.nextProductionTarget&&!state.currentEpisode)errors.push('NO_PRODUCTION_TARGET');
  if(Array.isArray(context.crossDivisionConflicts)&&context.crossDivisionConflicts.length)errors.push('CROSS_DIVISION_CANON_COLLISION');
  return {ok:errors.length===0,errors};
}

export function episodePlanFromContext(context={}){
  const plan=context.bootMemory?.EPISODE_001_CANON_PLAN||null;
  if(!plan||!Array.isArray(plan.pagePlan)||!plan.pagePlan.length)return null;
  return plan;
}

export function producedPageNumbers(objects=[],seriesId,episode,root='comics'){
  const normalizedRoot=String(root||'comics').replace(/\/+$/,'');
  const prefix=`${normalizedRoot}/${seriesId}/ep${String(episode).padStart(3,'0')}/`;
  return [...new Set(objects.map(o=>String(o?.key||'')).filter(k=>k.startsWith(prefix)).map(k=>Number((k.match(/page-(\d{2,3})\.(?:png|jpg|jpeg|webp|avif)$/i)||[])[1])).filter(Number.isInteger))].sort((a,b)=>a-b);
}

export function nextMissingPage(totalPages,produced=[]){
  const set=new Set(produced.map(Number));
  for(let i=1;i<=Number(totalPages||0);i++)if(!set.has(i))return i;
  return null;
}

export function buildBlackjackPagePrompt({context,pageNumber}={}){
  const plan=episodePlanFromContext(context);
  const page=plan?.pagePlan?.find(x=>Number(x.page)===Number(pageNumber));
  if(!plan||!page)throw new Error('EPISODE_PAGE_PLAN_NOT_FOUND');
  const page1=Number(pageNumber)===1;
  return [
    'Create one finished vertical comic page for AM STUDIO.',
    'Series: The Legendary Decks — Blackjack.',
    `Chapter: ${plan.chapter}. Episode ${plan.episodeNumber}: ${plan.episodeTitle}. Page ${pageNumber}.`,
    'Art direction: premium American comic, epic fantasy + steampunk gothic, cinematic natural dramatic lighting, richly detailed living backgrounds, elegant gentleman-casino atmosphere, sharp expressive faces, professional panel composition, effects last. No anime or manga look.',
    'Canvas: vertical 1024x1536. Use 3–5 panels. Indonesian dialogue/captions only. Keep text concise and readable. Small AM STUDIO mark bottom-right.',
    `Story beat: ${page.beat}`,
    `Location/time continuity: ${plan.setting}; ${plan.time}.`,
    'Adrian Lucien Vale: young adult aristocratic strategist, handsome sharp features, dark hair, elegant dark formal/battle-ready attire, Royal Cane allowed when story-appropriate. He is defined by responsibility and deliberate choice, never luck or probability manipulation.',
    'Blackjack visual language later may include top hat, Black Deck and Royal Cane, but reveal only what this page has earned chronologically.',
    page1?'HARD PAGE 1 LOCK: Adrian is NOT publicly Blackjack yet. The Black Deck is NOT awakened. No supernatural Black Deck energy. The Dealer does NOT appear. The House attack has NOT started yet.':'Continue directly from prior pages; never reset the scene or repeat earlier beats.',
    'Never import Arthur Kingsley, Royal Deck, Probability Engine, Deck Dimension, probability manipulation, Royal Vision, Deck Armor, or Royal Gambler legacy mechanics.',
    'No random explosions, no glitter, no excessive particles, no empty generic backgrounds. Story first, canon, continuity, character, visual, effects last.',
    'Return only the comic artwork as a single page image.'
  ].join('\n');
}

export function buildPrivateEpisodeMeta({context,existing={},produced=[],pageQc={}}={}){
  const plan=episodePlanFromContext(context);
  if(!plan)throw new Error('EPISODE_CANON_PLAN_MISSING');
  const total=plan.pagePlan.length;
  const complete=produced.length>=total&&Array.from({length:total},(_,i)=>i+1).every(n=>produced.includes(n));
  const allQc=complete&&Array.from({length:total},(_,i)=>String(pageQc?.[String(i+1)]||'')==='PASS').every(Boolean);
  return {
    ...existing,
    seriesId:context.passport.seriesId,
    divisionId:context.passport.divisionId,
    episode:Number(plan.episodeNumber),
    title:plan.episodeTitle,
    pageCount:total,
    ownerApproved:false,
    releaseState:allQc?'PRIVATE_REVIEW':'PRIVATE_STAGING',
    productionState:allQc?'EPISODE_PRIVATE_REVIEW_READY':complete?'OWNER_PAGE_QC_REQUIRED':'AUTO_PRODUCTION_IN_PROGRESS',
    generatedPages:[...new Set(produced)].sort((a,b)=>a-b),
    pageQc,
    publicVisible:false,
    monetization:'OFF',
    updatedAt:new Date().toISOString()
  };
}

export function evaluatePublicRelease({canonLock={},meta={}}={}){
  const errors=[];
  if(canonLock.releaseAllowed!==true)errors.push('CANON_RELEASE_GATE_CLOSED');
  if(meta.releaseState!=='PRIVATE_REVIEW')errors.push('PRIVATE_REVIEW_NOT_COMPLETE');
  if(meta.ownerApproved!==true)errors.push('OWNER_RELEASE_APPROVAL_REQUIRED');
  if(!Number.isInteger(Number(meta.pageCount))||Number(meta.pageCount)<1)errors.push('INVALID_PAGE_COUNT');
  return {ok:errors.length===0,errors};
}
