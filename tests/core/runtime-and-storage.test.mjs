import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSliceEpisode,
  createInitialState,
  evaluateChoices,
  applyChoice,
  restartEpisode
} from '../../src/core/runtime.mjs';
import {
  createMemoryStorage,
  saveState,
  loadState,
  resetSave,
  DEFAULT_SAVE_KEY
} from '../../src/storage/save-store.mjs';

const sampleEpisode = {
  id: 'ep01-test',
  version: 1,
  title: 'Test Slice',
  startScene: 'start',
  evidence: [
    {
      id: 'clue_a',
      label: 'Clue A',
      summary: 'A verified timestamp mismatch.',
      source: 'Terminal log',
      reliability: 'verified'
    }
  ],
  scenes: [
    {
      id: 'start',
      title: 'Start',
      location: 'Apartment',
      timecode: '2042-11-25 06:40',
      mood: 'unease',
      media: { type: 'placeholder', src: null, poster: null, caption: 'Dawn apartment', palette: 'cold-slate' },
      beats: [{ id: 'b1', speaker: 'System', text: 'Identity status: deceased.', durationMs: 2500 }],
      choices: [
        {
          id: 'inspect',
          label: 'Inspect log',
          target: 'branch',
          requiresEvidence: [],
          effects: { evidence: ['clue_a'], trustDelta: 1, flags: ['checked_log'] }
        },
        {
          id: 'skip',
          label: 'Ignore log',
          target: 'branch',
          requiresEvidence: [],
          effects: { evidence: [], trustDelta: -1, flags: [] }
        }
      ]
    },
    {
      id: 'branch',
      title: 'Decision',
      location: 'Apartment',
      timecode: '2042-11-25 06:45',
      mood: 'investigation',
      media: { type: 'placeholder', src: null, poster: null, caption: 'Phone call', palette: 'amber-dusk' },
      beats: [{ id: 'b1', speaker: 'Lin', text: 'Are you still at home?', durationMs: 2500 }],
      choices: [
        {
          id: 'use_clue',
          label: 'Show clue',
          target: 'end_a',
          requiresEvidence: ['clue_a'],
          requiresMinTrust: 1,
          effects: { evidence: [], trustDelta: 1, flags: [] }
        },
        {
          id: 'leave',
          label: 'End call',
          target: 'end_b',
          requiresEvidence: [],
          effects: { evidence: [], trustDelta: 0, flags: [] }
        }
      ]
    },
    {
      id: 'end_a',
      title: 'Ending A',
      location: 'Apartment',
      timecode: '2042-11-25 06:50',
      mood: 'revelation',
      media: { type: 'placeholder', src: null, poster: null, caption: 'Ending A', palette: 'cyan-night' },
      beats: [{ id: 'b1', speaker: 'Narrator', text: 'You preserved the record.', durationMs: 2500 }],
      ending: { id: 'preserved', title: 'Preserved', summary: 'Record kept.' },
      choices: []
    },
    {
      id: 'end_b',
      title: 'Ending B',
      location: 'Corridor',
      timecode: '2042-11-25 06:50',
      mood: 'aftermath',
      media: { type: 'placeholder', src: null, poster: null, caption: 'Ending B', palette: 'crimson-shadow' },
      beats: [{ id: 'b1', speaker: 'Narrator', text: 'You stepped outside.', durationMs: 2500 }],
      ending: { id: 'departed', title: 'Departed', summary: 'Left apartment.' },
      choices: []
    }
  ]
};

test('CORE-101: validates slice episode and enforces immutable deterministic transitions', () => {
  assert.equal(validateSliceEpisode(sampleEpisode), true);
  const s0 = createInitialState(sampleEpisode);
  const snap = structuredClone(s0);

  const s1 = applyChoice(sampleEpisode, s0, 'inspect');
  assert.deepEqual(s0, snap, 'Initial state must remain immutable');
  assert.deepEqual(s1.evidence, ['clue_a']);
  assert.equal(s1.trust, 1);
  assert.deepEqual(s1.flags, ['checked_log']);

  const eval1 = evaluateChoices(sampleEpisode, s1);
  assert.equal(eval1.available.length, 2);
  assert.equal(eval1.locked.length, 0);

  const sEnd = applyChoice(sampleEpisode, s1, 'use_clue');
  assert.equal(sEnd.sceneId, 'end_a');
  assert.deepEqual(sEnd.completedEndings, ['preserved']);
});

test('CORE-101: guards locked choices by evidence and trust without mutating state', () => {
  const s0 = createInitialState(sampleEpisode);
  const sSkip = applyChoice(sampleEpisode, s0, 'skip');
  const { available, locked } = evaluateChoices(sampleEpisode, sSkip);
  assert.deepEqual(available.map((c) => c.id), ['leave']);
  assert.equal(locked.length, 1);
  assert.deepEqual(locked[0].missingEvidence, ['clue_a']);
  assert.equal(locked[0].trustBlocked, true);

  const before = structuredClone(sSkip);
  assert.throws(() => applyChoice(sampleEpisode, sSkip, 'use_clue'));
  assert.throws(() => applyChoice(sampleEpisode, sSkip, 'nonexistent'));
  assert.deepEqual(sSkip, before);
});

test('CORE-101: rejects broken graphs (dangling target, unreachable scene, missing ending)', () => {
  const dangling = structuredClone(sampleEpisode);
  dangling.scenes[0].choices[0].target = 'missing_scene';
  assert.throws(() => validateSliceEpisode(dangling));

  const unreachable = structuredClone(sampleEpisode);
  unreachable.scenes.push({
    ...unreachable.scenes[2],
    id: 'orphan',
    ending: { id: 'orphan_end', title: 'Orphan', summary: 'Never reached.' }
  });
  assert.throws(() => validateSliceEpisode(unreachable));
});

test('CORE-101: versioned save, reload, replay preserve endings, and reset work cleanly', () => {
  const storage = createMemoryStorage();
  const empty = loadState(storage, DEFAULT_SAVE_KEY, sampleEpisode);
  assert.equal(empty.status, 'empty');

  const s1 = applyChoice(sampleEpisode, empty.state, 'inspect');
  const sEnd = applyChoice(sampleEpisode, s1, 'use_clue');
  saveState(storage, DEFAULT_SAVE_KEY, sampleEpisode, sEnd);

  const loaded = loadState(storage, DEFAULT_SAVE_KEY, sampleEpisode);
  assert.equal(loaded.status, 'loaded');
  assert.deepEqual(loaded.state, sEnd);

  const replayed = restartEpisode(sampleEpisode, loaded.state, { preserveEndings: true });
  assert.equal(replayed.sceneId, 'start');
  assert.deepEqual(replayed.evidence, []);
  assert.deepEqual(replayed.completedEndings, ['preserved']);

  const resetPreserved = resetSave(storage, DEFAULT_SAVE_KEY, sampleEpisode, { preserveEndings: true });
  assert.deepEqual(resetPreserved.completedEndings, ['preserved']);

  const resetFull = resetSave(storage, DEFAULT_SAVE_KEY, sampleEpisode, { preserveEndings: false });
  assert.deepEqual(resetFull.completedEndings, []);
  assert.equal(loadState(storage, DEFAULT_SAVE_KEY, sampleEpisode).status, 'empty');
});

test('CORE-101: recovers gracefully from corrupt JSON, schema mismatch, and tampered state', () => {
  const storage = createMemoryStorage();

  // Corrupt JSON
  storage.setItem(DEFAULT_SAVE_KEY, '{not-valid-json');
  const r1 = loadState(storage, DEFAULT_SAVE_KEY, sampleEpisode);
  assert.equal(r1.status, 'recovered');
  assert.equal(r1.state.sceneId, 'start');
  assert.equal(storage.getItem(DEFAULT_SAVE_KEY), null);
  assert.equal(storage.getItem(`${DEFAULT_SAVE_KEY}:corrupt_backup`), '{not-valid-json');

  // Unsupported schema version
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({ schemaVersion: 99, episodeId: 'ep01-test', episodeVersion: 1, state: {} }));
  const r2 = loadState(storage, DEFAULT_SAVE_KEY, sampleEpisode);
  assert.equal(r2.status, 'recovered');
  assert.equal(r2.state.sceneId, 'start');

  // Tampered unknown evidence
  const validState = createInitialState(sampleEpisode);
  storage.setItem(DEFAULT_SAVE_KEY, JSON.stringify({
    schemaVersion: 1,
    episodeId: 'ep01-test',
    episodeVersion: 1,
    state: { ...validState, evidence: ['invented_clue'] }
  }));
  const r3 = loadState(storage, DEFAULT_SAVE_KEY, sampleEpisode);
  assert.equal(r3.status, 'recovered');
  assert.deepEqual(r3.state.evidence, []);
});
