import type{OutlineVariant}from"@/domain/story-planning";import{createEmptyVariant}from"@/domain/story-planning";
export function cloneVariant(v:OutlineVariant,name=`${v.name} 副本`,source:OutlineVariant["creationSource"]="user"):OutlineVariant{const now=new Date().toISOString();return{...structuredClone(v),id:createEmptyVariant().id,name,parentVariantId:v.id,creationSource:source,adopted:false,status:"draft",createdAt:now,modifiedAt:now}}
export function compareVariants(a:OutlineVariant,b:OutlineVariant){const amap=new Map(a.outline.beats.map(x=>[x.id,x]));const bmap=new Map(b.outline.beats.map(x=>[x.id,x]));return{storyBibleChanges:Object.keys(a.storyBible).filter(k=>JSON.stringify((a.storyBible as any)[k])!==JSON.stringify((b.storyBible as any)[k])),characterArcChanges:b.characterArcs.filter(x=>!a.characterArcs.some(y=>y.characterPlanId===x.characterPlanId&&JSON.stringify(y)===JSON.stringify(x))).map(x=>x.characterPlanId),addedBeats:b.outline.beats.filter(x=>!amap.has(x.id)).map(x=>x.title),removedBeats:a.outline.beats.filter(x=>!bmap.has(x.id)).map(x=>x.title),changedBeats:b.outline.beats.filter(x=>amap.has(x.id)&&JSON.stringify(amap.get(x.id))!==JSON.stringify(x)).map(x=>x.title),endingChanged:a.storyBible.endingDirection!==b.storyBible.endingDirection,newSettings:b.outline.beats.filter(x=>x.newSettingMarked&&!a.outline.beats.some(y=>y.id===x.id&&y.newSettingMarked)).map(x=>x.title),conflictRisks:b.issues.filter(x=>["critical","major"].includes(x.severity)).map(x=>x.rationale),extraSetup:b.outline.beats.flatMap(x=>x.prerequisites).filter(x=>!a.outline.beats.flatMap(y=>y.prerequisites).includes(x)),revisionCost:Math.min(100,Math.abs(a.outline.beats.length-b.outline.beats.length)*10+b.outline.beats.filter(x=>!amap.has(x.id)).length*5)} }
export function mergeGeneratedVariant(existing:OutlineVariant,generated:OutlineVariant,modules:string[]){
  const next=structuredClone(existing) as any;
  for(const m of modules) next[m]=structuredClone((generated as any)[m]);

  // Field-level locks are authoritative even when a provider returns a complete object.
  for(const f of existing.storyBible.lockedFields) (next.storyBible as any)[f]=(existing.storyBible as any)[f];
  next.storyBible.constraints=preserveLocked(existing.storyBible.constraints,next.storyBible.constraints);

  // A generated partial outline must never make a locked beat disappear. Matching IDs also
  // protects a locked beat when the provider echoed it with changed text.
  next.outline.beats=preserveLockedBeats(existing.outline.beats,next.outline.beats);
  next.outline.sections=preserveLocked(existing.outline.sections,next.outline.sections);
  next.characterPlans=preserveLocked(existing.characterPlans,next.characterPlans);
  next.characterArcs=preserveLocked(existing.characterArcs,next.characterArcs);
  next.relationshipArcs=preserveLocked(existing.relationshipArcs,next.relationshipArcs);
  next.timeline.events=preserveLocked(existing.timeline.events,next.timeline.events);

  next.id=generated.id; next.parentVariantId=existing.id; next.modifiedAt=new Date().toISOString();
  return next as OutlineVariant;
}

function preserveLocked<T extends {id:string;locked?:boolean;status?:string}>(existing:T[],generated:T[]):T[]{
  const result=[...generated];
  for(const item of existing){
    if(item.locked||item.status==="locked"){
      const index=result.findIndex(candidate=>candidate.id===item.id);
      if(index>=0) result[index]=structuredClone(item); else result.push(structuredClone(item));
    }
  }
  return result;
}

function preserveLockedBeats(existing:OutlineVariant["outline"]["beats"],generated:OutlineVariant["outline"]["beats"]){
  return preserveLocked(existing,generated);
}
