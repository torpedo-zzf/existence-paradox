import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkMediaAsset,
  runQcSuite,
  PILOT_SPECS,
  PROJECT_ROOT
} from '../../scripts/media-qc/run-qc.mjs';

const pilotById = new Map(PILOT_SPECS.map((spec) => [spec.id, spec]));

test('approved 768P pilot MP4s pass full technical QC', async (t) => {
  const suite = await runQcSuite(PILOT_SPECS);

  assert.equal(suite.total, 2, 'expected two pilot specs');
  assert.equal(suite.passed, 2, `pilot failures: ${JSON.stringify(suite.results.filter((r) => !r.ok))}`);
  assert.equal(suite.failed, 0);
  assert.equal(suite.ok, true);

  for (const expected of PILOT_SPECS) {
    await t.test(expected.id, () => {
      const result = suite.results.find((item) => item.id === expected.id);
      assert.ok(result, `missing QC result for ${expected.id}`);
      assert.equal(result.ok, true, `errors: ${JSON.stringify(result.errors)}`);
      assert.deepEqual(result.errors, []);
      assert.equal(result.path, expected.path);
      assert.ok(result.size_bytes > 0);

      // File and checksum.
      assert.equal(result.checks.file.ok, true);
      assert.equal(result.checks.sha256.match, true, 'SHA-256 must match the approved handoff');
      assert.equal(result.checks.sha256.actual, expected.expectedSha256);

      // Video stream.
      const video = result.checks.video_stream;
      assert.equal(video.ok, true);
      assert.equal(video.codec, 'h264');
      assert.equal(video.width, 1344);
      assert.equal(video.height, 768);
      assert.ok(Number.isFinite(video.duration_seconds) && video.duration_seconds > 0);

      // Native audio stream.
      const audio = result.checks.audio_stream;
      assert.equal(audio.ok, true);
      assert.equal(audio.present, true);
      assert.equal(audio.native, true);
      assert.equal(audio.codec, 'aac');
      assert.equal(audio.sample_rate, 32000);
      assert.equal(audio.channels, 2);
      assert.equal(audio.audio_role, expected.audioRole);

      // Volume analysis: both values present, no clipping above 0 dB.
      const volume = result.checks.volume;
      assert.equal(volume.ok, true);
      assert.ok(Number.isFinite(volume.mean_volume_db));
      assert.ok(Number.isFinite(volume.max_volume_db));
      assert.equal(volume.clipping, false);
      assert.ok(volume.max_volume_db <= 0, `max volume ${volume.max_volume_db} dB clips`);
    });
  }
});

test('missing file fails closed', async () => {
  const spec = {
    ...pilotById.get('EP01-S01-VID01'),
    id: 'QC-204-missing-pilot',
    path: 'assets/generated/video/QC-204-does-not-exist.mp4'
  };

  const result = await checkMediaAsset(spec);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.code), ['FILE_NOT_FOUND']);
  assert.equal(result.checks.file.ok, false);
  // Fail closed: no probe/hash/volume work runs on a missing asset.
  assert.equal(result.checks.sha256, undefined);
  assert.equal(result.checks.video_stream, undefined);
  assert.equal(result.checks.volume, undefined);
});

test('bad SHA-256 fails closed before probing the asset', async () => {
  const expected = pilotById.get('EP01-S01-VID01');
  const spec = {
    ...expected,
    id: 'QC-204-bad-sha-pilot',
    expectedSha256: '0'.repeat(64)
  };

  const result = await checkMediaAsset(spec);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.code), ['CHECKSUM_MISMATCH']);
  assert.equal(result.checks.sha256.ok, false);
  assert.equal(result.checks.sha256.match, false);
  assert.equal(result.checks.sha256.actual, expected.expectedSha256);
  assert.equal(result.checks.video_stream, undefined);
});

test('remote references are rejected before network access', async () => {
  const spec = {
    ...pilotById.get('EP01-S01-VID01'),
    id: 'QC-204-remote-pilot',
    path: 'https://example.invalid/EP01-S01-VID01-768p.mp4'
  };

  const result = await checkMediaAsset(spec);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.code), ['SPEC_INVALID']);
  assert.equal(result.checks.file, undefined);
});

test('QC paths resolve from the repository root regardless of cwd', () => {
  // Guards the default baseDir contract used by the CLI and tests.
  const expectedRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  assert.equal(PROJECT_ROOT, expectedRoot);
  assert.ok(PILOT_SPECS.every((spec) => spec.path.startsWith('assets/generated/video/')));
});
