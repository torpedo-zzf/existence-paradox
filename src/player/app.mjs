// Browser entrypoint for the minimalist full-bleed interactive-cinema player.
// Maintains a persistent media layer (never restarts <video> on beat changes),
// renders diegetic scene overlays, and syncs separate BGM + IndexTTS voice tracks.

import { createPlayerController } from './controller.mjs';
import { createBrowserBgmAdapter } from './bgm-engine.mjs';
import { createBrowserVoiceAdapter } from './voice-engine.mjs';

const RELIABILITY_LABEL = {
  verified: '已核实',
  unverified: '待核实',
  contradictory: '存在矛盾'
};

const DIEGETIC_OVERLAYS = {
  wake: {
    tone: 'crimson',
    eyebrow: 'MUNICIPAL ID // NOTICE',
    title: '公民身份已永久注销',
    meta: '签发：72H 前 · 原因：自然人已死亡'
  },
  terminal_check: {
    tone: 'amber',
    eyebrow: 'LOCAL CACHE // 2 ANOMALIES',
    title: '桌面折叠终端 · 未同步日志',
    meta: '01 玄关离线掌纹记录 · 02 诊所加密回执'
  },
  door_anomaly: {
    tone: 'crimson',
    eyebrow: 'SMART LOCK // BIOMETRIC LOG',
    title: '22:18:04 · 掌纹验证通过（99.8%）',
    meta: '方向：离开室内 · 后续无重新进入记录'
  },
  clinic_clue: {
    tone: 'amber',
    eyebrow: 'SEVENTH CONTINUITY CLINIC',
    title: '个体身份连续性核验回执',
    meta: '状态：双轨同步已完成 · 异常体待回收'
  },
  lin_call: {
    tone: 'cyan',
    eyebrow: 'E2EE VIDEO // LIVE CALL',
    title: '加密视频线路 · 林',
    meta: '00:08 · 信号稳定 · 原生音画'
  },
  crossroads: {
    tone: 'crimson',
    eyebrow: 'CORRIDOR SENSOR // FLOOR 14',
    title: '电梯已抵达本层',
    meta: '脚步声逼近玄关 · 请立即抉择'
  },
  ending_archive: {
    tone: 'amber',
    eyebrow: 'EPILOGUE // ROUTE A',
    title: '静默封存',
    meta: '离线证据已写入 · 门锁验证通过'
  },
  ending_meeting: {
    tone: 'cyan',
    eyebrow: 'EPILOGUE // ROUTE B',
    title: '街角双影',
    meta: '消防通道撤离 · 街角目击'
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

  // Mount persistent DOM shell once so <video> is never destroyed on beat advance
  root.innerHTML = `
    <div class="cinema-stage" id="cinema-stage">
      <div class="media-layer" id="media-layer"></div>
      <div class="cinema-vignette" aria-hidden="true"></div>
      <div class="cinema-grain" aria-hidden="true"></div>
      <div class="diegetic-layer" id="diegetic-layer"></div>
      <header class="hud-top" id="hud-top"></header>
      <div id="toast-slot"></div>
      <section class="hud-bottom" id="hud-bottom"></section>
      <div id="dossier-slot"></div>
      <div class="title-gate" id="title-gate">
        <div class="gate-eyebrow">EPISODE 01 // 2042-11-25</div>
        <h1 class="gate-title">存在悖论</h1>
        <div class="gate-chapter">第一章 · 查无此人</div>
        <button type="button" class="cta-primary" data-action="enter-cinema">进入章节</button>
        <div class="gate-note">建议开启声音 · 点击画面或按空格推进</div>
      </div>
    </div>
  `;

  const stageEl = document.getElementById('cinema-stage');
  const mediaLayerEl = document.getElementById('media-layer');
  const diegeticLayerEl = document.getElementById('diegetic-layer');
  const hudTopEl = document.getElementById('hud-top');
  const toastSlotEl = document.getElementById('toast-slot');
  const hudBottomEl = document.getElementById('hud-bottom');
  const dossierSlotEl = document.getElementById('dossier-slot');
  const titleGateEl = document.getElementById('title-gate');

  let entered = false;
  let timerId = null;
  let idleTimerId = null;
  let mountedMediaKey = null;
  let lastSceneId = null;
  let sceneIndexParity = 0;

  function bumpIdleTimer() {
    stageEl.classList.remove('hud-idle');
    if (idleTimerId) clearTimeout(idleTimerId);
    idleTimerId = setTimeout(() => {
      if (entered) stageEl.classList.add('hud-idle');
    }, 3200);
  }

  function scheduleBeat(vm) {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (entered && vm.isPlaying && !vm.isLastBeat && !vm.journalOpen) {
      timerId = setTimeout(() => {
        controller.advanceBeat();
      }, vm.beat.durationMs);
    }
  }

  function syncMediaLayer(vm) {
    const mediaKey = `${vm.scene.id}|${vm.mediaFallbackActive ? 'fb' : vm.scene.media.src}|${vm.voice?.replayToken ?? 0}`;
    if (mediaKey !== mountedMediaKey) {
      mountedMediaKey = mediaKey;
      sceneIndexParity = (sceneIndexParity + 1) % 2;

      mediaLayerEl.classList.add('is-fading');
      if (vm.mediaFallbackActive) {
        mediaLayerEl.innerHTML = `
          <div class="stage-placeholder palette-${escapeHtml(vm.scene.media.palette || 'cold-slate')}">
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
          if (entered && vm.isPlaying) {
            v.play().catch(() => {});
          }
        }
      } else {
        const driftClass = sceneIndexParity === 0 ? 'drift-a' : 'drift-b';
        mediaLayerEl.innerHTML = `
          <img class="stage-still ${driftClass}" src="${escapeHtml(vm.scene.media.src)}"
            alt="${escapeHtml(vm.scene.media.caption)}" />`;
        const img = mediaLayerEl.querySelector('img');
        if (img) img.addEventListener('error', () => controller.reportMediaError(), { once: true });
      }

      requestAnimationFrame(() => {
        mediaLayerEl.classList.remove('is-fading');
      });
    } else {
      const v = mediaLayerEl.querySelector('video');
      if (v) {
        v.muted = Boolean(vm.muted);
        if (entered && vm.isPlaying && v.paused && !v.ended) {
          v.play().catch(() => {});
        } else if ((!entered || !vm.isPlaying) && !v.paused) {
          v.pause();
        }
      }
    }
  }

  function syncDiegeticLayer(vm) {
    if (vm.scene.id === lastSceneId) return;
    lastSceneId = vm.scene.id;
    const spec = DIEGETIC_OVERLAYS[vm.scene.id];
    if (!spec) {
      diegeticLayerEl.innerHTML = '';
      return;
    }
    const dotClass = spec.tone === 'cyan' ? 'cyan' : spec.tone === 'amber' ? 'amber' : '';
    diegeticLayerEl.innerHTML = `
      <aside class="diegetic-card tone-${escapeHtml(spec.tone)}">
        <div class="diegetic-eyebrow"><i class="pulse-dot ${dotClass}"></i>${escapeHtml(spec.eyebrow)}</div>
        <div class="diegetic-title">${escapeHtml(spec.title)}</div>
        <div class="diegetic-meta">${escapeHtml(spec.meta)}</div>
      </aside>
    `;
  }

  function render(vm) {
    scheduleBeat(vm);
    syncMediaLayer(vm);
    syncDiegeticLayer(vm);

    if (entered) {
      bgmAdapter.sync(vm.bgm);
      voiceAdapter.sync(vm.voice);
    }

    const trustText = vm.trust > 0 ? `+${vm.trust}` : `${vm.trust}`;

    hudTopEl.innerHTML = `
      <div class="hud-scene-meta">
        <span class="hud-timecode">${escapeHtml(vm.scene.timecode.split(' ')[1] || vm.scene.timecode)}</span>
        <span class="hud-divider" aria-hidden="true"></span>
        <span class="hud-location">${escapeHtml(vm.scene.location)}</span>
      </div>
      <div class="hud-actions">
        <button type="button" class="hud-btn has-badge" data-action="toggle-journal">档案<span class="count">${vm.evidence.length}/${vm.totalEvidenceCount}</span></button>
        <button type="button" class="hud-btn" data-action="toggle-play">${vm.isPlaying ? '暂停' : '继续'}</button>
        <button type="button" class="hud-btn" data-action="replay-scene">重播</button>
        <button type="button" class="hud-btn" data-action="toggle-subtitles">${vm.subtitlesEnabled ? '字幕开' : '字幕关'}</button>
        <button type="button" class="hud-btn" data-action="toggle-mute">${vm.muted ? '已静音' : '声音'}</button>
        <button type="button" class="hud-btn" data-action="restart-keep">重开</button>
      </div>
    `;

    toastSlotEl.innerHTML = vm.banner
      ? `<div class="toast-banner" role="status">
           <span>${escapeHtml(vm.banner)}</span>
           <button type="button" class="toast-close" data-action="dismiss-banner">关闭</button>
         </div>`
      : '';

    const progressPct = Math.round(((vm.beatIndex + 1) / Math.max(1, vm.beatCount)) * 100);
    const subtitleHtml = vm.subtitlesEnabled
      ? `<div class="subtitle-wrap" aria-live="polite">
           <div class="speaker-tag ${getSpeakerClass(vm.beat.speaker)}">${escapeHtml(vm.beat.speaker)}</div>
           <p class="subtitle-line">${escapeHtml(vm.beat.text)}</p>
           ${
             !vm.isLastBeat
               ? `<div class="beat-bar">
                    <div class="beat-track"><div class="beat-fill" style="width:${progressPct}%"></div></div>
                    <span class="beat-hint">轻触画面继续 · ${vm.beatIndex + 1}/${vm.beatCount}</span>
                  </div>`
               : ''
           }
         </div>`
      : `<div class="subtitle-wrap"><div class="subtitle-muted">字幕已隐藏（按 C 开启）</div></div>`;

    let interactionHtml = '';
    if (vm.isLastBeat && vm.scene.ending) {
      interactionHtml = `
        <div class="ending-panel">
          <div class="ending-kicker">EPISODE 01 COMPLETE · ENDINGS ${vm.completedEndings.length}/${vm.totalEndings}</div>
          <h2>${escapeHtml(vm.scene.ending.title)}</h2>
          <p>${escapeHtml(vm.scene.ending.summary)}</p>
          <div class="ending-actions">
            <button type="button" class="cta-primary" data-action="restart-keep">探索另一结局</button>
            <button type="button" class="cta-ghost" data-action="restart-full">重置全部存档</button>
          </div>
        </div>`;
    } else if (vm.isLastBeat) {
      const availHtml = vm.availableChoices
        .map(
          (c, i) => `
            <button type="button" class="choice-card" data-choice="${escapeHtml(c.id)}">
              <span class="choice-key">${i + 1}</span>
              <span class="choice-text">
                <strong>${escapeHtml(c.label)}</strong>
                ${c.hint ? `<small>${escapeHtml(c.hint)}</small>` : ''}
              </span>
            </button>`
        )
        .join('');

      const lockedHtml = vm.lockedChoices
        .map(
          ({ choice }) => `
            <div class="choice-card is-locked" aria-disabled="true">
              <span class="choice-key">×</span>
              <span class="choice-text">
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
        : '<p class="empty-clue">尚未收集到关键物证。检查屋内终端或与林核对细节以解锁档案。</p>';

      dossierSlotEl.innerHTML = `
        <div class="drawer-backdrop" data-action="close-journal">
          <aside class="dossier-drawer" role="dialog" aria-modal="true" aria-label="证据档案" onclick="event.stopPropagation()">
            <header class="drawer-head">
              <h2>证据档案 // ${vm.evidence.length}/${vm.totalEvidenceCount}</h2>
              <button type="button" class="hud-btn" data-action="close-journal">关闭</button>
            </header>
            <div class="drawer-stats">
              <div class="stat-box"><span>LIN TRUST</span><strong>${escapeHtml(trustText)}</strong></div>
              <div class="stat-box"><span>ENDINGS</span><strong>${vm.completedEndings.length} / ${vm.totalEndings}</strong></div>
            </div>
            <div class="clue-list">${itemsHtml}</div>
          </aside>
        </div>`;
    } else {
      dossierSlotEl.innerHTML = '';
    }
  }

  function enterCinema() {
    if (entered) return;
    entered = true;
    titleGateEl.classList.add('is-hidden');
    bumpIdleTimer();
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

  stageEl.addEventListener('mousemove', bumpIdleTimer, { passive: true });
  stageEl.addEventListener('touchstart', bumpIdleTimer, { passive: true });

  root.addEventListener('click', (event) => {
    bumpIdleTimer();
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
        controller.selectChoice(target.dataset.choice);
        return;
      }
      switch (target.dataset.action) {
        case 'toggle-play': controller.togglePlay(); break;
        case 'replay-scene': controller.replayScene(); break;
        case 'toggle-subtitles': controller.toggleSubtitles(); break;
        case 'toggle-mute': controller.toggleMute(); break;
        case 'toggle-journal': controller.toggleJournal(); break;
        case 'close-journal': controller.toggleJournal(false); break;
        case 'dismiss-banner': controller.dismissBanner(); break;
        case 'restart-keep': controller.restart({ preserveEndings: true }); break;
        case 'restart-full': controller.restart({ preserveEndings: false }); break;
      }
      return;
    }

    // Clicking anywhere on the open cinema stage advances the beat naturally
    if (entered && !controller.getViewModel().journalOpen) {
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
    if (entered && controller.handleKey(event.key)) {
      event.preventDefault();
    }
  });

  controller.subscribe(render);
}

boot();
