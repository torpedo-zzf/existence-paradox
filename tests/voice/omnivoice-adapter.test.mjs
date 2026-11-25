import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateVoiceClip,
  validateH3AudioReferenceBatch
} from '../../providers/voice/omnivoice-adapter.mjs';

const handoff = JSON.parse(
  readFileSync(new URL('../../docs/media/handoffs/voice/VOICE-208.json', import.meta.url), 'utf8')
);

test('VOICE-208 handoff deliverables satisfy H3 duration, format, checksum, and rights gates', () => {
  assert.equal(handoff.task_id, 'VOICE-208');
  assert.equal(handoff.deliverables.length, 2);
  for (const clip of handoff.deliverables) {
    assert.equal(validateVoiceClip(clip), true);
  }
  const singlePilot = validateH3AudioReferenceBatch([handoff.deliverables[0]]);
  assert.equal(singlePilot.valid, true);
  assert.ok(singlePilot.totalSeconds <= 15);
});

test('VOICE-208 guard rejects out-of-range duration, >3 clips, >15s total, or missing rights', () => {
  const sample = handoff.deliverables[0];
  assert.throws(() => validateVoiceClip({ ...sample, duration_seconds: 1.5 }));
  assert.throws(() => validateVoiceClip({ ...sample, duration_seconds: 16 }));
  assert.throws(() => validateVoiceClip({ ...sample, file_path: 'voice.ogg' }));
  assert.throws(() => validateVoiceClip({ ...sample, rights_status: 'unverified' }));
  assert.throws(() => validateH3AudioReferenceBatch([sample, sample, sample])); // >15s total
  assert.throws(() => validateH3AudioReferenceBatch([
    { ...sample, duration_seconds: 3 },
    { ...sample, duration_seconds: 3 },
    { ...sample, duration_seconds: 3 },
    { ...sample, duration_seconds: 3 }
  ])); // >3 clips
});
