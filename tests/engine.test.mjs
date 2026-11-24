import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateEpisode,newGame,availableChoices,choose} from '../src/engine.mjs';
const ep=JSON.parse(readFileSync(new URL('../episodes/01/opening.json',import.meta.url),'utf8'));
test('opening contract valid',()=>assert.equal(validateEpisode(ep),true));
test('evidence route ends at archive; state immutable',()=>{
 const initial=newGame(ep); const before=structuredClone(initial);
 const inspected=choose(ep,initial,'inspect'); const end=choose(ep,inspected,'save');
 assert.deepEqual(initial,before); assert.deepEqual(end.evidence,['death_notice']); assert.equal(end.sceneId,'archive'); assert.equal(availableChoices(ep,end).length,0);
});
test('witness route leads to different endpoint',()=>{
 const end=choose(ep,choose(ep,newGame(ep),'call'),'meet');
 assert.equal(end.sceneId,'meeting'); assert.equal(end.trust,2); assert.equal(end.history.length,2);
});
test('unknown and locked choices rejected without mutation',()=>{
 const s=choose(ep,newGame(ep),'inspect'); const noEvidence={...s,evidence:[]};
 const before=structuredClone(noEvidence); assert.throws(()=>choose(ep,noEvidence,'save')); assert.throws(()=>choose(ep,noEvidence,'fake')); assert.deepEqual(noEvidence,before);
});
test('dangling target rejected',()=>{const copy=structuredClone(ep);copy.scenes[0].choices[0].target='missing';assert.throws(()=>validateEpisode(copy));});
test('invalid effect rejected',()=>{const copy=structuredClone(ep);copy.scenes[0].choices[0].effects.trustDelta=100;assert.throws(()=>validateEpisode(copy));});
test('version mismatch rejected',()=>assert.throws(()=>availableChoices(ep,{...newGame(ep),version:2})));
test('every fixture path terminates without deadlock',()=>{
 const endpoints=new Set(); const visit=(state,depth)=>{assert.ok(depth<10);const choices=availableChoices(ep,state);if(!choices.length){assert.equal(ep.scenes.find(s=>s.id===state.sceneId).choices.length,0);endpoints.add(state.sceneId);return;}for(const c of choices)visit(choose(ep,state,c.id),depth+1);};visit(newGame(ep),0);assert.deepEqual([...endpoints].sort(),['archive','meeting']);
});
