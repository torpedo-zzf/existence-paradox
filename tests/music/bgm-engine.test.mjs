import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { resolveBgmState, createBrowserBgmAdapter } from '../../src/player/bgm-engine.mjs';
import { createPlayerController } from '../../src/player/controller.mjs';

const episode = JSON.parse(readFileSync(new URL('../../episodes/01/slice.json', import.meta.url), 'utf8'));
const draftCueSheet = JSON.parse(readFileSync(new URL('../../episodes/01/music-cues.json', import.meta.url), 'utf8'));

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k)
  };
}

function makeLoadedCueSheet() {
  return {
    ...draftCueSheet,
    status: 'approved',
    cues: draftCueSheet.cues.map((c) => ({
      ...c,
      asset_path: `./assets/generated/music/${c.cue_id}.mp3`
    }))
  };
}

test('BGM engine: draft cue sheet with null asset_path degrades to silence_fallback', () => {
  const pureDraft = {
    ...draftCueSheet,
    status: 'draft',
    cues: draftCueSheet.cues.map((c) => ({ ...c, asset_id: null, asset_path: null, song_id: null, sha256: null }))
  };
  const controller = createPlayerController({
    episode,
    storage: createMemoryStorage(),
    musicCues: pureDraft
  });
  const vm = controller.getViewModel();
  assert.equal(vm.bgm.mode, 'silence_fallback');
  assert.equal(vm.bgm.cueId, 'BGM-001');
  assert.equal(vm.bgm.targetGain, 0);
  assert.equal(vm.bgm.src, null);
});

test('BGM engine: remote asset_path is rejected and degrades to silence_fallback', () => {
  const remoteSheet = {
    ...draftCueSheet,
    cues: draftCueSheet.cues.map((c) => ({ ...c, asset_path: 'https://example.com/bgm.mp3' }))
  };
  const state = resolveBgmState({ cueSheet: remoteSheet, scene: episode.scenes[0], beat: episode.scenes[0].beats[0] });
  assert.equal(state.mode, 'silence_fallback');
  assert.equal(state.src, null);
});

test('BGM engine: ducks under native video/dialogue and maintains full base_gain on narrator still beats', () => {
  const loadedCues = makeLoadedCueSheet();
  const controller = createPlayerController({
    episode,
    storage: createMemoryStorage(),
    musicCues: loadedCues
  });

  // Scene 01 (wake) is a video scene -> ducked
  let vm = controller.getViewModel();
  assert.equal(vm.bgm.mode, 'playing');
  assert.equal(vm.bgm.cueId, 'BGM-001');
  assert.equal(vm.bgm.ducked, true);
  assert.equal(vm.bgm.targetGain, 0.18); // 0.6 * 0.3

  // Advance to terminal_check (still scene, narrator beat 0 WITH IndexTTS beat.audio -> ducked)
  controller.selectChoice('inspect_notice');
  vm = controller.getViewModel();
  assert.equal(vm.scene.id, 'terminal_check');
  assert.equal(vm.bgm.cueId, 'BGM-002');
  assert.equal(vm.bgm.ducked, true);
  assert.equal(vm.bgm.targetGain, 0.182); // 0.65 * 0.28

  // Narrator still beat WITHOUT beat.audio -> full base_gain (not ducked)
  const silentNarratorBeat = { id: 'b1', speaker: '旁白', text: '无配音旁白' };
  const unducked = resolveBgmState({ cueSheet: loadedCues, scene: vm.scene, beat: silentNarratorBeat });
  assert.equal(unducked.ducked, false);
  assert.equal(unducked.targetGain, 0.65);

  // Volume scaling & mute/pause/error controls
  controller.setBgmVolume(0.5);
  assert.equal(controller.getViewModel().bgm.targetGain, 0.091);

  controller.toggleMute();
  assert.equal(controller.getViewModel().bgm.mode, 'muted');
  assert.equal(controller.getViewModel().bgm.targetGain, 0);
  controller.toggleMute();

  controller.togglePlay();
  assert.equal(controller.getViewModel().bgm.mode, 'paused');
  controller.togglePlay();

  controller.reportBgmError();
  assert.equal(controller.getViewModel().bgm.mode, 'silence_fallback');
});

test('BGM browser adapter: preserves continuous playback across shared cues and recovers from autoplay block', async () => {
  let playCalls = 0;
  let pauseCalls = 0;
  let srcSetCount = 0;
  let blockFirstPlay = true;

  class MockAudio {
    constructor() {
      this._src = '';
      this.volume = 1;
      this.loop = false;
      this.muted = false;
      this.listeners = new Map();
    }
    get src() { return this._src; }
    set src(val) {
      this._src = val;
      srcSetCount += 1;
    }
    addEventListener(type, fn) {
      this.listeners.set(type, fn);
    }
    play() {
      playCalls += 1;
      if (blockFirstPlay) {
        blockFirstPlay = false;
        return Promise.reject(new Error('Autoplay blocked'));
      }
      return Promise.resolve();
    }
    pause() {
      pauseCalls += 1;
    }
  }

  let errorTriggered = false;
  const adapter = createBrowserBgmAdapter({
    AudioCtor: MockAudio,
    onError: () => { errorTriggered = true; }
  });

  const cueState = {
    mode: 'playing',
    cueId: 'BGM-002',
    src: './assets/generated/music/BGM-002.mp3',
    loop: true,
    targetGain: 0.65,
    fadeMs: 0
  };

  adapter.sync(cueState);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(srcSetCount, 1);
  assert.equal(adapter.getStatus().autoplayBlocked, true);

  // Syncing another scene with the same BGM-002 src should not reload src
  adapter.sync({ ...cueState, targetGain: 0.2 });
  assert.equal(srcSetCount, 1);

  // User gesture unlock retries play and clears autoplayBlocked
  adapter.unlock();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(adapter.getStatus().autoplayBlocked, false);
  assert.ok(playCalls >= 2);

  adapter.destroy();
  assert.ok(pauseCalls >= 1);
  assert.equal(errorTriggered, false);
});
