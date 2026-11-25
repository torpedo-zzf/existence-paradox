import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlayerController } from '../../src/player/controller.mjs';
import { createMemoryStorage, DEFAULT_SAVE_KEY } from '../../src/storage/save-store.mjs';

const slice = JSON.parse(
  readFileSync(new URL('../../episodes/01/slice.json', import.meta.url), 'utf8')
);

test('UI-102: subtitles, beat progression, replay, and keyboard shortcuts work', () => {
  const storage = createMemoryStorage();
  const ctrl = createPlayerController({ episode: slice, storage });

  let vm = ctrl.getViewModel();
  assert.equal(vm.scene.id, 'wake');
  assert.equal(vm.beatIndex, 0);
  assert.equal(vm.subtitlesEnabled, true);
  assert.equal(vm.mediaFallbackActive, false);

  // Toggle subtitles with C
  ctrl.handleKey('c');
  assert.equal(ctrl.getViewModel().subtitlesEnabled, false);
  ctrl.handleKey('C');
  assert.equal(ctrl.getViewModel().subtitlesEnabled, true);

  // Advance to last beat with Space
  ctrl.handleKey(' ');
  ctrl.handleKey(' ');
  vm = ctrl.getViewModel();
  assert.equal(vm.isLastBeat, true);

  // Choose option 1 via keyboard '1' -> inspect_notice
  ctrl.handleKey('1');
  vm = ctrl.getViewModel();
  assert.equal(vm.scene.id, 'terminal_check');
  assert.equal(vm.evidence.length, 1);
  assert.equal(vm.evidence[0].id, 'death_notice');

  // Open & close evidence journal via J / Escape
  ctrl.handleKey('j');
  assert.equal(ctrl.getViewModel().journalOpen, true);
  ctrl.handleKey('Escape');
  assert.equal(ctrl.getViewModel().journalOpen, false);

  // Replay scene resets beat index to 0
  ctrl.advanceBeat();
  ctrl.handleKey('r');
  assert.equal(ctrl.getViewModel().beatIndex, 0);
});

test('UI-102: media error triggers graceful offline fallback banner', () => {
  const storage = createMemoryStorage();
  const ctrl = createPlayerController({ episode: slice, storage });
  ctrl.reportMediaError();
  const vm = ctrl.getViewModel();
  assert.equal(vm.mediaFallbackActive, true);
  assert.match(vm.banner, /占位画面/);
});

test('UI-102: corrupt save shows recovery banner and starts cleanly', () => {
  const storage = createMemoryStorage();
  storage.setItem(DEFAULT_SAVE_KEY, 'corrupt{{{');
  const ctrl = createPlayerController({ episode: slice, storage });
  const vm = ctrl.getViewModel();
  assert.equal(vm.scene.id, 'wake');
  assert.match(vm.banner, /恢复/);
});
