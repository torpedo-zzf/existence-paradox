import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  validateIndexTtsBeatClip,
  validateIndexTtsManifest
} from '../../providers/voice/indextts-adapter.mjs';

const episode = JSON.parse(readFileSync(new URL('../../episodes/01/slice.json', import.meta.url), 'utf8'));

test('IndexTTS adapter: accepts valid non-speaking-video beat clip and rejects forced post-dub over lin_call', () => {
  const validClip = {
    scene_id: 'wake',
    beat_id: 'b1',
    mp3_path: 'assets/generated/voice/ep01-wake-b1.mp3',
    mp3_sha256: 'a'.repeat(64),
    duration_seconds: 8.5,
    reference_voice: 'VOICE-002.wav'
  };
  assert.equal(validateIndexTtsBeatClip(validClip), true);

  assert.throws(
    () => validateIndexTtsBeatClip({ ...validClip, scene_id: 'lin_call' }),
    /Forced post-dub over native-dialogue scene/
  );
  assert.throws(
    () => validateIndexTtsBeatClip({ ...validClip, mp3_path: 'https://example.com/a.mp3' }),
    /local .mp3 path/
  );
  assert.throws(
    () => validateIndexTtsBeatClip({ ...validClip, reference_voice: 'unauthorized-celebrity.wav' }),
    /Unapproved reference voice/
  );
});

test('IndexTTS adapter: manifest validation enforces local-only and episode scene/beat resolution', () => {
  const manifest = {
    provider: 'indextts_local',
    runtime_generation: false,
    preserve_native_dialogue: true,
    preserved_native_dialogue_scenes: ['lin_call'],
    deliverables: [
      {
        scene_id: 'ending_meeting',
        beat_id: 'b2',
        mp3_path: 'assets/generated/voice/ep01-ending_meeting-b2.mp3',
        mp3_sha256: 'b'.repeat(64),
        duration_seconds: 7.2,
        reference_voice: 'VOICE-001-master-r2.wav'
      }
    ]
  };
  assert.equal(validateIndexTtsManifest(manifest, episode).ok, true);

  const badRuntime = { ...manifest, runtime_generation: true };
  assert.equal(validateIndexTtsManifest(badRuntime, episode).ok, false);
});

test('IndexTTS adapter: real Episode 01 handoff manifest validates cleanly against slice.json', () => {
  const realManifest = JSON.parse(
    readFileSync(new URL('../../docs/media/handoffs/voice/VOICE-INDEXTTS-ep01.json', import.meta.url), 'utf8')
  );
  const check = validateIndexTtsManifest(realManifest, episode);
  assert.equal(check.ok, true, check.errors.join('; '));
  assert.equal(realManifest.deliverables.length, 15);
  assert.equal(realManifest.deliverables.some((d) => d.scene_id === 'lin_call'), false);
});
