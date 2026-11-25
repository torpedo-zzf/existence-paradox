// Local OmniVoice adapter contract & validation guard for VOICE-208.
// Enforces H3 reference-audio limits (2-15s per clip, max 3 clips, <=15s total) and rights gates.

export const H3_AUDIO_MIN_SECONDS = 2;
export const H3_AUDIO_MAX_SECONDS = 15;
export const H3_AUDIO_MAX_CLIPS = 3;
export const H3_AUDIO_MAX_TOTAL_SECONDS = 15;

export function validateVoiceClip(clip) {
  if (!clip || typeof clip !== 'object') throw new Error('Voice clip must be an object');
  if (typeof clip.voice_id !== 'string' || !clip.voice_id.trim()) throw new Error('voice_id is required');
  if (typeof clip.file_path !== 'string' || !/\.(wav|mp3)$/i.test(clip.file_path)) {
    throw new Error('Only WAV/MP3 reference audio files are permitted');
  }
  if (typeof clip.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(clip.sha256)) {
    throw new Error('Valid 64-char SHA-256 checksum is required');
  }
  if (typeof clip.duration_seconds !== 'number' || clip.duration_seconds < H3_AUDIO_MIN_SECONDS || clip.duration_seconds > H3_AUDIO_MAX_SECONDS) {
    throw new Error(`Reference audio duration must be ${H3_AUDIO_MIN_SECONDS}-${H3_AUDIO_MAX_SECONDS}s`);
  }
  if (typeof clip.transcript !== 'string' || !clip.transcript.trim()) {
    throw new Error('Exact transcript is required');
  }
  if (!clip.rights_status || clip.rights_status === 'unverified') {
    throw new Error('Voice rights status must be explicitly recorded');
  }
  return true;
}

export function validateH3AudioReferenceBatch(clips) {
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error('At least one voice reference clip is required');
  }
  if (clips.length > H3_AUDIO_MAX_CLIPS) {
    throw new Error(`At most ${H3_AUDIO_MAX_CLIPS} audio reference clips allowed per H3 request`);
  }
  let total = 0;
  for (const clip of clips) {
    validateVoiceClip(clip);
    total += clip.duration_seconds;
  }
  if (total > H3_AUDIO_MAX_TOTAL_SECONDS) {
    throw new Error(`Total audio reference duration (${total}s) exceeds H3 ${H3_AUDIO_MAX_TOTAL_SECONDS}s limit`);
  }
  return { valid: true, clipCount: clips.length, totalSeconds: Number(total.toFixed(3)) };
}
