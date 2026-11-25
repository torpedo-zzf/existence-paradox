// Direct Metaso MiniMax-H3 HTTP video adapter (VID-203).
// Never uses ComfyUI, never logs Bearer tokens or signed URLs, never forwards Bearer to download hosts.

import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const METASO_DEFAULT_BASE_URL = 'https://metaso.cn/api/minimax';
export const METASO_MODEL = 'MiniMax-H3';

export function buildMetasoPayload({
  prompt,
  resolution = '768P',
  duration = 5,
  ratio = '16:9',
  audioMode = 'native_ambience',
  firstFrameUrl = null,
  referenceImageUrls = [],
  referenceAudioUrls = []
}) {
  if (!prompt || typeof prompt !== 'string') throw new Error('prompt is required');
  if (!['768P', '2K'].includes(resolution)) throw new Error(`Unsupported resolution: ${resolution}`);
  if (!Number.isInteger(duration) || duration < 5 || duration > 15) {
    throw new Error('duration must be an integer between 5 and 15 seconds');
  }

  // Enforce native H3 rule: never mix first_frame/last_frame with reference_audio
  if (firstFrameUrl && referenceAudioUrls.length > 0) {
    throw new Error('Cannot mix first_frame with reference_audio under native MiniMax-H3 rules');
  }
  if (audioMode === 'native_reference_dialogue' && referenceAudioUrls.length === 0) {
    throw new Error('Speaking shot requires at least one reference_audio URL');
  }
  if (referenceAudioUrls.length > 3) {
    throw new Error('At most 3 reference_audio URLs are allowed');
  }

  const content = [{ type: 'text', text: prompt }];

  if (firstFrameUrl) {
    content.push({
      type: 'image_url',
      image_url: { url: firstFrameUrl },
      role: 'first_frame'
    });
  }
  for (const url of referenceImageUrls) {
    content.push({
      type: 'image_url',
      image_url: { url },
      role: 'reference_image'
    });
  }
  for (const url of referenceAudioUrls) {
    content.push({
      type: 'audio_url',
      audio_url: { url },
      role: 'reference_audio'
    });
  }

  return {
    model: METASO_MODEL,
    content,
    resolution,
    duration,
    ratio,
    fast_mode: false
  };
}

export async function submitMetasoVideoJob({
  baseUrl = METASO_DEFAULT_BASE_URL,
  apiKey,
  payload,
  intentFile,
  assetId,
  approved = false,
  fetchImpl = fetch
}) {
  if (!approved) throw new Error('Explicit owner budget & job approval required before Metaso POST');
  if (!apiKey) throw new Error('METASO_API_KEY is required');
  if (baseUrl !== METASO_DEFAULT_BASE_URL) {
    throw new Error(`Provider lock violation: only ${METASO_DEFAULT_BASE_URL} is authorized`);
  }

  // Persist sanitized submission intent FIRST (no signed URLs or API keys!)
  const sanitizedIntent = {
    asset_id: assetId,
    model: payload.model,
    resolution: payload.resolution,
    duration: payload.duration,
    ratio: payload.ratio,
    content_roles: payload.content.map((c) => c.role || c.type),
    submitted_at: new Date().toISOString(),
    status: 'submitting',
    task_id: null
  };
  if (intentFile) {
    mkdirSync(path.dirname(intentFile), { recursive: true });
    writeFileSync(intentFile, JSON.stringify(sanitizedIntent, null, 2));
  }

  let res;
  try {
    res = await fetchImpl(`${baseUrl}/v2/video_generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Ambiguous network failure: mark unknown, NEVER auto-retry blindly
    sanitizedIntent.status = 'unknown_reconcile_required';
    sanitizedIntent.error = err.message;
    if (intentFile) writeFileSync(intentFile, JSON.stringify(sanitizedIntent, null, 2));
    throw new Error(`Ambiguous Metaso POST failure (reconcile before retry): ${err.message}`);
  }

  const body = await res.json().catch(() => ({}));
  const taskId = body?.task?.id || body?.task_id || body?.id || null;
  if (!res.ok || !taskId) {
    sanitizedIntent.status = 'failed';
    sanitizedIntent.http_status = res.status;
    sanitizedIntent.error_message = body?.error?.message || body?.message || `HTTP ${res.status}`;
    if (intentFile) writeFileSync(intentFile, JSON.stringify(sanitizedIntent, null, 2));
    throw new Error(`Metaso POST failed (HTTP ${res.status}): ${sanitizedIntent.error_message}`);
  }

  sanitizedIntent.status = 'submitted';
  sanitizedIntent.task_id = String(taskId);
  if (intentFile) writeFileSync(intentFile, JSON.stringify(sanitizedIntent, null, 2));
  return { taskId: String(taskId), receipt: sanitizedIntent };
}

export async function pollMetasoVideoJob({
  baseUrl = METASO_DEFAULT_BASE_URL,
  apiKey,
  taskId,
  maxPolls = 60,
  intervalMs = 10000,
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((r) => setTimeout(r, ms))
}) {
  if (!apiKey) throw new Error('METASO_API_KEY is required');
  for (let i = 0; i < maxPolls; i += 1) {
    const res = await fetchImpl(`${baseUrl}/v2/query/video_generation/${encodeURIComponent(taskId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json().catch(() => ({}));
    const task = data?.task || data;
    const status = String(task?.status || '').toLowerCase();

    if (status === 'succeeded' || status === 'success' || status === 'completed') {
      const downloadUrl = task?.content?.url || task?.video_url || task?.file_url || null;
      return {
        status: 'succeeded',
        taskId: String(task?.id || taskId),
        usage: task?.usage || null,
        resolution: task?.resolution || null,
        duration: task?.duration || null,
        downloadUrl
      };
    }
    if (status === 'failed' || status === 'error' || status === 'canceled') {
      throw new Error(`Metaso task ${taskId} failed with status=${status}: ${task?.error?.message || JSON.stringify(task?.error || {})}`);
    }
    if (i < maxPolls - 1) await sleepImpl(intervalMs);
  }
  throw new Error(`Metaso task ${taskId} polling timed out after ${maxPolls} polls`);
}

export async function downloadCompletedVideo({
  downloadUrl,
  outputPath,
  fetchImpl = fetch
}) {
  if (!downloadUrl || !downloadUrl.startsWith('https://')) {
    throw new Error('Valid HTTPS downloadUrl is required');
  }
  // Never forward Metaso Authorization header to third-party CDN/download hosts
  const res = await fetchImpl(downloadUrl, { method: 'GET' });
  if (!res.ok) throw new Error(`Video download failed with HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error(`Downloaded file suspiciously small (${buf.length} bytes)`);

  mkdirSync(path.dirname(outputPath), { recursive: true });
  const tmpPath = `${outputPath}.tmp`;
  writeFileSync(tmpPath, buf);
  renameSync(tmpPath, outputPath);

  const sha256 = createHash('sha256').update(buf).digest('hex');
  return { outputPath, sizeBytes: buf.length, sha256 };
}
