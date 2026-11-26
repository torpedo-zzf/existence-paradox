import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveVoiceState, createBrowserVoiceAdapter } from '../../src/player/voice-engine.mjs';
import { isDialogueDuckingActive } from '../../src/player/bgm-engine.mjs';

test('Voice engine: degrades to subtitle_only when beat.audio is absent, remote, or errored', () => {
  const scene = { id: 'terminal_check', media: { type: 'still' } };
  assert.equal(resolveVoiceState({ scene, beat: { id: 'b1', speaker: '旁白', text: 'hi' } }).mode, 'subtitle_only');
  assert.equal(
    resolveVoiceState({ scene, beat: { id: 'b1', audio: 'https://example.com/x.mp3' } }).mode,
    'subtitle_only'
  );
  assert.equal(
    resolveVoiceState({ scene, beat: { id: 'b1', audio: './assets/generated/voice/a.mp3' }, voiceError: true }).mode,
    'subtitle_only'
  );
});

test('Voice engine: resolves playing/paused/muted and triggers BGM ducking when beat.audio is present', () => {
  const scene = { id: 'terminal_check', media: { type: 'still' } };
  const beat = { id: 'b1', speaker: '旁白', text: '测试', audio: './assets/generated/voice/ep01-terminal_check-b1.mp3' };

  assert.equal(isDialogueDuckingActive(scene, beat), true);
  assert.equal(resolveVoiceState({ scene, beat, isPlaying: true, muted: false }).mode, 'playing');
  assert.equal(resolveVoiceState({ scene, beat, isPlaying: false, muted: false }).mode, 'paused');
  assert.equal(resolveVoiceState({ scene, beat, isPlaying: true, muted: true }).mode, 'muted');
});

test('Voice browser adapter: restarts on replayToken change and recovers from autoplay block', async () => {
  let playCalls = 0;
  let srcSets = 0;
  let blockFirst = true;

  class MockAudio {
    constructor() {
      this._src = '';
      this.volume = 1;
      this.muted = false;
      this.loop = false;
      this.currentTime = 0;
    }
    get src() { return this._src; }
    set src(v) { this._src = v; srcSets += 1; }
    addEventListener() {}
    play() {
      playCalls += 1;
      if (blockFirst) {
        blockFirst = false;
        return Promise.reject(new Error('Autoplay blocked'));
      }
      return Promise.resolve();
    }
    pause() {}
  }

  const adapter = createBrowserVoiceAdapter({ AudioCtor: MockAudio });
  const base = {
    mode: 'playing',
    sceneId: 'wake',
    beatId: 'b1',
    src: './assets/generated/voice/ep01-wake-b1.mp3',
    targetVolume: 1,
    replayToken: 0
  };

  adapter.sync(base);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(srcSets, 1);
  assert.equal(adapter.getStatus().autoplayBlocked, true);

  adapter.unlock();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(adapter.getStatus().autoplayBlocked, false);

  // Replaying scene bumps replayToken -> reloads audio from start
  adapter.sync({ ...base, replayToken: 1 });
  assert.equal(srcSets, 2);
  assert.ok(playCalls >= 3);
  adapter.destroy();
});
