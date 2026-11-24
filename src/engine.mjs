// Minimal deterministic reference implementation. No provider has state authority.
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const isId = v => typeof v === 'string' && /^[a-z][a-z0-9_-]*$/.test(v);
const isText = v => typeof v === 'string' && v.length > 0;
const shape = (x, keys) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length === keys.length && keys.every(k => Object.hasOwn(x,k));
const idSet = (xs, label) => {
  assert(Array.isArray(xs), `Invalid ${label}`);
  const ids = new Set();
  for (const x of xs) { assert(isId(x?.id) && !ids.has(x.id), `Invalid or duplicate ${label} ID`); ids.add(x.id); }
  return ids;
};
export function validateEpisode(ep) {
  assert(shape(ep,['id','version','startScene','evidence','scenes']) && isId(ep.id) && Number.isInteger(ep.version) && ep.version > 0, 'Invalid episode');
  const facts = idSet(ep.evidence,'evidence');
  const scenes = idSet(ep.scenes,'scene');
  assert(scenes.has(ep.startScene),'Unknown start scene');
  for (const f of ep.evidence) assert(shape(f,['id','label']) && isText(f.label),'Invalid evidence');
  for (const s of ep.scenes) {
    assert(shape(s,['id','text','choices']) && isText(s.text),'Invalid scene');
    idSet(s.choices,'choice');
    for (const c of s.choices) {
      assert(shape(c,['id','label','target','requiresEvidence','effects']) && isText(c.label) && scenes.has(c.target),'Invalid choice target or shape');
      assert(shape(c.effects,['evidence','trustDelta']) && Number.isInteger(c.effects.trustDelta) && Math.abs(c.effects.trustDelta)<=5,'Invalid effects');
      for (const ids of [c.requiresEvidence,c.effects.evidence]) assert(Array.isArray(ids) && ids.every(id=>facts.has(id)), 'Unknown evidence');
    }
  }
  const byId = new Map(ep.scenes.map(s=>[s.id,s]));
  const reached = new Set();
  function visit(id) { if(reached.has(id)) return; reached.add(id); for(const c of byId.get(id).choices) visit(c.target); }
  visit(ep.startScene);
  assert(reached.size===scenes.size,'Unreachable scene (structural)');
  const canEnd = new Set(ep.scenes.filter(s=>s.choices.length===0).map(s=>s.id));
  let changed = true;
  while(changed) { changed=false; for(const s of ep.scenes) if(!canEnd.has(s.id) && s.choices.some(c=>canEnd.has(c.target))) { canEnd.add(s.id); changed=true; } }
  assert(canEnd.size===scenes.size,'Scene has no structural path to ending');
  return true;
}
export function newGame(ep) {
  validateEpisode(ep);
  return {episodeId:ep.id,version:ep.version,sceneId:ep.startScene,evidence:[],trust:0,history:[]};
}
export function availableChoices(ep,state) {
  assert(state.episodeId===ep.id && state.version===ep.version,'Episode/version mismatch');
  const scene=ep.scenes.find(s=>s.id===state.sceneId);
  assert(scene,'Unknown current scene');
  return scene.choices.filter(c=>c.requiresEvidence.every(id=>state.evidence.includes(id)));
}
export function choose(ep,state,choiceId) {
  const c=availableChoices(ep,state).find(c=>c.id===choiceId);
  assert(c,'Unknown or unavailable choice');
  return {...state,sceneId:c.target,evidence:[...new Set([...state.evidence,...c.effects.evidence])],trust:Math.max(-5,Math.min(5,state.trust+c.effects.trustDelta)),history:[...state.history,{sceneId:state.sceneId,choiceId:c.id}]};
}
