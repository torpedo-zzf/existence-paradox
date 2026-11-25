#!/usr/bin/env node
// Authorized Phase 2 pilot runner for OSS-207 (private staging) + VID-203 (768P Metaso H3 pilot).
// Strictly enforces: official OSS SDK, no signed URLs or tokens in logs/manifests, max 1 attempt per shot.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stageAssetToPrivateOss } from '../providers/oss/oss-staging.mjs';
import {
  buildMetasoPayload,
  submitMetasoVideoJob,
  pollMetasoVideoJob,
  downloadCompletedVideo,
  METASO_DEFAULT_BASE_URL
} from '../providers/video/metaso-h3.mjs';

function loadDotEnv(filePath = '.env') {
  const env = { ...process.env };
  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in env) || env[k] === '') env[k] = v;
  }
  return env;
}

function ffprobeSummary(filePath) {
  const res = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,sample_rate,channels', '-of', 'json', filePath],
    { encoding: 'utf8' }
  );
  if (res.status !== 0) return { ok: false, error: res.stderr };
  return { ok: true, data: JSON.parse(res.stdout) };
}

async function main() {
  if (!process.argv.includes('--approve-pilot')) {
    console.error('Refusing live OSS/Metaso pilot without --approve-pilot flag.');
    process.exit(2);
  }

  const env = loadDotEnv('.env');
  const apiKey = env.METASO_API_KEY;
  if (!apiKey) throw new Error('METASO_API_KEY missing in .env');

  const requests = JSON.parse(readFileSync('episodes/01/media-requests.json', 'utf8')).requests;
  const reqVid1 = requests.find((r) => r.asset_id === 'EP01-S01-VID01');
  const reqVid2 = requests.find((r) => r.asset_id === 'EP01-S05-VID01');

  // 1. Stage approved assets via private OSS (OSS-207)
  const toStage = [
    { asset_id: 'EP01-S01-KF01', localPath: 'assets/inbox/nano-banana/EP01-S01-KF01-r1.png' },
    { asset_id: 'CHAR-002', localPath: 'assets/inbox/CHAR-002/CHAR-002-r1.png' },
    { asset_id: 'VOICE-001', localPath: 'assets/inbox/voice/VOICE-001.wav' }
  ];

  const stagedUrls = new Map();
  const ossReceipts = [];
  for (const item of toStage) {
    const out = stageAssetToPrivateOss({
      localPath: item.localPath,
      env,
      approved: true
    });
    stagedUrls.set(item.asset_id, out.ephemeralSignedUrl);
    ossReceipts.push({ asset_id: item.asset_id, local_path: item.localPath, ...out.receipt });
    console.log(`OSS-207 staged ${item.asset_id}: key=${out.receipt.object_key} http=${out.receipt.reachability_http_status} dedup=${out.receipt.deduplicated}`);
  }

  mkdirSync('docs/media/handoffs/oss', { recursive: true });
  writeFileSync(
    'docs/media/handoffs/oss/OSS-207.json',
    JSON.stringify({
      task_id: 'OSS-207',
      status: 'review',
      provider: 'aliyun_oss',
      sdk: 'oss2',
      private_bucket: true,
      signed_urls_persisted: false,
      staged_assets: ossReceipts
    }, null, 2)
  );

  // 2. Submit 2 approved 768P Metaso MiniMax-H3 pilot shots (VID-203)
  const jobs = [
    {
      asset_id: 'EP01-S01-VID01',
      outputPath: 'assets/generated/video/EP01-S01-VID01-768p.mp4',
      intentFile: 'docs/media/handoffs/video/EP01-S01-VID01.intent.json',
      payload: buildMetasoPayload({
        prompt: reqVid1.prompt,
        resolution: '768P',
        duration: reqVid1.duration_seconds,
        ratio: '16:9',
        audioMode: 'native_ambience',
        firstFrameUrl: stagedUrls.get('EP01-S01-KF01')
      })
    },
    {
      asset_id: 'EP01-S05-VID01',
      outputPath: 'assets/generated/video/EP01-S05-VID01-768p.mp4',
      intentFile: 'docs/media/handoffs/video/EP01-S05-VID01.intent.json',
      payload: buildMetasoPayload({
        prompt: reqVid2.prompt,
        resolution: '768P',
        duration: reqVid2.duration_seconds,
        ratio: '16:9',
        audioMode: 'native_reference_dialogue',
        referenceImageUrls: [stagedUrls.get('CHAR-002')],
        referenceAudioUrls: [stagedUrls.get('VOICE-001')]
      })
    }
  ];

  const submitted = [];
  for (const job of jobs) {
    const res = await submitMetasoVideoJob({
      baseUrl: METASO_DEFAULT_BASE_URL,
      apiKey,
      payload: job.payload,
      intentFile: job.intentFile,
      assetId: job.asset_id,
      approved: true
    });
    console.log(`VID-203 submitted ${job.asset_id}: task_id=${res.taskId}`);
    submitted.push({ ...job, taskId: res.taskId, receipt: res.receipt });
  }

  // 3. Poll both tasks boundedly and download completed videos
  const deliverables = [];
  for (const job of submitted) {
    const polled = await pollMetasoVideoJob({
      baseUrl: METASO_DEFAULT_BASE_URL,
      apiKey,
      taskId: job.taskId,
      maxPolls: 60,
      intervalMs: 10000
    });
    const dl = await downloadCompletedVideo({
      downloadUrl: polled.downloadUrl,
      outputPath: job.outputPath
    });
    const probe = ffprobeSummary(dl.outputPath);
    console.log(`VID-203 completed ${job.asset_id}: file=${dl.outputPath} bytes=${dl.sizeBytes} sha256=${dl.sha256.slice(0, 16)}`);
    deliverables.push({
      asset_id: job.asset_id,
      task_id: job.taskId,
      resolution: polled.resolution || '768P',
      duration: polled.duration,
      usage: polled.usage,
      output_path: dl.outputPath,
      size_bytes: dl.sizeBytes,
      sha256: dl.sha256,
      ffprobe: probe
    });
  }

  mkdirSync('docs/media/handoffs/video', { recursive: true });
  writeFileSync(
    'docs/media/handoffs/video/VID-203.json',
    JSON.stringify({
      task_id: 'VID-203',
      status: 'review',
      provider: 'metaso',
      model: 'MiniMax-H3',
      transport: 'direct_http',
      comfyui_used: false,
      deliverables
    }, null, 2)
  );
  console.log('VID-203 ALL PILOT DELIVERABLES SAVED.');
}

main().catch((err) => {
  console.error('PILOT ERROR:', err.message);
  process.exit(1);
});
