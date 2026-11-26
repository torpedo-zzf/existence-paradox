import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { inspectMusicAsset, runCueSheetMusicQc } from '../../scripts/music-qc/run-music-qc.mjs';

const execFileAsync = promisify(execFile);

let workDir;
let cleanWav;
let cleanSha;
let clippedWav;
let silentWav;

before(async () => {
  workDir = mkdtempSync(path.join(tmpdir(), 'ep-music-qc-'));
  cleanWav = path.join(workDir, 'clean.wav');
  clippedWav = path.join(workDir, 'clipped.wav');
  silentWav = path.join(workDir, 'silent.wav');

  // 1s clean sine wave at -14 dB
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=1',
    '-af', 'volume=-14dB',
    cleanWav
  ]);
  cleanSha = createHash('sha256').update(readFileSync(cleanWav)).digest('hex');

  // 1s clipped sine wave (lavfi sine starts at -18 dB; +24 dB hard-clips at 0.0 dBFS in PCM16 WAV)
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=1',
    '-af', 'volume=24dB',
    clippedWav
  ]);

  // 1s pure silence
  await execFileAsync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo:d=1',
    silentWav
  ]);
});

after(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

test('MIX-210: clean local audio passes decode, SHA-256, loudness, and loop-seam QC', async () => {
  const res = await inspectMusicAsset({
    id: 'BGM-TEST-CLEAN',
    path: cleanWav,
    expectedSha256: cleanSha,
    loop: true
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
  assert.equal(res.checks.sha256.match, true);
  assert.equal(res.checks.separate_score.ok, true);
  assert.equal(res.checks.audio_stream.ok, true);
  assert.equal(res.checks.volume.clipping, false);
  assert.equal(res.checks.volume.silent, false);
  assert.equal(res.checks.loop_seam.ok, true);
});

test('MIX-210: clipped audio fails closed with AUDIO_CLIPPING', async () => {
  const res = await inspectMusicAsset({ id: 'BGM-TEST-CLIP', path: clippedWav });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'AUDIO_CLIPPING'), JSON.stringify(res.errors));
});

test('MIX-210: pure silence fails closed with AUDIO_SILENT', async () => {
  const res = await inspectMusicAsset({ id: 'BGM-TEST-SILENT', path: silentWav });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.code === 'AUDIO_SILENT'), JSON.stringify(res.errors));
});

test('MIX-210: bad SHA-256 fails closed before probing', async () => {
  const res = await inspectMusicAsset({
    id: 'BGM-TEST-BADSHA',
    path: cleanWav,
    expectedSha256: '0'.repeat(64)
  });
  assert.equal(res.ok, false);
  assert.deepEqual(res.errors.map((e) => e.code), ['CHECKSUM_MISMATCH']);
});

test('MIX-210: remote URL and missing local file fail closed', async () => {
  const remote = await inspectMusicAsset({ id: 'BGM-REMOTE', path: 'https://example.com/score.wav' });
  assert.equal(remote.ok, false);
  assert.deepEqual(remote.errors.map((e) => e.code), ['REMOTE_REFERENCE_REJECTED']);

  const missing = await inspectMusicAsset({ id: 'BGM-MISSING', path: path.join(workDir, 'does-not-exist.wav') });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.errors.map((e) => e.code), ['FILE_NOT_FOUND']);
});

test('MIX-210: cue sheet (episodes/01/music-cues.json) passes full QC on all 4 BGM assets', async () => {
  const report = await runCueSheetMusicQc({ cueSheetPath: 'episodes/01/music-cues.json' });
  assert.equal(report.summary.ok, true, JSON.stringify(report.results));
  assert.equal(report.summary.total, 4);
  assert.equal(report.summary.passed, 4);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.summary.silence_fallback, 0);
  for (const r of report.results) {
    assert.equal(r.status, 'verified');
  }
  assert.equal(report.policy.preserve_native_dialogue, true);
  assert.equal(report.policy.missing_bgm, 'silence');
  assert.equal(report.policy.runtime_generation, false);
});
