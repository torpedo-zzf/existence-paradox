// Pure UI controller for the local interactive-cinema player.
// Works identically in browser and Node tests without DOM dependencies.

import {
  validateSliceEpisode,
  getCurrentScene,
  evaluateChoices,
  applyChoice,
  restartEpisode
} from '../core/runtime.mjs';
import {
  DEFAULT_SAVE_KEY,
  saveState,
  loadState,
  resetSave
} from '../storage/save-store.mjs';

export function createPlayerController({ episode, storage, saveKey = DEFAULT_SAVE_KEY }) {
  validateSliceEpisode(episode);
  const loaded = loadState(storage, saveKey, episode);

  const ui = {
    state: loaded.state,
    beatIndex: 0,
    isPlaying: true,
    subtitlesEnabled: true,
    muted: false,
    journalOpen: false,
    mediaError: false,
    banner:
      loaded.status === 'recovered'
        ? `检测到异常存档，已自动恢复到安全初始状态（原因：${loaded.reason}）`
        : loaded.status === 'loaded'
          ? '已从本地存档恢复进度'
          : null
  };

  const listeners = new Set();
  const emit = () => {
    const snapshot = getViewModel();
    for (const fn of listeners) fn(snapshot);
  };

  function getViewModel() {
    const scene = getCurrentScene(episode, ui.state);
    const { available, locked } = evaluateChoices(episode, ui.state);
    const beat = scene.beats[ui.beatIndex] ?? scene.beats[scene.beats.length - 1];
    const isLastBeat = ui.beatIndex >= scene.beats.length - 1;
    const collectedEvidence = episode.evidence.filter((e) => ui.state.evidence.includes(e.id));
    const totalEndings = episode.scenes.filter((s) => Boolean(s.ending)).length;

    return {
      episodeTitle: episode.title,
      episodeSubtitle: episode.subtitle ?? '',
      scene,
      beat,
      beatIndex: ui.beatIndex,
      beatCount: scene.beats.length,
      isLastBeat,
      isPlaying: ui.isPlaying,
      subtitlesEnabled: ui.subtitlesEnabled,
      muted: ui.muted,
      journalOpen: ui.journalOpen,
      mediaFallbackActive: scene.media.type === 'placeholder' || !scene.media.src || ui.mediaError,
      availableChoices: available,
      lockedChoices: locked,
      evidence: collectedEvidence,
      totalEvidenceCount: episode.evidence.length,
      trust: ui.state.trust,
      completedEndings: [...ui.state.completedEndings],
      totalEndings,
      banner: ui.banner,
      state: ui.state
    };
  }

  function advanceBeat() {
    const scene = getCurrentScene(episode, ui.state);
    if (ui.beatIndex < scene.beats.length - 1) {
      ui.beatIndex += 1;
      emit();
      return true;
    }
    ui.isPlaying = false;
    emit();
    return false;
  }

  function replayScene() {
    ui.beatIndex = 0;
    ui.isPlaying = true;
    ui.mediaError = false;
    emit();
  }

  function togglePlay() {
    const scene = getCurrentScene(episode, ui.state);
    if (!ui.isPlaying && ui.beatIndex >= scene.beats.length - 1) {
      ui.beatIndex = 0;
    }
    ui.isPlaying = !ui.isPlaying;
    emit();
  }

  function toggleSubtitles() {
    ui.subtitlesEnabled = !ui.subtitlesEnabled;
    emit();
  }

  function toggleMute() {
    ui.muted = !ui.muted;
    emit();
  }

  function toggleJournal(force) {
    ui.journalOpen = typeof force === 'boolean' ? force : !ui.journalOpen;
    emit();
  }

  function reportMediaError() {
    ui.mediaError = true;
    ui.banner = '媒体资源暂未就绪，已自动降级为离线占位画面（不影响剧情推进）';
    emit();
  }

  function dismissBanner() {
    ui.banner = null;
    emit();
  }

  function selectChoice(choiceId) {
    ui.state = applyChoice(episode, ui.state, choiceId);
    ui.beatIndex = 0;
    ui.isPlaying = true;
    ui.mediaError = false;
    ui.banner = null;
    saveState(storage, saveKey, episode, ui.state);
    emit();
  }

  function restart({ preserveEndings = true } = {}) {
    ui.state = restartEpisode(episode, ui.state, { preserveEndings });
    ui.beatIndex = 0;
    ui.isPlaying = true;
    ui.mediaError = false;
    ui.journalOpen = false;
    ui.banner = preserveEndings ? '已重新开始本切片（已解锁结局记录已保留）' : '已重置全部本地进度';
    if (preserveEndings) {
      saveState(storage, saveKey, episode, ui.state);
    } else {
      resetSave(storage, saveKey, episode, { preserveEndings: false });
    }
    emit();
  }

  function handleKey(key) {
    if (key === 'j' || key === 'J') {
      toggleJournal();
      return true;
    }
    if (key === 'Escape' && ui.journalOpen) {
      toggleJournal(false);
      return true;
    }
    if (ui.journalOpen) return false;
    if (key === ' ' || key === 'Enter') {
      if (!advanceBeat()) togglePlay();
      return true;
    }
    if (key === 'c' || key === 'C') {
      toggleSubtitles();
      return true;
    }
    if (key === 'r' || key === 'R') {
      replayScene();
      return true;
    }
    if (/^[1-9]$/.test(key)) {
      const idx = Number(key) - 1;
      const vm = getViewModel();
      if (vm.isLastBeat && vm.availableChoices[idx]) {
        selectChoice(vm.availableChoices[idx].id);
        return true;
      }
    }
    return false;
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(getViewModel());
    return () => listeners.delete(fn);
  }

  return {
    getViewModel,
    advanceBeat,
    replayScene,
    togglePlay,
    toggleSubtitles,
    toggleMute,
    toggleJournal,
    reportMediaError,
    dismissBanner,
    selectChoice,
    restart,
    handleKey,
    subscribe
  };
}
