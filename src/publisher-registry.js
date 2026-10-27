import registry from '../public/publisher-registry.json' with {type:'json'};
import {MemberError} from './membership-auth.js';

export function publisherRegistry(){return structuredClone(registry)}
export function publishingProfile(comic,channel){
  const profile=registry.profiles.find(p=>p.comic_id===comic||p.aliases.includes(comic));
  if(!profile)throw new MemberError('PUBLISHER_COMIC_NOT_REGISTERED',404);
  if(channel&&profile.channel_id!==channel)throw new MemberError('PUBLISHER_CHANNEL_MISMATCH',409);
  return profile;
}
export function mergeRegisteredCatalog(catalog){
  const out=structuredClone(catalog),known=new Set((out.series||[]).map(s=>s.id));
  out.series??=[];
  for(const p of registry.profiles){
    if(known.has(p.comic_id))continue;
    out.series.push({id:p.comic_id,title:p.title,code:p.profile_code||p.comic_id.toUpperCase(),genre:p.genre,tag:'AM STUDIO Comics',desc:'Episode sedang disiapkan.',episodes:0,verifiedEpisodes:[],episodeCountVerified:true,freeEpisodes:0,status:'COMING_SOON',publicReaderState:'COMING_SOON',qc:'PUBLIC_LISTING_ONLY',cover:{required:true,status:'AWAITING_APPROVED_ASSET'}});
  }
  out.excludedProjects=(out.excludedProjects||[]).filter(p=>!registry.profiles.some(r=>r.comic_id===p.id));
  out.studio={...(out.studio||{}),registeredPublishingProfiles:registry.profiles.length};
  return out;
}
export function publisherPassport(comic){
  const profile=publishingProfile(comic);
  return {version:'1.0',...structuredClone(profile),website:registry.website,membership_scope:registry.catalog_scope,preview_policy_url:'/api/membership',workflow:['LOAD_THIS_CHANNEL_PASSPORT','CHECK_CURRENT_CANON','OWNER_APPROVAL_AND_QC','STAGE_ORIGINAL_BYTES','PRIVATE_APPROVED_MANIFEST','PROCESS','VERIFY_RECEIPT_AND_PUBLIC_URL'],cross_channel_substitution:false,canon_status:profile.canon_context?'LOAD_EXISTING_DIVISION_CONTEXT':'LOAD_APPROVED_PRODUCTION_CONVERSATION'};
}
