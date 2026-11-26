/**
 * Offline-first Suno BGM adapter, cue-sheet validator, and manual-export importer.
 *
 * Enforces docs/13_SUNO_BGM.md & contracts/music-provider.example.json:
 *   - Suno exclusive; official MCP (https://api.suno.com/mcp) or owner manual export only.
 *   - REST API disabled in baseline; no unofficial endpoints, cookies, or paid fallback.
 *   - Live generation fails closed unless owner approval, plan verification, and explicit
 *     credit/download/attempt budgets are present.
 *   - Runtime generation is forbidden; missing BGM degrades to silence.
 *   - Secrets (OAuth tokens, cookies, temporary download URLs) are stripped from receipts.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export const OFFICIAL_SUNO_MCP_URL = 'https://api.suno.com/mcp';
export const SUPPORTED_AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.ogg', '.m4a']);
const SECRET_KEY_RE = /(token|cookie|secret|password|authorization|api_key|download_url|signed_url)/i;

function isRemoteReference(value) {
  return /^(?:https?|rtsp|rtmp|ftp|ftps|s3|gs|file|data):/i.test(String(value)) || String(value).startsWith('//');
}

export function sanitizeMusicReceipt(obj) {
  if (Array.isArray(obj)) return obj.map(sanitizeMusicReceipt);
  if (!obj || typeof obj !== 'object') return obj;
  const clean = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SECRET_KEY_RE.test(key)) continue;
    clean[key] = sanitizeMusicReceipt(val);
  }
  return clean;
}

export function validateMusicProviderConfig(config) {
  const errors = [];
  if (!config || typeof config !== 'object') {
    return { ok: false, errors: ['Provider config must be an object.'] };
  }
  if (config.provider !== 'suno') {
    errors.push(`Unsupported music provider "${config.provider}"; only "suno" is allowed.`);
  }
  if (config.selected_transport !== 'official_mcp' && config.selected_transport !== 'owner_manual_suno_download') {
    errors.push(`Invalid transport "${config.selected_transport}"; must be "official_mcp" or "owner_manual_suno_download".`);
  }
  if (config.selected_transport === 'official_mcp' && config.mcp_url !== OFFICIAL_SUNO_MCP_URL) {
    errors.push(`Official MCP URL must be "${OFFICIAL_SUNO_MCP_URL}".`);
  }
  if (config.rest?.enabled === true || config.rest?.allowed_in_baseline === true) {
    errors.push('Suno REST API is excluded from the baseline and must remain disabled.');
  }
  if (config.automatic_paid_fallback === true) {
    errors.push('Automatic paid fallback is forbidden.');
  }
  if (config.runtime_generation === true) {
    errors.push('Runtime music generation is forbidden.');
  }
  if (config.preserve_native_dialogue !== true) {
    errors.push('preserve_native_dialogue must be true.');
  }
  if (config.missing_bgm !== 'silence') {
    errors.push('missing_bgm must degrade to "silence".');
  }
  return { ok: errors.length === 0, errors };
}

export function validateMusicCueSheet(cueSheet, episode = null) {
  const errors = [];
  if (!cueSheet || typeof cueSheet !== 'object') {
    return { ok: false, errors: ['Cue sheet must be an object.'] };
  }
  if (cueSheet.provider !== 'suno') {
    errors.push('Cue sheet provider must be "suno".');
  }
  if (cueSheet.runtime_generation !== false) {
    errors.push('Cue sheet runtime_generation must be false.');
  }
  if (cueSheet.preserve_native_dialogue !== true) {
    errors.push('Cue sheet preserve_native_dialogue must be true.');
  }
  if (cueSheet.missing_bgm !== 'silence') {
    errors.push('Cue sheet missing_bgm must be "silence".');
  }
  if (!Array.isArray(cueSheet.cues) || cueSheet.cues.length === 0) {
    errors.push('Cue sheet must contain at least one cue.');
    return { ok: false, errors };
  }

  const sceneIds = episode ? new Set(episode.scenes.map((s) => s.id)) : null;
  if (episode && cueSheet.episode_id !== episode.id) {
    errors.push(`Cue sheet episode_id "${cueSheet.episode_id}" does not match episode "${episode.id}".`);
  }

  const seenIds = new Set();
  for (const cue of cueSheet.cues) {
    if (!cue || typeof cue !== 'object') {
      errors.push('Each cue must be an object.');
      continue;
    }
    if (!/^BGM-\d+$/.test(String(cue.cue_id ?? ''))) {
      errors.push(`Invalid cue_id "${cue.cue_id}"; expected BGM-###.`);
    } else if (seenIds.has(cue.cue_id)) {
      errors.push(`Duplicate cue_id "${cue.cue_id}".`);
    } else {
      seenIds.add(cue.cue_id);
    }

    const prompt = String(cue.prompt ?? '');
    if (!/instrumental/i.test(prompt)) {
      errors.push(`Cue ${cue.cue_id} prompt must explicitly require instrumental output.`);
    }
    if (!/no vocals/i.test(prompt)) {
      errors.push(`Cue ${cue.cue_id} prompt must explicitly exclude vocals.`);
    }
    if (cue.duck_under_dialogue !== true) {
      errors.push(`Cue ${cue.cue_id} must enable duck_under_dialogue.`);
    }

    const anchors = Array.isArray(cue.scene_anchors) && cue.scene_anchors.length > 0
      ? cue.scene_anchors
      : cue.scene_anchor
        ? [cue.scene_anchor]
        : [];
    if (anchors.length === 0) {
      errors.push(`Cue ${cue.cue_id} must declare at least one scene anchor.`);
    }
    if (sceneIds) {
      for (const anchor of anchors) {
        if (!sceneIds.has(anchor)) {
          errors.push(`Cue ${cue.cue_id} references unknown scene "${anchor}".`);
        }
      }
    }

    if (cue.asset_path !== null && cue.asset_path !== undefined) {
      if (isRemoteReference(cue.asset_path)) {
        errors.push(`Cue ${cue.cue_id} asset_path must be local; remote URLs are forbidden.`);
      }
    }
    if (cueSheet.status === 'draft' && (cue.asset_id !== null || cue.song_id !== null)) {
      errors.push(`Draft cue ${cue.cue_id} must not invent asset_id or song_id.`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Guarded builder for a future official Suno MCP generation request.
 * Fails closed unless live_enabled, owner_approval, verified plan, and explicit budgets are supplied.
 */
export function buildSunoMcpRequest({ providerConfig, cue, approval }) {
  const cfgCheck = validateMusicProviderConfig(providerConfig);
  if (!cfgCheck.ok) {
    throw new Error(`Invalid Suno provider config: ${cfgCheck.errors.join(' ')}`);
  }
  if (providerConfig.selected_transport !== 'official_mcp') {
    throw new Error('MCP request blocked: selected_transport is not "official_mcp".');
  }
  if (providerConfig.live_enabled !== true) {
    throw new Error('Live Suno generation blocked: live_enabled is false.');
  }
  if (providerConfig.plan_verified !== true) {
    throw new Error('Live Suno generation blocked: Suno plan is not verified.');
  }
  if (!approval || approval.owner_approved !== true) {
    throw new Error('Live Suno generation blocked: explicit owner approval is required.');
  }
  const budgets = ['credit_budget', 'download_budget', 'max_attempts'];
  for (const field of budgets) {
    const val = approval[field] ?? providerConfig[field];
    if (!Number.isInteger(val) || val <= 0) {
      throw new Error(`Live Suno generation blocked: positive integer ${field} is required.`);
    }
  }
  if (!cue || !/^BGM-\d+$/.test(String(cue.cue_id ?? ''))) {
    throw new Error('Valid cue with cue_id is required.');
  }
  if (!/instrumental/i.test(String(cue.prompt ?? ''))) {
    throw new Error(`Cue ${cue.cue_id} must be instrumental-only.`);
  }

  return sanitizeMusicReceipt({
    transport: 'official_mcp',
    mcp_url: OFFICIAL_SUNO_MCP_URL,
    cue_id: cue.cue_id,
    instrumental: true,
    prompt: cue.prompt,
    loop_candidate: Boolean(cue.loop),
    budget: {
      credit_budget: approval.credit_budget ?? providerConfig.credit_budget,
      download_budget: approval.download_budget ?? providerConfig.download_budget,
      max_attempts: approval.max_attempts ?? providerConfig.max_attempts
    }
  });
}

/**
 * Import an owner-downloaded or MCP-exported local Suno audio file and emit a sanitized
 * provenance receipt (never performs network calls; never logs tokens or download URLs).
 */
export function importManualSunoTrack({
  cueId,
  localPath,
  songId,
  source = 'owner_manual_suno_download',
  planAtCreation = 'unknown',
  createdAt = null,
  downloadedAt = null,
  rightsStatus = 'pending_owner_review',
  creditUsage = 'unknown',
  downloadUsage = 'unknown',
  baseDir = process.cwd(),
  extraMetadata = {}
}) {
  if (!/^BGM-\d+$/.test(String(cueId ?? ''))) {
    throw new Error(`Invalid cueId "${cueId}".`);
  }
  if (!localPath || typeof localPath !== 'string') {
    throw new Error('localPath is required.');
  }
  if (isRemoteReference(localPath)) {
    throw new Error(`Remote audio path rejected: ${localPath}`);
  }
  if (!songId || typeof songId !== 'string' || !songId.trim()) {
    throw new Error('Actual Suno songId is required for provenance.');
  }
  const ext = path.extname(localPath).toLowerCase();
  if (!SUPPORTED_AUDIO_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported audio extension "${ext}". Supported: ${[...SUPPORTED_AUDIO_EXTENSIONS].join(', ')}`);
  }

  const resolved = path.isAbsolute(localPath) ? localPath : path.resolve(baseDir, localPath);
  const st = statSync(resolved);
  if (!st.isFile() || st.size <= 0) {
    throw new Error(`Local audio file must be a non-empty regular file: ${localPath}`);
  }

  const buf = readFileSync(resolved);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const relativePath = path.relative(baseDir, resolved).split(path.sep).join('/');

  return sanitizeMusicReceipt({
    ...extraMetadata,
    cue_id: cueId,
    provider: 'suno',
    source,
    song_id: songId.trim(),
    local_path: relativePath,
    format: ext.slice(1),
    size_bytes: st.size,
    sha256,
    plan_at_creation: planAtCreation,
    created_at: createdAt,
    downloaded_at: downloadedAt,
    credit_usage: creditUsage,
    download_usage: downloadUsage,
    rights_status: rightsStatus,
    preserve_native_dialogue: true
  });
}
