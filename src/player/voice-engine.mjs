// Deterministic beat voiceover audio resolver and separate-track browser adapter.
// Plays pre-rendered local IndexTTS-2.5 voiceovers for non-speaking-video beats,
// never performs runtime TTS, never overwrites native H3 video speech, and degrades
// cleanly to subtitle-only playback when audio is absent or fails to load.

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isRemoteSrc(src) {
  return /^(?:https?|rtsp|rtmp|ftp|ftps|s3|gs|data):/i.test(String(src)) || String(src).startsWith('//');
}

export function resolveVoiceState({
  scene = null,
  beat = null,
  muted = false,
  isPlaying = true,
  voiceVolume = 1,
  voiceError = false,
  replayToken = 0
} = {}) {
  const src = typeof beat?.audio === 'string' && beat.audio.trim() ? beat.audio.trim() : null;

  if (!scene || !beat || !src || isRemoteSrc(src) || voiceError) {
    return {
      mode: 'subtitle_only',
      sceneId: scene?.id ?? null,
      beatId: beat?.id ?? null,
      src: null,
      targetVolume: 0,
      replayToken
    };
  }

  if (muted) {
    return {
      mode: 'muted',
      sceneId: scene.id,
      beatId: beat.id,
      src,
      targetVolume: 0,
      replayToken
    };
  }

  if (!isPlaying) {
    return {
      mode: 'paused',
      sceneId: scene.id,
      beatId: beat.id,
      src,
      targetVolume: clamp01(voiceVolume),
      replayToken
    };
  }

  return {
    mode: 'playing',
    sceneId: scene.id,
    beatId: beat.id,
    src,
    targetVolume: clamp01(voiceVolume),
    replayToken
  };
}

export function createBrowserVoiceAdapter({ AudioCtor = globalThis.Audio, onError = () => {} } = {}) {
  if (typeof AudioCtor !== 'function') {
    return {
      sync() {},
      unlock() {},
      destroy() {},
      getStatus() {
        return { activeKey: null, autoplayBlocked: false };
      }
    };
  }

  const audio = new AudioCtor();
  audio.preload = 'auto';
  audio.loop = false;

  let activeKey = null;
  let lastState = null;
  let autoplayBlocked = false;

  audio.addEventListener('error', () => {
    if (activeKey) {
      activeKey = null;
      onError();
    }
  });

  function tryPlay() {
    try {
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') {
        promise.then(
          () => { autoplayBlocked = false; },
          () => { autoplayBlocked = true; }
        );
      }
    } catch {
      autoplayBlocked = true;
    }
  }

  function sync(voiceState) {
    lastState = voiceState;
    if (!voiceState || voiceState.mode === 'subtitle_only' || !voiceState.src) {
      audio.pause();
      activeKey = null;
      return;
    }

    const nextKey = `${voiceState.src}#${voiceState.replayToken ?? 0}`;
    const changed = activeKey !== nextKey;
    if (changed) {
      activeKey = nextKey;
      audio.src = voiceState.src;
      try { audio.currentTime = 0; } catch {}
    }

    audio.muted = voiceState.mode === 'muted';
    audio.volume = clamp01(voiceState.targetVolume);

    if (voiceState.mode === 'playing') {
      tryPlay();
    } else if (voiceState.mode === 'paused') {
      audio.pause();
    }
  }

  function unlock() {
    if (autoplayBlocked && lastState?.mode === 'playing' && activeKey) {
      tryPlay();
    }
  }

  function destroy() {
    audio.pause();
    activeKey = null;
  }

  return {
    sync,
    unlock,
    destroy,
    getStatus() {
      return { activeKey, autoplayBlocked };
    }
  };
}
