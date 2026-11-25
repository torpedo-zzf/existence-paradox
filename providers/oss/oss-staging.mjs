// Private Aliyun OSS temporary staging adapter (OSS-207).
// Uses official Aliyun OSS SDK (oss2) via isolated helper; never persists or logs signed URLs.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.wav', '.mp3']);

export function buildStagingObjectKey(prefix, sha256, ext) {
  const cleanPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const cleanExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
  if (!ALLOWED_EXTS.has(cleanExt)) throw new Error(`Unsupported media extension: ${cleanExt}`);
  if (!/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Invalid SHA-256 checksum');
  return `${cleanPrefix}${sha256.toLowerCase()}${cleanExt}`;
}

export function sanitizeStagingReceipt(result) {
  // Explicitly strip signed_url so bearer-like URLs are NEVER persisted to manifests or logs.
  const { signed_url: _redacted, ...safe } = result;
  return safe;
}

export function stageAssetToPrivateOss({
  localPath,
  env = process.env,
  approved = false,
  execute = spawnSync
}) {
  if (!approved) throw new Error('Explicit owner upload approval is required before OSS staging');
  if (!localPath || !existsSync(localPath)) throw new Error(`Local asset not found: ${localPath}`);
  const ext = path.extname(localPath).toLowerCase();
  if (!ALLOWED_EXTS.has(ext)) throw new Error(`Unsupported media extension: ${ext}`);

  const pyBin = path.join(ROOT, '.venv/oss/bin/python');
  const helper = path.join(ROOT, 'providers/oss/oss_sdk_helper.py');
  const res = execute(pyBin, [helper, localPath], {
    env,
    encoding: 'utf8',
    timeout: 60000
  });

  if (res.error || res.status !== 0) {
    throw new Error(`OSS staging failed (exit=${res.status ?? 'err'})`);
  }

  const parsed = JSON.parse(res.stdout);
  if (!parsed.ok || !parsed.signed_url || !parsed.signed_url.startsWith('https://')) {
    throw new Error('OSS staging did not return a valid HTTPS signed GET URL');
  }

  return {
    receipt: sanitizeStagingReceipt(parsed),
    ephemeralSignedUrl: parsed.signed_url
  };
}
