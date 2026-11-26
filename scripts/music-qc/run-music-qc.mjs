#!/usr/bin/env node
/**
 * Local-only FFmpeg/ffprobe technical QC for BGM / score audio assets (MIX-210).
 *
 * Checks per audio asset:
 *   - local file exists & is a regular file (remote URLs rejected before FS/tool access)
 *   - SHA-256 checksum (when expectedSha256 is supplied)
 *   - decodable audio stream (codec, sample_rate, channels, duration > 0)
 *   - separate score enforcement (rejects files with video streams)
 *   - loudness / clipping / silence via ffmpeg volumedetect (no clipping >= 0 dB, not silent)
 *   - optional loop-boundary seam check (first 50ms vs last 50ms) for looping cues
 *
 * Zero network access, zero paid calls, zero external npm dependencies.
 * Usage:
 *   node scripts/music-qc/run-music-qc.mjs [--cues <file>] [--report <file>] [--base-dir <dir>]
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
export const TOOL_VERSION = '1.0.0';

const MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const DEFAULT_CLIPPING_THRESHOLD_DB = 0;
const DEFAULT_SILENCE_THRESHOLD_DB = -65;

function isRemoteReference(value) {
  return /^(?:https?|rtsp|rtmp|ftp|ftps|s3|gs|file|data):/i.test(String(value)) || String(value).startsWith('//');
}

function addError(result, code, message, details = undefined) {
  const err = { code, message };
  if (details !== undefined) err.details = details;
  result.errors.push(err);
}

function normalizeSha256(value) {
  return String(value).trim().toLowerCase().replace(/^sha256:/, '');
}

async function computeSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function parseVolumedetect(stderr) {
  const meanMatch = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr);
  const maxMatch = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr);
  return {
    mean_volume_db: meanMatch ? Number(meanMatch[1]) : null,
    max_volume_db: maxMatch ? Number(maxMatch[1]) : null
  };
}

async function runFfprobe(filePath) {
  const { stdout } = await execFileAsync(
    'ffprobe',
    ['-v', 'error', '-protocol_whitelist', 'file', '-print_format', 'json', '-show_streams', '-show_format', filePath],
    { maxBuffer: MAX_BUFFER_BYTES }
  );
  return JSON.parse(stdout);
}

async function runVolumedetect(filePath, extraFilter = null) {
  const filter = extraFilter ? `${extraFilter},volumedetect` : 'volumedetect';
  const { stderr } = await execFileAsync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostdin',
      '-nostats',
      '-protocol_whitelist',
      'file',
      '-i',
      filePath,
      '-map',
      '0:a:0',
      '-vn',
      '-af',
      filter,
      '-f',
      'null',
      '-'
    ],
    { maxBuffer: MAX_BUFFER_BYTES }
  );
  return parseVolumedetect(stderr);
}

export async function inspectMusicAsset(spec, { baseDir = PROJECT_ROOT } = {}) {
  const id = String(spec?.id ?? spec?.cue_id ?? 'unknown');
  const assetPath = String(spec?.path ?? spec?.asset_path ?? '');
  const clippingThresholdDb = spec?.clippingThresholdDb ?? DEFAULT_CLIPPING_THRESHOLD_DB;
  const silenceThresholdDb = spec?.silenceThresholdDb ?? DEFAULT_SILENCE_THRESHOLD_DB;

  const result = {
    id,
    path: assetPath,
    ok: false,
    size_bytes: null,
    checks: {},
    errors: []
  };

  if (!assetPath) {
    addError(result, 'INVALID_PATH', 'Asset path must be a non-empty local path.');
    return result;
  }

  if (isRemoteReference(assetPath)) {
    result.checks.file = { ok: false, path: assetPath };
    addError(result, 'REMOTE_REFERENCE_REJECTED', 'Remote/network audio references are rejected.', { path: assetPath });
    return result;
  }

  const resolvedPath = path.isAbsolute(assetPath) ? assetPath : path.resolve(baseDir, assetPath);

  let st;
  try {
    st = await stat(resolvedPath);
  } catch (err) {
    result.checks.file = { ok: false, path: assetPath };
    addError(result, 'FILE_NOT_FOUND', 'Audio asset file does not exist.', {
      path: assetPath,
      system_code: err.code
    });
    return result;
  }

  if (!st.isFile() || st.size <= 0) {
    result.checks.file = { ok: false, path: assetPath, size_bytes: st.size, is_file: st.isFile() };
    addError(result, 'INVALID_FILE', 'Audio asset must be a non-empty regular file.');
    return result;
  }

  result.size_bytes = st.size;
  result.checks.file = { ok: true, path: assetPath, size_bytes: st.size, is_file: true };

  const actualSha = await computeSha256(resolvedPath);
  if (spec?.expectedSha256) {
    const expected = normalizeSha256(spec.expectedSha256);
    const match = actualSha === expected;
    result.checks.sha256 = { ok: match, expected, actual: actualSha, match };
    if (!match) {
      addError(result, 'CHECKSUM_MISMATCH', 'SHA-256 checksum does not match expected hash.', {
        expected,
        actual: actualSha
      });
      return result;
    }
  } else {
    result.checks.sha256 = { ok: true, expected: null, actual: actualSha, match: null };
  }

  let probe;
  try {
    probe = await runFfprobe(resolvedPath);
  } catch (err) {
    result.checks.audio_stream = { ok: false };
    addError(result, 'FFPROBE_FAILED', 'ffprobe failed to decode audio file.', { message: err.message });
    return result;
  }

  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const audioStream = streams.find((s) => s.codec_type === 'audio');
  const videoStream = streams.find((s) => s.codec_type === 'video');

  if (videoStream) {
    result.checks.separate_score = { ok: false, video_codec: videoStream.codec_name };
    addError(result, 'UNEXPECTED_VIDEO_STREAM', 'BGM asset must be a separate audio track without video streams.');
  } else {
    result.checks.separate_score = { ok: true };
  }

  if (!audioStream) {
    result.checks.audio_stream = { ok: false, present: false };
    addError(result, 'AUDIO_STREAM_MISSING', 'No decodable audio stream found.');
    return result;
  }

  const sampleRate = Number(audioStream.sample_rate);
  const channels = Number(audioStream.channels);
  const duration = Number(audioStream.duration ?? probe?.format?.duration);
  const streamOk = Number.isFinite(sampleRate) && sampleRate > 0 && Number.isFinite(channels) && channels >= 1 && Number.isFinite(duration) && duration > 0;

  result.checks.audio_stream = {
    ok: streamOk,
    present: true,
    codec: audioStream.codec_name,
    sample_rate: sampleRate,
    channels,
    duration_seconds: Number.isFinite(duration) ? Number(duration.toFixed(3)) : null
  };

  if (!streamOk) {
    addError(result, 'AUDIO_STREAM_INVALID', 'Audio stream metadata (sample rate, channels, or duration) is invalid.');
    return result;
  }

  let vol;
  try {
    vol = await runVolumedetect(resolvedPath);
  } catch (err) {
    result.checks.volume = { ok: false };
    addError(result, 'VOLUMEDETECT_FAILED', 'ffmpeg volumedetect failed.', { message: err.message });
    return result;
  }

  const clipping = vol.max_volume_db !== null && vol.max_volume_db >= clippingThresholdDb;
  const silent = vol.mean_volume_db === null || vol.mean_volume_db <= silenceThresholdDb;

  result.checks.volume = {
    ok: !clipping && !silent,
    mean_volume_db: vol.mean_volume_db,
    max_volume_db: vol.max_volume_db,
    clipping_threshold_db: clippingThresholdDb,
    silence_threshold_db: silenceThresholdDb,
    clipping,
    silent
  };

  if (clipping) {
    addError(result, 'AUDIO_CLIPPING', `Audio max_volume (${vol.max_volume_db} dB) meets or exceeds clipping threshold (${clippingThresholdDb} dB).`);
  }
  if (silent) {
    addError(result, 'AUDIO_SILENT', `Audio mean_volume (${vol.mean_volume_db} dB) is below silence threshold (${silenceThresholdDb} dB).`);
  }

  if (spec?.loop === true && duration >= 0.2) {
    try {
      const headVol = await runVolumedetect(resolvedPath, 'atrim=start=0:duration=0.05');
      const tailStart = Math.max(0, duration - 0.05).toFixed(3);
      const tailVol = await runVolumedetect(resolvedPath, `atrim=start=${tailStart}:duration=0.05`);
      const deltaDb =
        headVol.mean_volume_db !== null && tailVol.mean_volume_db !== null
          ? Number(Math.abs(headVol.mean_volume_db - tailVol.mean_volume_db).toFixed(2))
          : null;
      result.checks.loop_seam = {
        ok: true,
        head_mean_db: headVol.mean_volume_db,
        tail_mean_db: tailVol.mean_volume_db,
        boundary_delta_db: deltaDb
      };
    } catch (err) {
      result.checks.loop_seam = { ok: false, error: err.message };
      addError(result, 'LOOP_SEAM_CHECK_FAILED', 'Failed to inspect loop boundary.', { message: err.message });
    }
  }

  result.ok = result.errors.length === 0;
  return result;
}

export async function runCueSheetMusicQc({
  cueSheetPath = 'episodes/01/music-cues.json',
  baseDir = PROJECT_ROOT,
  reportPath = null
} = {}) {
  const resolvedCuePath = path.isAbsolute(cueSheetPath) ? cueSheetPath : path.resolve(baseDir, cueSheetPath);
  const cueSheet = JSON.parse(await readFile(resolvedCuePath, 'utf8'));

  const results = [];
  let passed = 0;
  let failed = 0;
  let silenceFallbackCount = 0;

  for (const cue of cueSheet.cues ?? []) {
    if (!cue.asset_path) {
      silenceFallbackCount += 1;
      passed += 1;
      results.push({
        id: cue.cue_id,
        path: null,
        ok: true,
        status: 'silence_fallback',
        duck_under_dialogue: cue.duck_under_dialogue === true,
        loop: Boolean(cue.loop),
        errors: []
      });
      continue;
    }

    const r = await inspectMusicAsset(
      {
        id: cue.cue_id,
        path: cue.asset_path,
        expectedSha256: cue.sha256 ?? undefined,
        loop: Boolean(cue.loop)
      },
      { baseDir }
    );
    if (r.ok) passed += 1;
    else failed += 1;
    results.push({ ...r, status: r.ok ? 'verified' : 'failed' });
  }

  const report = {
    schema_version: '1.0',
    task_id: 'MIX-210',
    phase: 2,
    generated_by: 'scripts/music-qc/run-music-qc.mjs',
    tool: {
      name: 'music-qc',
      version: TOOL_VERSION,
      network_access: false,
      paid_calls: false,
      local_only: true
    },
    cue_sheet: path.relative(baseDir, resolvedCuePath).split(path.sep).join('/'),
    policy: {
      preserve_native_dialogue: cueSheet.preserve_native_dialogue === true,
      missing_bgm: cueSheet.missing_bgm ?? 'unknown',
      runtime_generation: cueSheet.runtime_generation === true
    },
    summary: {
      ok: failed === 0 && cueSheet.preserve_native_dialogue === true && cueSheet.missing_bgm === 'silence' && cueSheet.runtime_generation === false,
      total: results.length,
      passed,
      failed,
      silence_fallback: silenceFallbackCount
    },
    results
  };

  if (reportPath) {
    const resolvedReport = path.isAbsolute(reportPath) ? reportPath : path.resolve(baseDir, reportPath);
    await mkdir(path.dirname(resolvedReport), { recursive: true });
    await writeFile(resolvedReport, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }

  return report;
}

async function main() {
  const args = process.argv.slice(2);
  let cueSheetPath = 'episodes/01/music-cues.json';
  let reportPath = null;
  let baseDir = PROJECT_ROOT;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--cues' && args[i + 1]) cueSheetPath = args[++i];
    else if (args[i] === '--report' && args[i + 1]) reportPath = args[++i];
    else if (args[i] === '--base-dir' && args[i + 1]) baseDir = path.resolve(args[++i]);
  }

  const report = await runCueSheetMusicQc({ cueSheetPath, baseDir, reportPath });
  console.log(JSON.stringify(report.summary));
  process.exitCode = report.summary.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
