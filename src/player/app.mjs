// Browser entrypoint for the local offline interactive-cinema player.

import { createPlayerController } from './controller.mjs';

const RELIABILITY_LABEL = {
  verified: '已核实',
  unverified: '待核实',
  contradictory: '存在矛盾'
};

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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

  const controller = createPlayerController({
    episode,
    storage: window.localStorage
  });

  let timerId = null;

  function scheduleBeat(vm) {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (vm.isPlaying && !vm.isLastBeat && !vm.journalOpen) {
      timerId = setTimeout(() => {
        controller.advanceBeat();
      }, vm.beat.durationMs);
    }
  }

  function render(vm) {
    scheduleBeat(vm);

    const trustText = vm.trust > 0 ? `+${vm.trust}` : `${vm.trust}`;
    const bannerHtml = vm.banner
      ? `<div class="banner" role="status"><span>${escapeHtml(vm.banner)}</span><button type="button" class="btn-ghost" data-action="dismiss-banner">关闭</button></div>`
      : '';

    const mediaStageHtml = vm.mediaFallbackActive
      ? `<div class="stage-placeholder palette-${escapeHtml(vm.scene.media.palette || 'cold-slate')}">
           <div class="stage-grid"></div>
           <div class="stage-meta">
             <span class="chip">${escapeHtml(vm.scene.location)}</span>
             <span class="chip mono">${escapeHtml(vm.scene.timecode)}</span>
           </div>
           <div class="stage-caption">${escapeHtml(vm.scene.media.caption)}</div>
           <div class="stage-badge">OFFLINE PLACEHOLDER · PHASE 1</div>
         </div>`
      : vm.scene.media.type === 'video'
        ? `<video class="stage-video" src="${escapeHtml(vm.scene.media.src)}" playsinline controls ${vm.muted ? 'muted' : ''}></video>`
        : `<img class="stage-still" src="${escapeHtml(vm.scene.media.src)}" alt="${escapeHtml(vm.scene.media.caption)}" />`;

    const subtitleHtml = vm.subtitlesEnabled
      ? `<div class="subtitle-box" aria-live="polite">
           <div class="speaker">${escapeHtml(vm.beat.speaker)}</div>
           <div class="line">${escapeHtml(vm.beat.text)}</div>
           <div class="beat-progress">节拍 ${vm.beatIndex + 1} / ${vm.beatCount}</div>
         </div>`
      : `<div class="subtitle-box muted-sub">字幕已隐藏（按 C 开启）</div>`;

    let interactionHtml = '';
    if (!vm.isLastBeat) {
      interactionHtml = `<div class="continue-row">
        <button type="button" class="btn-primary" data-action="next-beat">继续下一拍 (Space / Enter)</button>
      </div>`;
    } else if (vm.scene.ending) {
      interactionHtml = `<div class="ending-card">
        <div class="ending-tag">切片结局达成 · 已解锁 ${vm.completedEndings.length} / ${vm.totalEndings}</div>
        <h2>${escapeHtml(vm.scene.ending.title)}</h2>
        <p>${escapeHtml(vm.scene.ending.summary)}</p>
        <div class="ending-actions">
          <button type="button" class="btn-primary" data-action="restart-keep">重玩探索其他分支（保留结局记录）</button>
          <button type="button" class="btn-secondary" data-action="restart-full">完全清除存档</button>
        </div>
      </div>`;
    } else {
      const availHtml = vm.availableChoices
        .map(
          (c, i) => `<button type="button" class="choice-btn" data-choice="${escapeHtml(c.id)}">
            <span class="choice-key">${i + 1}</span>
            <span class="choice-body">
              <strong>${escapeHtml(c.label)}</strong>
              ${c.hint ? `<small>${escapeHtml(c.hint)}</small>` : ''}
            </span>
          </button>`
        )
        .join('');

      const lockedHtml = vm.lockedChoices
        .map(
          ({ choice }) => `<div class="choice-locked" aria-disabled="true">
            <span class="choice-key">锁</span>
            <span class="choice-body">
              <strong>${escapeHtml(choice.label)}</strong>
              <small>${escapeHtml(choice.hint || '未满足触发条件')}</small>
            </span>
          </div>`
        )
        .join('');

      interactionHtml = `<div class="choices-panel" role="group" aria-label="剧情抉择">
        ${availHtml}
        ${lockedHtml}
      </div>`;
    }

    const journalItemsHtml = vm.evidence.length
      ? vm.evidence
          .map(
            (e) => `<article class="clue-card">
              <div class="clue-head">
                <strong>${escapeHtml(e.label)}</strong>
                <span class="rel-badge rel-${escapeHtml(e.reliability)}">${escapeHtml(RELIABILITY_LABEL[e.reliability] || e.reliability)}</span>
              </div>
              <p>${escapeHtml(e.summary)}</p>
              <div class="clue-source">来源：${escapeHtml(e.source)}</div>
            </article>`
          )
          .join('')
      : '<p class="empty-clue">尚未收集到任何证据。调查屋内终端或与林核对细节以获取线索。</p>';

    const journalHtml = vm.journalOpen
      ? `<div class="modal-backdrop" data-action="close-journal">
           <section class="journal-modal" role="dialog" aria-modal="true" aria-label="证据日志" onclick="event.stopPropagation()">
             <header class="journal-header">
               <h2>证据日志 (${vm.evidence.length}/${vm.totalEvidenceCount})</h2>
               <button type="button" class="btn-ghost" data-action="close-journal">关闭 (Esc)</button>
             </header>
             <div class="journal-stats">
               <span>林的信任度：<strong>${escapeHtml(trustText)}</strong></span>
               <span>已解锁结局：<strong>${vm.completedEndings.length} / ${vm.totalEndings}</strong></span>
             </div>
             <div class="clue-list">${journalItemsHtml}</div>
           </section>
         </div>`
      : '';

    root.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div>
            <div class="brand">${escapeHtml(vm.episodeTitle)}</div>
            <div class="subbrand">${escapeHtml(vm.scene.title)}</div>
          </div>
          <div class="top-actions">
            <button type="button" class="btn-secondary" data-action="toggle-journal">证据日志 (${vm.evidence.length}/${vm.totalEvidenceCount})</button>
            <button type="button" class="btn-ghost" data-action="restart-keep">重开</button>
          </div>
        </header>

        ${bannerHtml}

        <main class="cinema-main">
          <section class="viewport" aria-label="画面舞台">
            ${mediaStageHtml}
            ${subtitleHtml}
          </section>

          <section class="controls-bar" aria-label="播放控制">
            <button type="button" class="btn-ghost" data-action="toggle-play">${vm.isPlaying ? '暂停' : '自动播放'}</button>
            <button type="button" class="btn-ghost" data-action="replay-scene">重播本场 (R)</button>
            <button type="button" class="btn-ghost" data-action="toggle-subtitles">字幕：${vm.subtitlesEnabled ? '开' : '关'} (C)</button>
            <button type="button" class="btn-ghost" data-action="toggle-mute">静音：${vm.muted ? '开' : '关'}</button>
            <span class="trust-pill">林的信任度 ${escapeHtml(trustText)}</span>
          </section>

          <section class="interaction-zone">
            ${interactionHtml}
          </section>
        </main>
        ${journalHtml}
      </div>
    `;

    const videoEl = root.querySelector('video');
    if (videoEl) videoEl.addEventListener('error', () => controller.reportMediaError(), { once: true });
    const imgEl = root.querySelector('img');
    if (imgEl) imgEl.addEventListener('error', () => controller.reportMediaError(), { once: true });
  }

  root.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-choice]');
    if (!target) return;
    if (target.dataset.choice) {
      controller.selectChoice(target.dataset.choice);
      return;
    }
    switch (target.dataset.action) {
      case 'next-beat': controller.advanceBeat(); break;
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
  });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (controller.handleKey(event.key)) {
      event.preventDefault();
    }
  });

  controller.subscribe(render);
}

boot();
