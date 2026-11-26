// Deterministic BGM cue resolver and separate-track browser audio controller.
// Pure state resolution works in Node tests without DOM; browser adapter keeps
// BGM strictly separate from native H3 video/dialogue audio and degrades to silence.

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isRemoteSrc(src) {
  return /^(?:https?|rtsp|rtmp|ftp|ftps|s3|gs|data):/i.test(String(src)) || String(src).startsWith('//');
}

export function findCueForScene(cueSheet, sceneId) {
  if (!cueSheet || !Array.isArray(cueSheet.cues) || !sceneId) return null;
  for (const cue of cueSheet.cues) {
    const anchors = Array.isArray(cue.scene_anchors) && cue.scene_anchors.length > 0
      ? cue.scene_anchors
      : cue.scene_anchor
        ? [cue.scene_anchor]
        : [];
    if (anchors.includes(sceneId)) return cue;
  }
  return null;
}

export function isDialogueDuckingActive(scene, beat) {
  if (!scene) return false;
  // Always duck under native video audio (ambience or H3 native dialogue)
  if (scene.media?.type === 'video') return true;
  // Always duck under pre-rendered beat voiceover (IndexTTS-2.5)
  if (typeof beat?.audio === 'string' && beat.audio.trim()) return true;
  // Duck under non-narrator character dialogue beats
  const speaker = String(beat?.speaker ?? '').trim();
  if (speaker && speaker !== '旁白') return true;
  return false;
}

export function resolveBgmState({
  cueSheet = null,
  scene = null,
  beat = null,
  muted = false,
  isPlaying = true,
  bgmVolume = 1,
  bgmError = false
} = {}) {
  const defaults = cueSheet?.defaults ?? {};
  const cue = findCueForScene(cueSheet, scene?.id);

  if (!cue || !cue.asset_path || isRemoteSrc(cue.asset_path) || bgmError) {
    return {
      mode: 'silence_fallback',
      cueId: cue?.cue_id ?? null,
      title: cue?.title ?? null,
      src: null,
      loop: false,
      ducked: false,
      targetGain: 0,
      fadeMs: Number(cue?.fade_ms ?? defaults.fade_ms ?? 600)
    };
  }

  const baseGain = clamp01(cue.base_gain ?? defaults.base_gain ?? 0.65);
  const duckGain = clamp01(cue.duck_gain ?? defaults.duck_gain ?? 0.25);
  const fadeMs = Math.max(0, Number(cue.fade_ms ?? defaults.fade_ms ?? 600));
  const ducked = cue.duck_under_dialogue !== false && isDialogueDuckingActive(scene, beat);

  if (muted) {
    return {
      mode: 'muted',
      cueId: cue.cue_id,
      title: cue.title ?? cue.cue_id,
      src: cue.asset_path,
      loop: Boolean(cue.loop),
      ducked,
      targetGain: 0,
      fadeMs
    };
  }

  if (!isPlaying) {
    return {
      mode: 'paused',
      cueId: cue.cue_id,
      title: cue.title ?? cue.cue_id,
      src: cue.asset_path,
      loop: Boolean(cue.loop),
      ducked,
      targetGain: 0,
      fadeMs
    };
  }

  const gain = Number((baseGain * (ducked ? duckGain : 1) * clamp01(bgmVolume)).toFixed(4));
  return {
    mode: 'playing',
    cueId: cue.cue_id,
    title: cue.title ?? cue.cue_id,
    src: cue.asset_path,
    loop: Boolean(cue.loop),
    ducked,
    targetGain: gain,
    fadeMs
  };
}

export function createBrowserBgmAdapter({ AudioCtor = globalThis.Audio, onError = () => {} } = {}) {
  if (typeof AudioCtor !== 'function') {
    return {
      sync() {},
      unlock() {},
      destroy() {},
      getStatus() {
        return { activeSrc: null, autoplayBlocked: false };
      }
    };
  }

  const audio = new AudioCtor();
  audio.preload = 'auto';

  let activeSrc = null;
  let lastState = null;
  let autoplayBlocked = false;
  let fadeTimer = null;

  audio.addEventListener('error', () => {
    if (activeSrc) {
      activeSrc = null;
      onError();
    }
  });

  function clearFade() {
    if (fadeTimer) {
      clearInterval(fadeTimer);
      fadeTimer = null;
    }
  }

  function rampVolume(target, fadeMs) {
    clearFade();
    const clampedTarget = clamp01(target);
    if (!fadeMs || fadeMs <= 0) {
      audio.volume = clampedTarget;
      return;
    }
    const start = clamp01(audio.volume);
    const steps = Math.max(1, Math.round(fadeMs / 40));
    let step = 0;
    fadeTimer = setInterval(() => {
      step += 1;
      const ratio = Math.min(1, step / steps);
      audio.volume = clamp01(start + (clampedTarget - start) * ratio);
      if (ratio >= 1) clearFade();
    }, 40);
  }

  function tryPlay() {
    try {
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') {
        promise.then(
          () => {
            autoplayBlocked = false;
          },
          () => {
            autoplayBlocked = true;
          }
        );
      }
    } catch {
      autoplayBlocked = true;
    }
  }

  function sync(bgmState) {
    lastState = bgmState;
    if (!bgmState || bgmState.mode === 'silence_fallback' || !bgmState.src) {
      clearFade();
      audio.pause();
      activeSrc = null;
      return;
    }

    const srcChanged = activeSrc !== bgmState.src;
    if (srcChanged) {
      activeSrc = bgmState.src;
      audio.src = bgmState.src;
      audio.volume = 0;
    }
    audio.loop = Boolean(bgmState.loop);
    audio.muted = bgmState.mode === 'muted';

    if (bgmState.mode === 'playing') {
      tryPlay();
      rampVolume(bgmState.targetGain, bgmState.fadeMs);
    } else if (bgmState.mode === 'paused') {
      rampVolume(0, Math.min(200, bgmState.fadeMs));
      audio.pause();
    } else if (bgmState.mode === 'muted') {
      rampVolume(0, 0);
    }
  }

  function unlock() {
    if (autoplayBlocked && lastState?.mode === 'playing' && activeSrc) {
      tryPlay();
    }
  }

  function destroy() {
    clearFade();
    audio.pause();
    activeSrc = null;
  }

  return {
    sync,
    unlock,
    destroy,
    getStatus() {
      return { activeSrc, autoplayBlocked };
    }
  };
}
