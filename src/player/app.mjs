// Browser entrypoint for the GTA/Rockstar-inspired full-bleed interactive-cinema player.
// Decluttered corner HUD, scene-mood color fusion, persistent media stage (zero <video>
// restart on beat changes), inline Rockstar-style subtitles, and bottom tactical menu sheet.

import { createPlayerController } from './controller.mjs';
import { createBrowserBgmAdapter } from './bgm-engine.mjs';
import { createBrowserVoiceAdapter } from './voice-engine.mjs';

const RELIABILITY_LABEL = {
  verified: '已核实',
  unverified: '待核实',
  contradictory: '存在矛盾'
};

const SCENE_FEED = {
  wake: {
    kicker: 'ID ALERT // 72H',
    title: '公民身份已永久注销',
    sub: '原因：自然人已死亡'
  },
  terminal_check: {
    kicker: 'LOCAL CACHE',
    title: '2 项未同步异常',
    sub: '玄关掌纹日志 · 诊所加密回执'
  },
  door_anomaly: {
    kicker: 'BIOMETRIC LOG',
    title: '22:18 掌纹验证 99.8%',
    sub: '离开室内 · 无重新进入记录'
  },
  clinic_clue: {
    kicker: 'CONTINUITY CLINIC',
    title: '双轨同步已完成',
    sub: '状态：异常体待回收'
  },
  lin_call: {
    kicker: 'E2EE LIVE CALL',
    title: '来电 · 林',
    sub: '加密视频线路已接通'
  },
  crossroads: {
    kicker: 'FLOOR 14 // ALERT',
    title: '电梯已抵达本层',
    sub: '脚步声逼近玄关'
  },
  ending_archive: {
    kicker: 'ROUTE A // LOCKED',
    title: '静默封存',
    sub: '离线证据已写入'
  },
  ending_meeting: {
    kicker: 'ROUTE B // ESCAPE',
    title: '街角双影',
    sub: '消防通道撤离'
  }
};

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getSpeakerClass(speaker) {
  const s = String(speaker ?? '').trim();
  if (s === '林') return 'is-lin';
  if (s !== '你' && s !== '旁白') return 'is-system';
  return '';
}

async function boot() {
  const root = document.getElementById('app');
  let episode;
  try {
    const res = await fetch('./episodes/01/slice.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    episode = await res.json();
  } catch (err) {
    root.innerHTML = `<div class="fatal-box"><h1>无法加载本地剧情数据</h1><p>${escapeHtml(err.message)}</p><p>请通过本地静态服务（例如 <code>npm run play</code>）打开本页面。</p></div>`;
    return;
  }

  let musicCues = null;
  try {
    const cueRes = await fetch('./episodes/01/music-cues.json', { cache: 'no-store' });
    if (cueRes.ok) musicCues = await cueRes.json();
  } catch {
    // Missing optional BGM degrades cleanly to silence.
  }

  const controller = createPlayerController({
    episode,
    storage: window.localStorage,
    musicCues
  });

  const bgmAdapter = createBrowserBgmAdapter({
    onError: () => controller.reportBgmError()
  });
  const voiceAdapter = createBrowserVoiceAdapter({
    onError: () => controller.reportVoiceError()
  });

  root.innerHTML = `
    <div class="cinema-stage" id="cinema-stage" data-mood="unease">
      <div class="media-layer" id="media-layer"></div>
      <div class="cinema-vignette" aria-hidden="true"></div>
      <div class="cinema-mood-wash" aria-hidden="true"></div>
      <div class="cinema-grain" aria-hidden="true"></div>

      <header class="hud-top">
        <div class="gta-feed" id="gta-feed"></div>
        <div class="gta-corner-right" id="gta-corner-right"></div>
      </header>

      <div id="toast-slot"></div>
      <section class="hud-bottom" id="hud-bottom"></section>
      <div class="edge-progress" aria-hidden="true"><div class="edge-progress-fill" id="edge-fill"></div></div>
      <div id="sheet-slot"></div>

      <div class="title-gate" id="title-gate">
        <div class="gate-slash" aria-hidden="true"></div>
        <div class="gate-eyebrow">CHAPTER 01 // 2042-11-25</div>
        <h1 class="gate-title">存在悖论</h1>
        <div class="gate-chapter">查无此人 · NO SUCH PERSON</div>
        <button type="button" class="gate-start-btn" data-action="enter-cinema">进入章节 ▸</button>
        <div class="gate-note">建议开启声音 · 点击画面推进剧情</div>
      </div>
    </div>
  `;

  const stageEl = document.getElementById('cinema-stage');
  const mediaLayerEl = document.getElementById('media-layer');
  const gtaFeedEl = document.getElementById('gta-feed');
  const cornerRightEl = document.getElementById('gta-corner-right');
  const toastSlotEl = document.getElementById('toast-slot');
  const hudBottomEl = document.getElementById('hud-bottom');
  const edgeFillEl = document.getElementById('edge-fill');
  const sheetSlotEl = document.getElementById('sheet-slot');
  const titleGateEl = document.getElementById('title-gate');

  let entered = false;
  let menuOpen = false;
  let timerId = null;
  let mountedMediaKey = null;
  let lastSceneId = null;
  let sceneIndexParity = 0;

  function scheduleBeat(vm) {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (entered && vm.isPlaying && !vm.isLastBeat && !vm.journalOpen && !menuOpen) {
      timerId = setTimeout(() => {
        controller.advanceBeat();
      }, vm.beat.durationMs);
    }
  }

  function syncMediaLayer(vm) {
    stageEl.dataset.mood = vm.scene.mood || 'unease';
    const mediaKey = `${vm.scene.id}|${vm.mediaFallbackActive ? 'fb' : vm.scene.media.src}|${vm.voice?.replayToken ?? 0}`;

    if (mediaKey !== mountedMediaKey) {
      mountedMediaKey = mediaKey;
      sceneIndexParity = (sceneIndexParity + 1) % 2;
      mediaLayerEl.classList.add('is-fading');

      if (vm.mediaFallbackActive) {
        mediaLayerEl.innerHTML = `
          <div class="stage-placeholder">
            <div class="fallback-caption">${escapeHtml(vm.scene.media.caption)}</div>
          </div>`;
      } else if (vm.scene.media.type === 'video') {
        mediaLayerEl.innerHTML = `
          <video class="stage-video" src="${escapeHtml(vm.scene.media.src)}"
            ${vm.scene.media.poster ? `poster="${escapeHtml(vm.scene.media.poster)}"` : ''}
            playsinline ${vm.muted ? 'muted' : ''}></video>`;
        const v = mediaLayerEl.querySelector('video');
        if (v) {
          v.addEventListener('error', () => controller.reportMediaError(), { once: true });
          if (entered && vm.isPlaying && !menuOpen) v.play().catch(() => {});
        }
      } else {
        const driftClass = sceneIndexParity === 0 ? 'drift-a' : 'drift-b';
        mediaLayerEl.innerHTML = `
          <img class="stage-still ${driftClass}" src="${escapeHtml(vm.scene.media.src)}"
            alt="${escapeHtml(vm.scene.media.caption)}" />`;
        const img = mediaLayerEl.querySelector('img');
        if (img) img.addEventListener('error', () => controller.reportMediaError(), { once: true });
      }

      requestAnimationFrame(() => mediaLayerEl.classList.remove('is-fading'));
    } else {
      const v = mediaLayerEl.querySelector('video');
      if (v) {
        v.muted = Boolean(vm.muted);
        if (entered && vm.isPlaying && !menuOpen && v.paused && !v.ended) {
          v.play().catch(() => {});
        } else if ((!entered || !vm.isPlaying || menuOpen) && !v.paused) {
          v.pause();
        }
      }
    }
  }

  function syncSceneFeed(vm) {
    if (vm.scene.id === lastSceneId) return;
    lastSceneId = vm.scene.id;
    const spec = SCENE_FEED[vm.scene.id];
    if (!spec) {
      gtaFeedEl.innerHTML = '';
      return;
    }
    gtaFeedEl.innerHTML = `
      <div class="gta-alert-slab">
        <div class="gta-alert-kicker"><i class="live-dot"></i>${escapeHtml(spec.kicker)}</div>
        <div class="gta-alert-title">${escapeHtml(spec.title)}</div>
        <div class="gta-alert-sub">${escapeHtml(spec.sub)}</div>
      </div>`;
  }

  function render(vm) {
    scheduleBeat(vm);
    syncMediaLayer(vm);
    syncSceneFeed(vm);

    if (entered) {
      bgmAdapter.sync(menuOpen ? { ...vm.bgm, mode: 'paused', targetGain: 0 } : vm.bgm);
      voiceAdapter.sync(menuOpen ? { ...vm.voice, mode: 'paused' } : vm.voice);
    }

    const timePart = (vm.scene.timecode.split(' ')[1] || vm.scene.timecode).trim();
    const shortLoc = vm.scene.location.split('·').pop().trim();
    const trustText = vm.trust > 0 ? `+${vm.trust}` : `${vm.trust}`;

    cornerRightEl.innerHTML = `
      <div class="gta-status-readout">
        <div class="gta-clock">${escapeHtml(timePart)}</div>
        <div class="gta-zone">${escapeHtml(shortLoc)}</div>
      </div>
      <div class="gta-icon-row">
        <button type="button" class="gta-icon-btn accent" data-action="toggle-journal" aria-label="物证档案">
          档案 <span class="badge-num">${vm.evidence.length}/${vm.totalEvidenceCount}</span>
        </button>
        <button type="button" class="gta-icon-btn" data-action="toggle-menu" aria-label="菜单">≡</button>
      </div>
    `;

    toastSlotEl.innerHTML = vm.banner
      ? `<div class="toast-banner" role="status">
           <span>${escapeHtml(vm.banner)}</span>
           <button type="button" class="toast-close" data-action="dismiss-banner">OK</button>
         </div>`
      : '';

    const progressPct = Math.round(((vm.beatIndex + 1) / Math.max(1, vm.beatCount)) * 100);
    edgeFillEl.style.width = `${progressPct}%`;

    const subtitleHtml = vm.subtitlesEnabled
      ? `<div class="gta-subtitle" aria-live="polite">
           <p class="gta-subtitle-line"><span class="gta-speaker ${getSpeakerClass(vm.beat.speaker)}">${escapeHtml(vm.beat.speaker)}：</span>${escapeHtml(vm.beat.text)}</p>
           ${!vm.isLastBeat ? `<div class="gta-tap-cue">TAP TO CONTINUE</div>` : ''}
         </div>`
      : '';

    let interactionHtml = '';
    if (vm.isLastBeat && vm.scene.ending) {
      interactionHtml = `
        <div class="ending-panel">
          <div class="ending-kicker">CHAPTER COMPLETE · ${vm.completedEndings.length}/${vm.totalEndings}</div>
          <h2>${escapeHtml(vm.scene.ending.title)}</h2>
          <p>${escapeHtml(vm.scene.ending.summary)}</p>
          <div class="ending-actions">
            <button type="button" class="gta-cta" data-action="restart-keep">探索另一结局</button>
            <button type="button" class="gta-cta-ghost" data-action="restart-full">重置存档</button>
          </div>
        </div>`;
    } else if (vm.isLastBeat) {
      const availHtml = vm.availableChoices
        .map(
          (c, i) => `
            <button type="button" class="choice-strip" data-choice="${escapeHtml(c.id)}">
              <span class="choice-num">0${i + 1}</span>
              <span class="choice-body">
                <strong>${escapeHtml(c.label)}</strong>
                ${c.hint ? `<small>${escapeHtml(c.hint)}</small>` : ''}
              </span>
            </button>`
        )
        .join('');

      const lockedHtml = vm.lockedChoices
        .map(
          ({ choice }) => `
            <div class="choice-strip is-locked" aria-disabled="true">
              <span class="choice-num">LOCK</span>
              <span class="choice-body">
                <strong>${escapeHtml(choice.label)}</strong>
                <small>${escapeHtml(choice.hint || '线索不足')}</small>
              </span>
            </div>`
        )
        .join('');

      interactionHtml = `<div class="choices-tray" role="group" aria-label="剧情抉择">${availHtml}${lockedHtml}</div>`;
    }

    hudBottomEl.innerHTML = `${subtitleHtml}${interactionHtml}`;

    if (vm.journalOpen) {
      const itemsHtml = vm.evidence.length
        ? vm.evidence
            .map(
              (e) => `
                <article class="clue-card rel-${escapeHtml(e.reliability)}">
                  <div class="clue-head">
                    <strong>${escapeHtml(e.label)}</strong>
                    <span class="rel-pill">${escapeHtml(RELIABILITY_LABEL[e.reliability] || e.reliability)}</span>
                  </div>
                  <p>${escapeHtml(e.summary)}</p>
                  <div class="clue-source">SOURCE // ${escapeHtml(e.source)}</div>
                </article>`
            )
            .join('')
        : '<p class="empty-clue">尚未收集关键物证。检查屋内终端或与林核对细节以解锁档案。</p>';

      sheetSlotEl.innerHTML = `
        <div class="sheet-backdrop" data-action="close-sheets">
          <aside class="game-sheet" role="dialog" aria-modal="true" aria-label="物证档案" onclick="event.stopPropagation()">
            <header class="sheet-head">
              <h2>CASE FILE // ${vm.evidence.length}/${vm.totalEvidenceCount}</h2>
              <button type="button" class="sheet-close" data-action="close-sheets">ESC</button>
            </header>
            <div class="sheet-stats">
              <div class="stat-tile"><span>LIN TRUST</span><strong>${escapeHtml(trustText)}</strong></div>
              <div class="stat-tile"><span>ENDINGS</span><strong>${vm.completedEndings.length} / ${vm.totalEndings}</strong></div>
            </div>
            <div class="clue-list">${itemsHtml}</div>
          </aside>
        </div>`;
    } else if (menuOpen) {
      sheetSlotEl.innerHTML = `
        <div class="sheet-backdrop" data-action="close-sheets">
          <aside class="game-sheet" role="dialog" aria-modal="true" aria-label="系统菜单" onclick="event.stopPropagation()">
            <header class="sheet-head">
              <h2>PAUSE // SYSTEM</h2>
              <button type="button" class="sheet-close" data-action="close-sheets">RESUME</button>
            </header>
            <div class="sheet-stats">
              <div class="stat-tile"><span>LIN TRUST</span><strong>${escapeHtml(trustText)}</strong></div>
              <div class="stat-tile"><span>EVIDENCE</span><strong>${vm.evidence.length} / ${vm.totalEvidenceCount}</strong></div>
            </div>
            <div class="menu-grid">
              <button type="button" class="menu-action ${vm.isPlaying ? 'is-active' : ''}" data-action="toggle-play">${vm.isPlaying ? '⏸ 暂停推进' : '▶ 继续推进'}</button>
              <button type="button" class="menu-action" data-action="replay-scene">↺ 重播当前场次</button>
              <button type="button" class="menu-action ${vm.subtitlesEnabled ? 'is-active' : ''}" data-action="toggle-subtitles">${vm.subtitlesEnabled ? '字幕：开启' : '字幕：关闭'}</button>
              <button type="button" class="menu-action ${!vm.muted ? 'is-active' : ''}" data-action="toggle-mute">${vm.muted ? '声音：静音' : '声音：开启'}</button>
              <button type="button" class="menu-action" data-action="restart-keep">重新开始（保留结局）</button>
              <button type="button" class="menu-action is-danger" data-action="restart-full">清除全部存档</button>
            </div>
          </aside>
        </div>`;
    } else {
      sheetSlotEl.innerHTML = '';
    }
  }

  function enterCinema() {
    if (entered) return;
    entered = true;
    titleGateEl.classList.add('is-hidden');
    const vm = controller.getViewModel();
    const v = mediaLayerEl.querySelector('video');
    if (v) {
      v.muted = Boolean(vm.muted);
      v.play().catch(() => {});
    }
    bgmAdapter.sync(vm.bgm);
    bgmAdapter.unlock();
    voiceAdapter.sync(vm.voice);
    voiceAdapter.unlock();
    scheduleBeat(vm);
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-choice]');
    if (target) {
      if (target.dataset.action === 'enter-cinema') {
        enterCinema();
        return;
      }
      if (!entered) enterCinema();
      bgmAdapter.unlock();
      voiceAdapter.unlock();

      if (target.dataset.choice) {
        menuOpen = false;
        controller.selectChoice(target.dataset.choice);
        return;
      }
      switch (target.dataset.action) {
        case 'toggle-menu':
          menuOpen = !menuOpen;
          if (menuOpen && controller.getViewModel().journalOpen) controller.toggleJournal(false);
          else render(controller.getViewModel());
          break;
        case 'toggle-journal':
          menuOpen = false;
          controller.toggleJournal();
          break;
        case 'close-sheets':
          menuOpen = false;
          if (controller.getViewModel().journalOpen) controller.toggleJournal(false);
          else render(controller.getViewModel());
          break;
        case 'toggle-play':
          menuOpen = false;
          controller.togglePlay();
          break;
        case 'replay-scene':
          menuOpen = false;
          controller.replayScene();
          break;
        case 'toggle-subtitles':
          controller.toggleSubtitles();
          break;
        case 'toggle-mute':
          controller.toggleMute();
          break;
        case 'dismiss-banner':
          controller.dismissBanner();
          break;
        case 'restart-keep':
          menuOpen = false;
          controller.restart({ preserveEndings: true });
          break;
        case 'restart-full':
          menuOpen = false;
          controller.restart({ preserveEndings: false });
          break;
      }
      return;
    }

    if (entered && !menuOpen && !controller.getViewModel().journalOpen) {
      bgmAdapter.unlock();
      voiceAdapter.unlock();
      const vm = controller.getViewModel();
      if (!vm.isLastBeat) controller.advanceBeat();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!entered && (event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      enterCinema();
      return;
    }
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      menuOpen = false;
      render(controller.getViewModel());
      return;
    }
    if (entered && !menuOpen && controller.handleKey(event.key)) {
      event.preventDefault();
    }
  });

  controller.subscribe(render);
}

boot();
