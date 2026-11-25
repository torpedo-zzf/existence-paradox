#!/usr/bin/env node
/**
 * Local-only technical QC for generated media assets.
 *
 * Checks performed per asset:
 *   - local file existence (regular file, remote URLs rejected)
 *   - SHA-256 checksum (when `expectedSha256` is supplied)
 *   - video stream: h264, exact width/height, duration > 0
 *   - native audio stream: aac, sample rate, channels (when `requireAudio`)
 *   - volume: ffmpeg volumedetect mean/max, no clipping above 0 dB
 *
 * This module never performs network or paid provider calls. ffprobe/ffmpeg are
 * constrained to the local `file` protocol and invoked without a shell.
 *
 * Usage:
 *   node scripts/media-qc/run-qc.mjs [--report <file>] [--spec <file>] [--base-dir <dir>]
 *
 * Node.js >= 22, zero external npm dependencies.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

/** Repository root, independent of the caller's working directory. */
export const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

export const TOOL_VERSION = '1.0.0';

const MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const CLIPPING_THRESHOLD_DB = 0;

/**
 * Approved 768P pilots in this worktree. Hashes are taken from
 * docs/media/handoffs/video/VID-203.json and verified locally.
 */
export const PILOT_SPECS = Object.freeze([
  {
    id: 'EP01-S01-VID01',
    path: 'assets/generated/video/EP01-S01-VID01-768p.mp4',
    expectedSha256: 'b50d937150150dc47eb5b5b1dac706b79ec7c84243e6a0869906190c360ef836',
    requireAudio: true,
    audioRole: 'ambient_native',
    video: { codec: 'h264', width: 1344, height: 768 },
    audio: { codec: 'aac', sampleRate: 32000, channels: 2 }
  },
  {
    id: 'EP01-S05-VID01-r4',
    path: 'assets/generated/video/EP01-S05-VID01-r4-768p.mp4',
    expectedSha256: '606c326173a4118d767f2f9a3208e7def62042f48338ba65ff19e3be7f0e72eb',
    requireAudio: true,
    audioRole: 'native_dialogue',
    video: { codec: 'h264', width: 1344, height: 768 },
    audio: { codec: 'aac', sampleRate: 32000, channels: 2 }
  }
]);

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function addError(result, code, message, details = undefined) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  result.errors.push(error);
}

function isRemoteReference(value) {
  // Reject URL-like schemes and protocol-relative paths before touching the FS.
  return /^(?:https?|rtsp|rtmp|ftp|ftps|s3|gs|file|data):/i.test(value) || value.startsWith('//');
}

function toPositiveInteger(value) {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isInteger(number) && number > 0 ? number : null;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSha256(value) {
  return String(value).trim().toLowerCase().replace(/^sha256:/, '');
}

function truncate(text, max = 600) {
  const value = String(text ?? '').trim();
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function validateSpec(assetSpec) {
  const problems = [];

  if (!assetSpec || typeof assetSpec !== 'object' || Array.isArray(assetSpec)) {
    return { problems: ['assetSpec must be a non-null object'] };
  }

  const id = typeof assetSpec.id === 'string' ? assetSpec.id.trim() : '';
  if (!id) problems.push('id must be a non-empty string');

  const assetPath = typeof assetSpec.path === 'string' ? assetSpec.path.trim() : '';
  if (!assetPath) problems.push('path must be a non-empty string');
  else if (isRemoteReference(assetPath)) {
    problems.push('path must be a local file path; remote/network references are rejected');
  }

  const video = assetSpec.video;
  if (!video || typeof video !== 'object' || Array.isArray(video)) {
    problems.push('video must be an object with codec, width and height');
  }

  const videoCodec = String(video?.codec ?? 'h264').toLowerCase();
  if (videoCodec !== 'h264') problems.push('video.codec must be "h264"');

  const width = toPositiveInteger(video?.width);
  const height = toPositiveInteger(video?.height);
  if (width === null) problems.push('video.width must be a positive integer');
  if (height === null) problems.push('video.height must be a positive integer');

  const requireAudio = assetSpec.requireAudio === true;
  if (assetSpec.requireAudio !== undefined && typeof assetSpec.requireAudio !== 'boolean') {
    problems.push('requireAudio must be a boolean');
  }

  let audio = null;
  if (requireAudio) {
    const source = assetSpec.audio;
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      problems.push('audio must be an object when requireAudio is true');
    }
    const audioCodec = String(source?.codec ?? 'aac').toLowerCase();
    if (audioCodec !== 'aac') problems.push('audio.codec must be "aac"');
    const sampleRate = toPositiveInteger(source?.sampleRate);
    const channels = toPositiveInteger(source?.channels);
    if (sampleRate === null) problems.push('audio.sampleRate must be a positive integer');
    if (channels === null) problems.push('audio.channels must be a positive integer');
    audio = { codec: audioCodec, sampleRate, channels };
  }

  let expectedSha256 = null;
  if (assetSpec.expectedSha256 !== undefined && assetSpec.expectedSha256 !== null) {
    expectedSha256 = normalizeSha256(assetSpec.expectedSha256);
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      problems.push('expectedSha256 must be a 64-character hex SHA-256 (optional "sha256:" prefix)');
    }
  }

  return {
    problems,
    spec: {
      id,
      path: assetPath,
      expectedSha256,
      requireAudio,
      audioRole: typeof assetSpec.audioRole === 'string' ? assetSpec.audioRole : null,
      video: { codec: videoCodec, width, height },
      audio
    }
  };
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function parseVolume(stderr, label) {
  const match = String(stderr).match(new RegExp(`${label}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*dB`));
  return match ? Number(match[1]) : null;
}

function commandErrorDetails(error) {
  return {
    exit_code: typeof error?.code === 'number' ? error.code : null,
    stderr: truncate(error?.stderr)
  };
}

/* ------------------------------------------------------------------ */
/* public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Verify one media asset against its spec. Verification failures are returned
 * as `ok: false` plus structured errors; they do not throw.
 *
 * @param {object} assetSpec
 * @param {object} [options]
 * @param {string} [options.baseDir] base directory for relative asset paths
 * @param {string} [options.ffprobePath]
 * @param {string} [options.ffmpegPath]
 * @returns {Promise<object>}
 */
export async function checkMediaAsset(assetSpec, options = {}) {
  const baseDir = path.resolve(options.baseDir ?? PROJECT_ROOT);
  const ffprobePath = options.ffprobePath ?? 'ffprobe';
  const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
  const specInput = assetSpec ?? {};
  const result = {
    id: typeof specInput.id === 'string' && specInput.id.trim() ? specInput.id.trim() : '<unnamed>',
    path: typeof specInput.path === 'string' ? specInput.path.trim() : '',
    ok: false,
    size_bytes: null,
    checks: {},
    errors: []
  };
  const finish = () => {
    result.ok = result.errors.length === 0;
    return result;
  };

  try {
    const { problems, spec } = validateSpec(assetSpec);
    if (problems.length > 0) {
      addError(result, 'SPEC_INVALID', 'Asset spec failed validation.', problems);
      return finish();
    }

    const absolutePath = path.isAbsolute(spec.path) ? spec.path : path.resolve(baseDir, spec.path);

    // 1. File existence — fail closed before any probing.
    let fileStat;
    try {
      fileStat = await stat(absolutePath);
    } catch (error) {
      const code = error?.code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'FILE_STAT_FAILED';
      addError(result, code, code === 'FILE_NOT_FOUND' ? 'Asset file does not exist.' : 'Unable to stat asset file.', {
        path: spec.path,
        system_code: error?.code ?? null
      });
      result.checks.file = { ok: false, path: spec.path };
      return finish();
    }

    if (!fileStat.isFile()) {
      addError(result, 'NOT_A_FILE', 'Asset path exists but is not a regular file.', { path: spec.path });
      result.checks.file = { ok: false, path: spec.path, is_file: false };
      return finish();
    }

    result.size_bytes = fileStat.size;
    result.checks.file = { ok: true, path: spec.path, size_bytes: fileStat.size, is_file: true };

    // 2. SHA-256 checksum.
    let actualSha256;
    try {
      actualSha256 = await sha256File(absolutePath);
    } catch (error) {
      addError(result, 'HASH_FAILED', 'Unable to compute SHA-256 for asset.', {
        system_code: error?.code ?? null
      });
      return finish();
    }

    const checksumMatch = spec.expectedSha256 === null ? null : actualSha256 === spec.expectedSha256;
    result.checks.sha256 = {
      ok: checksumMatch !== false,
      expected: spec.expectedSha256,
      actual: actualSha256,
      match: checksumMatch
    };
    if (checksumMatch === false) {
      addError(result, 'CHECKSUM_MISMATCH', 'SHA-256 does not match the expected checksum.', {
        expected: spec.expectedSha256,
        actual: actualSha256
      });
      return finish();
    }

    // 3. ffprobe local container metadata.
    let probe;
    try {
      const { stdout } = await execFileAsync(
        ffprobePath,
        [
          '-v', 'error',
          '-protocol_whitelist', 'file',
          '-print_format', 'json',
          '-show_streams',
          '-show_format',
          absolutePath
        ],
        { encoding: 'utf8', maxBuffer: MAX_BUFFER_BYTES }
      );
      probe = JSON.parse(stdout);
    } catch (error) {
      const code = error?.code === 'ENOENT' ? 'FFPROBE_NOT_FOUND' : 'FFPROBE_FAILED';
      addError(result, code, 'ffprobe failed to inspect the asset.', commandErrorDetails(error));
      return finish();
    }

    const streams = Array.isArray(probe?.streams) ? probe.streams : [];
    const formatDuration = toFiniteNumber(probe?.format?.duration);

    // 4. Video stream: h264, dimensions, duration > 0.
    const videoStream = streams.find((stream) => stream.codec_type === 'video');
    if (!videoStream) {
      result.checks.video_stream = { ok: false, present: false };
      addError(result, 'VIDEO_STREAM_MISSING', 'No video stream found in the container.');
    } else {
      const streamDuration = toFiniteNumber(videoStream.duration);
      const duration = formatDuration ?? streamDuration;
      const videoCheck = {
        ok: true,
        present: true,
        codec: videoStream.codec_name ?? null,
        width: toFiniteNumber(videoStream.width),
        height: toFiniteNumber(videoStream.height),
        duration_seconds: duration,
        stream_duration_seconds: streamDuration,
        format_duration_seconds: formatDuration,
        avg_frame_rate: videoStream.avg_frame_rate ?? null
      };
      result.checks.video_stream = videoCheck;

      if (videoCheck.codec !== spec.video.codec) {
        videoCheck.ok = false;
        addError(result, 'VIDEO_CODEC_MISMATCH', 'Video codec does not match the expected codec.', {
          expected: spec.video.codec,
          actual: videoCheck.codec
        });
      }
      if (videoCheck.width !== spec.video.width) {
        videoCheck.ok = false;
        addError(result, 'VIDEO_WIDTH_MISMATCH', 'Video width does not match the expected width.', {
          expected: spec.video.width,
          actual: videoCheck.width
        });
      }
      if (videoCheck.height !== spec.video.height) {
        videoCheck.ok = false;
        addError(result, 'VIDEO_HEIGHT_MISMATCH', 'Video height does not match the expected height.', {
          expected: spec.video.height,
          actual: videoCheck.height
        });
      }
      if (!(duration > 0)) {
        videoCheck.ok = false;
        addError(result, 'VIDEO_DURATION_INVALID', 'Video duration must be greater than 0 seconds.', {
          actual: duration
        });
      }
    }

    // 5. Native audio stream (required for pilot playback).
    const audioStream = streams.find((stream) => stream.codec_type === 'audio');
    if (!spec.requireAudio) {
      result.checks.audio_stream = {
        ok: true,
        required: false,
        present: Boolean(audioStream),
        codec: audioStream?.codec_name ?? null,
        sample_rate: toFiniteNumber(audioStream?.sample_rate),
        channels: toFiniteNumber(audioStream?.channels),
        native: Boolean(audioStream),
        audio_role: spec.audioRole
      };
      result.checks.volume = { ok: true, required: false, skipped: true };
      return finish();
    }

    if (!audioStream) {
      result.checks.audio_stream = {
        ok: false,
        required: true,
        present: false,
        native: false,
        audio_role: spec.audioRole
      };
      addError(result, 'AUDIO_STREAM_MISSING', 'Native audio stream is required but was not found.');
      return finish();
    }

    const audioCheck = {
      ok: true,
      required: true,
      present: true,
      native: true,
      audio_role: spec.audioRole,
      codec: audioStream.codec_name ?? null,
      sample_rate: toFiniteNumber(audioStream.sample_rate),
      channels: toFiniteNumber(audioStream.channels),
      duration_seconds: toFiniteNumber(audioStream.duration) ?? formatDuration
    };
    result.checks.audio_stream = audioCheck;

    if (audioCheck.codec !== spec.audio.codec) {
      audioCheck.ok = false;
      addError(result, 'AUDIO_CODEC_MISMATCH', 'Audio codec does not match the expected codec.', {
        expected: spec.audio.codec,
        actual: audioCheck.codec
      });
    }
    if (audioCheck.sample_rate !== spec.audio.sampleRate) {
      audioCheck.ok = false;
      addError(result, 'AUDIO_SAMPLE_RATE_MISMATCH', 'Audio sample rate does not match the expected rate.', {
        expected: spec.audio.sampleRate,
        actual: audioCheck.sample_rate
      });
    }
    if (audioCheck.channels !== spec.audio.channels) {
      audioCheck.ok = false;
      addError(result, 'AUDIO_CHANNELS_MISMATCH', 'Audio channel count does not match the expectation.', {
        expected: spec.audio.channels,
        actual: audioCheck.channels
      });
    }

    // 6. Volume analysis with ffmpeg volumedetect.
    let volumeOutput;
    try {
      const { stderr } = await execFileAsync(
        ffmpegPath,
        [
          '-hide_banner',
          '-nostdin',
          '-nostats',
          '-protocol_whitelist', 'file',
          '-i', absolutePath,
          '-map', '0:a:0',
          '-vn',
          '-af', 'volumedetect',
          '-f', 'null',
          '-'
        ],
        { encoding: 'utf8', maxBuffer: MAX_BUFFER_BYTES }
      );
      volumeOutput = stderr;
    } catch (error) {
      const code = error?.code === 'ENOENT' ? 'FFMPEG_NOT_FOUND' : 'VOLUME_ANALYSIS_FAILED';
      addError(result, code, 'ffmpeg volumedetect failed to analyze the audio stream.', commandErrorDetails(error));
      result.checks.volume = { ok: false, required: true };
      return finish();
    }

    const meanVolumeDb = parseVolume(volumeOutput, 'mean_volume');
    const maxVolumeDb = parseVolume(volumeOutput, 'max_volume');
    const volumeCheck = {
      ok: true,
      required: true,
      mean_volume_db: meanVolumeDb,
      max_volume_db: maxVolumeDb,
      clipping_threshold_db: CLIPPING_THRESHOLD_DB,
      clipping: maxVolumeDb === null ? null : maxVolumeDb > CLIPPING_THRESHOLD_DB
    };
    result.checks.volume = volumeCheck;

    if (meanVolumeDb === null || maxVolumeDb === null) {
      volumeCheck.ok = false;
      addError(result, 'VOLUME_ANALYSIS_FAILED', 'ffmpeg volumedetect did not report mean_volume and max_volume.');
    } else if (volumeCheck.clipping) {
      volumeCheck.ok = false;
      addError(result, 'VOLUME_CLIPPING', 'Audio exceeds 0 dB and may clip.', {
        max_volume_db: maxVolumeDb,
        threshold_db: CLIPPING_THRESHOLD_DB
      });
    }

    return finish();
  } catch (error) {
    addError(result, 'INTERNAL_ERROR', 'Unexpected QC failure.', {
      message: truncate(error?.message)
    });
    return finish();
  }
}

/**
 * Run QC over a list of asset specs, sequentially, and aggregate the result.
 *
 * @param {object[]} specs
 * @param {object} [options] forwarded to checkMediaAsset
 * @returns {Promise<{ok: boolean, total: number, passed: number, failed: number, results: object[]}>}
 */
export async function runQcSuite(specs, options = {}) {
  if (!Array.isArray(specs)) throw new TypeError('runQcSuite(specs) requires an array of asset specs');

  const results = [];
  for (const spec of specs) results.push(await checkMediaAsset(spec, options));

  const passed = results.filter((result) => result.ok).length;
  return {
    ok: passed === results.length,
    total: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}

async function commandVersion(command, options = {}) {
  const executable = options[`${command}Path`] ?? command;
  try {
    const { stdout } = await execFileAsync(executable, ['-version'], {
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER_BYTES
    });
    const match = stdout.match(/version\s+(\S+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Build the reproducible QC report document (no timestamps, no absolute paths).
 *
 * @param {object[]} specs
 * @param {object} [options]
 * @param {string} [options.baseDir]
 * @param {string} [options.specSource]
 * @param {string} [options.ffprobePath]
 * @param {string} [options.ffmpegPath]
 * @returns {Promise<object>}
 */
export async function createQcReport(specs, options = {}) {
  const suite = await runQcSuite(specs, options);
  const [ffprobeVersion, ffmpegVersion] = await Promise.all([
    commandVersion('ffprobe', options),
    commandVersion('ffmpeg', options)
  ]);

  return {
    schema_version: '1.0',
    task_id: 'QC-204',
    phase: 2,
    generated_by: 'scripts/media-qc/run-qc.mjs',
    tool: {
      name: 'media-qc',
      version: TOOL_VERSION,
      network_access: false,
      paid_calls: false,
      local_only: true
    },
    environment: {
      node: process.version,
      ffprobe: ffprobeVersion,
      ffmpeg: ffmpegVersion
    },
    spec_source: options.specSource ?? 'builtin:pilot-768p',
    reproduction: 'node scripts/media-qc/run-qc.mjs --report docs/media/qc/QC-204-report.json',
    scope: {
      automated_checks: [
        'local file exists and is a regular file',
        'SHA-256 checksum when expectedSha256 is provided',
        'video stream: h264, exact width/height, duration > 0',
        'native audio stream: aac, sample rate, channels when requireAudio is true',
        'volume: mean_volume/max_volume, no clipping above 0 dB'
      ],
      review_boundaries: [
        'Technical container, stream and volume QC only.',
        'Visual continuity, lip sync, timbre, speaker consistency and transcript accuracy require separate Codex/owner review.',
        'No network, provider or paid calls were made.'
      ]
    },
    verification_commands: [
      'ffprobe -v error -protocol_whitelist file -print_format json -show_streams -show_format <asset>',
      'ffmpeg -hide_banner -nostdin -nostats -protocol_whitelist file -i <asset> -map 0:a:0 -vn -af volumedetect -f null -'
    ],
    summary: {
      ok: suite.ok,
      total: suite.total,
      passed: suite.passed,
      failed: suite.failed
    },
    results: suite.results
  };
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const USAGE = `Usage: node scripts/media-qc/run-qc.mjs [options]

Run local-only technical QC for media assets. Defaults to the two approved
768P pilots in this worktree.

Options:
  --report <file>    Write the JSON report to <file>
  --spec <file>      Load specs from JSON (array or { "specs": [...] })
  --base-dir <dir>   Base directory for relative asset paths (default: repo root)
  -h, --help         Show this help

Exit codes: 0 all assets passed, 1 any asset failed, 2 usage error.`;

function parseCliArgs(argv) {
  const options = { report: null, spec: null, baseDir: PROJECT_ROOT, help: false };

  const takeValue = (flag, index) => {
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--report') {
      options.report = takeValue(arg, index);
      index += 1;
    } else if (arg === '--spec') {
      options.spec = takeValue(arg, index);
      index += 1;
    } else if (arg === '--base-dir') {
      options.baseDir = path.resolve(process.cwd(), takeValue(arg, index));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

async function loadSpecsFromFile(specFile) {
  const absolutePath = path.resolve(process.cwd(), specFile);
  let parsed;
  try {
    parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read spec file ${specFile}: ${truncate(error?.message)}`);
  }
  const specs = Array.isArray(parsed) ? parsed : parsed?.specs;
  if (!Array.isArray(specs)) throw new Error('Spec file must be an array or an object with a "specs" array');
  return specs;
}

/**
 * CLI entry point. Returns the intended process exit code.
 *
 * @param {string[]} [argv]
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    console.error(`ERROR: ${error.message}\n\n${USAGE}`);
    return 2;
  }

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  let specs;
  let specSource;
  try {
    if (options.spec) {
      specs = await loadSpecsFromFile(options.spec);
      specSource = options.spec;
    } else {
      specs = PILOT_SPECS;
      specSource = 'builtin:pilot-768p';
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 2;
  }

  const report = await createQcReport(specs, {
    baseDir: options.baseDir,
    specSource
  });
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (options.report) {
    const reportPath = path.resolve(process.cwd(), options.report);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, serialized, 'utf8');
    const status = report.summary.ok ? 'PASS' : 'FAIL';
    console.log(
      `${status}: ${report.summary.passed}/${report.summary.total} assets passed technical QC; report written to ${options.report}`
    );
    for (const result of report.results) {
      if (result.ok) continue;
      for (const error of result.errors) console.error(`  ${result.id}: ${error.code}: ${error.message}`);
    }
  } else {
    process.stdout.write(serialized);
  }

  return report.summary.ok ? 0 : 1;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`ERROR: ${error?.stack ?? error}`);
    process.exitCode = 2;
  }
}
