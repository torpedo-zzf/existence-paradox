// Versioned local save storage with corrupt-save recovery.
// Never store API keys, tokens, or provider credentials in browser storage.

import { createInitialState, validateStateForEpisode } from '../core/runtime.mjs';

export const SAVE_SCHEMA_VERSION = 1;
export const DEFAULT_SAVE_KEY = 'existence_paradox_save_v1';

export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); }
  };
}

export function saveState(storage, key, ep, state) {
  const check = validateStateForEpisode(ep, state);
  if (!check.valid) {
    throw new Error(`Cannot save invalid state: ${check.reason}`);
  }
  const envelope = {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    episodeId: ep.id,
    episodeVersion: ep.version,
    state
  };
  storage.setItem(key, JSON.stringify(envelope));
  return { ok: true, envelope };
}

function recoverCorruptSlot(storage, key, raw, reason, ep) {
  try {
    if (typeof raw === 'string' && raw.length > 0 && raw.length <= 65536) {
      storage.setItem(`${key}:corrupt_backup`, raw);
    }
    storage.removeItem(key);
  } catch {
    // Ignore secondary storage errors during recovery
  }
  return {
    status: 'recovered',
    reason,
    savedAt: null,
    state: createInitialState(ep)
  };
}

export function loadState(storage, key, ep) {
  let raw = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return {
      status: 'recovered',
      reason: 'Storage read error',
      savedAt: null,
      state: createInitialState(ep)
    };
  }

  if (raw === null || raw === undefined || raw === '') {
    return {
      status: 'empty',
      reason: null,
      savedAt: null,
      state: createInitialState(ep)
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return recoverCorruptSlot(storage, key, raw, 'Corrupt JSON payload', ep);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return recoverCorruptSlot(storage, key, raw, 'Invalid save envelope', ep);
  }
  if (parsed.schemaVersion !== SAVE_SCHEMA_VERSION) {
    return recoverCorruptSlot(storage, key, raw, `Unsupported save schemaVersion: ${parsed.schemaVersion}`, ep);
  }
  if (parsed.episodeId !== ep.id || parsed.episodeVersion !== ep.version) {
    return recoverCorruptSlot(storage, key, raw, 'Episode or version mismatch', ep);
  }

  const check = validateStateForEpisode(ep, parsed.state);
  if (!check.valid) {
    return recoverCorruptSlot(storage, key, raw, `Invalid saved state: ${check.reason}`, ep);
  }

  return {
    status: 'loaded',
    reason: null,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
    state: parsed.state
  };
}

export function resetSave(storage, key, ep, { preserveEndings = false } = {}) {
  let endings = [];
  if (preserveEndings) {
    const existing = loadState(storage, key, ep);
    if (existing.status === 'loaded') {
      endings = existing.state.completedEndings;
    }
  }
  const fresh = createInitialState(ep, endings);
  if (preserveEndings && endings.length > 0) {
    saveState(storage, key, ep, fresh);
  } else {
    storage.removeItem(key);
  }
  return fresh;
}
