import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  validateMusicProviderConfig,
  validateMusicCueSheet,
  buildSunoMcpRequest,
  importManualSunoTrack
} from '../../providers/music/suno-adapter.mjs';

const readJson = (rel) => JSON.parse(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'));

test('BGM-209: episodes/01/music-cues.json is valid and covers all 8 ep01-slice scenes', () => {
  const episode = readJson('episodes/01/slice.json');
  const cueSheet = readJson('episodes/01/music-cues.json');
  const check = validateMusicCueSheet(cueSheet, episode);
  assert.equal(check.ok, true, `Validation errors: ${check.errors.join('; ')}`);

  const covered = new Set(cueSheet.cues.flatMap((c) => c.scene_anchors));
  for (const scene of episode.scenes) {
    assert.ok(covered.has(scene.id), `Scene "${scene.id}" is missing from music-cues.json`);
  }
});

test('BGM-209: default music provider config passes validation and blocks live generation', () => {
  const cfg = readJson('contracts/music-provider.example.json');
  const cueSheet = readJson('episodes/01/music-cues.json');
  assert.equal(validateMusicProviderConfig(cfg).ok, true);

  assert.throws(
    () => buildSunoMcpRequest({ providerConfig: cfg, cue: cueSheet.cues[0], approval: { owner_approved: true, credit_budget: 20, download_budget: 4, max_attempts: 4 } }),
    /live_enabled is false/
  );

  const restEnabled = { ...cfg, rest: { ...cfg.rest, enabled: true } };
  assert.equal(validateMusicProviderConfig(restEnabled).ok, false);
});

test('BGM-209: buildSunoMcpRequest succeeds only with explicit owner approval, verified plan, and budgets', () => {
  const cfg = {
    ...readJson('contracts/music-provider.example.json'),
    live_enabled: true,
    plan_verified: true
  };
  const cue = readJson('episodes/01/music-cues.json').cues[0];

  assert.throws(
    () => buildSunoMcpRequest({ providerConfig: cfg, cue, approval: { owner_approved: false } }),
    /owner approval/
  );
  assert.throws(
    () => buildSunoMcpRequest({ providerConfig: cfg, cue, approval: { owner_approved: true } }),
    /credit_budget/
  );

  const req = buildSunoMcpRequest({
    providerConfig: cfg,
    cue,
    approval: {
      owner_approved: true,
      credit_budget: 40,
      download_budget: 4,
      max_attempts: 4
    }
  });
  assert.equal(req.transport, 'official_mcp');
  assert.equal(req.mcp_url, 'https://api.suno.com/mcp');
  assert.equal(req.instrumental, true);
  assert.equal(req.budget.credit_budget, 40);
});

test('BGM-209: importManualSunoTrack hashes local audio and strips secrets/download URLs', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ep-bgm-import-'));
  try {
    const wavPath = path.join(dir, 'BGM-001.wav');
    writeFileSync(wavPath, Buffer.from('RIFF0000WAVEfmt ', 'utf8'));

    assert.throws(
      () => importManualSunoTrack({ cueId: 'BGM-001', localPath: 'https://suno.com/song.wav', songId: 'song-123' }),
      /Remote audio path rejected/
    );
    assert.throws(
      () => importManualSunoTrack({ cueId: 'BGM-001', localPath: wavPath, songId: '' }),
      /songId is required/
    );

    const receipt = importManualSunoTrack({
      cueId: 'BGM-001',
      localPath: wavPath,
      songId: 'suno-test-001',
      planAtCreation: 'pro',
      baseDir: dir,
      extraMetadata: {
        oauth_token: 'secret-should-strip',
        temporary_download_url: 'https://signed.example/secret',
        notes: 'owner_manual_test'
      }
    });

    assert.equal(receipt.cue_id, 'BGM-001');
    assert.equal(receipt.provider, 'suno');
    assert.equal(receipt.song_id, 'suno-test-001');
    assert.equal(receipt.format, 'wav');
    assert.match(receipt.sha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.notes, 'owner_manual_test');
    assert.equal('oauth_token' in receipt, false);
    assert.equal('temporary_download_url' in receipt, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
