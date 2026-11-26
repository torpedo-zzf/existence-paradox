// Local IndexTTS-2.5 beat-voiceover adapter contract & validation guard.
// Enforces local-only pre-rendered voiceovers, SHA-256 provenance, approved synthetic
// reference voices, no runtime TTS generation, and strict preservation of native H3 dialogue.

const REMOTE_RE = /^(?:https?|rtsp|rtmp|ftp|ftps|s3|gs|file|data):/i;
export const APPROVED_SYNTHETIC_REFERENCES = new Set([
  'VOICE-001-master-r2.wav',
  'VOICE-002.wav'
]);

export function validateIndexTtsBeatClip(clip, { nativeDialogueSceneIds = new Set(['lin_call']) } = {}) {
  if (!clip || typeof clip !== 'object') throw new Error('Beat voice clip must be an object');
  if (typeof clip.scene_id !== 'string' || !clip.scene_id.trim()) throw new Error('scene_id is required');
  if (nativeDialogueSceneIds.has(clip.scene_id)) {
    throw new Error(`Forced post-dub over native-dialogue scene "${clip.scene_id}" is forbidden`);
  }
  if (typeof clip.beat_id !== 'string' || !clip.beat_id.trim()) throw new Error('beat_id is required');
  if (typeof clip.mp3_path !== 'string' || REMOTE_RE.test(clip.mp3_path) || !clip.mp3_path.endsWith('.mp3')) {
    throw new Error('mp3_path must be a local .mp3 path');
  }
  if (typeof clip.mp3_sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(clip.mp3_sha256)) {
    throw new Error('Valid 64-char mp3_sha256 checksum is required');
  }
  if (typeof clip.duration_seconds !== 'number' || !Number.isFinite(clip.duration_seconds) || clip.duration_seconds <= 0) {
    throw new Error('duration_seconds must be a positive number');
  }
  if (!APPROVED_SYNTHETIC_REFERENCES.has(clip.reference_voice)) {
    throw new Error(`Unapproved reference voice "${clip.reference_voice}"; only approved original synthetic references are permitted`);
  }
  return true;
}

export function validateIndexTtsManifest(manifest, episode = null) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['Manifest must be an object'] };
  }
  if (manifest.provider !== 'indextts_local') {
    errors.push('provider must be "indextts_local"');
  }
  if (manifest.runtime_generation !== false) {
    errors.push('runtime_generation must be false');
  }
  if (manifest.preserve_native_dialogue !== true) {
    errors.push('preserve_native_dialogue must be true');
  }
  if (!Array.isArray(manifest.deliverables) || manifest.deliverables.length === 0) {
    errors.push('deliverables must be a non-empty array');
    return { ok: false, errors };
  }

  const nativeScenes = new Set(manifest.preserved_native_dialogue_scenes ?? ['lin_call']);
  const seen = new Set();
  for (const clip of manifest.deliverables) {
    const key = `${clip?.scene_id}:${clip?.beat_id}`;
    if (seen.has(key)) errors.push(`Duplicate beat deliverable "${key}"`);
    seen.add(key);
    try {
      validateIndexTtsBeatClip(clip, { nativeDialogueSceneIds: nativeScenes });
    } catch (err) {
      errors.push(`${key}: ${err.message}`);
    }
    if (episode) {
      const scene = episode.scenes.find((s) => s.id === clip.scene_id);
      if (!scene) errors.push(`Unknown scene_id "${clip.scene_id}"`);
      else if (!scene.beats.some((b) => b.id === clip.beat_id)) {
        errors.push(`Unknown beat_id "${clip.beat_id}" in scene "${clip.scene_id}"`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
