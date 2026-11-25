import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  validateSliceEpisode,
  createInitialState,
  evaluateChoices,
  applyChoice
} from '../../src/core/runtime.mjs';
import { createStaticServer } from '../../scripts/dev-server.mjs';

const slice = JSON.parse(
  readFileSync(new URL('../../episodes/01/slice.json', import.meta.url), 'utf8')
);

test('SLICE-104: episodes/01/slice.json is valid and every playable path reaches a real ending without deadlock', () => {
  assert.equal(validateSliceEpisode(slice), true);

  const reachedEndings = new Set();
  let pathCount = 0;

  function dfs(state, depth) {
    assert.ok(depth < 12, 'Cycle or unexpectedly deep graph detected');
    const scene = slice.scenes.find((s) => s.id === state.sceneId);
    const { available } = evaluateChoices(slice, state);
    if (scene.choices.length === 0) {
      assert.ok(scene.ending, `Terminal scene ${scene.id} must define ending`);
      reachedEndings.add(scene.ending.id);
      pathCount += 1;
      return;
    }
    assert.ok(available.length > 0, `Deadlock at scene ${scene.id} with evidence=[${state.evidence}] trust=${state.trust}`);
    for (const c of available) {
      dfs(applyChoice(slice, state, c.id), depth + 1);
    }
  }

  dfs(createInitialState(slice), 0);
  assert.ok(pathCount >= 6, `Expected rich branching paths, got ${pathCount}`);
  assert.deepEqual([...reachedEndings].sort(), ['silent_archive', 'street_witness']);
});

test('SLICE-104: local static server serves offline player assets and blocks .env / .git', async () => {
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const htmlRes = await fetch(`${base}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.match(html, /src\/player\/app\.mjs/);

    const jsonRes = await fetch(`${base}/episodes/01/slice.json`);
    assert.equal(jsonRes.status, 200);
    const ep = await jsonRes.json();
    assert.equal(ep.id, 'ep01-slice');

    const cssRes = await fetch(`${base}/public/styles.css`);
    assert.equal(cssRes.status, 200);

    // Security check: .env and .git MUST be blocked
    const envRes = await fetch(`${base}/.env`);
    assert.equal(envRes.status, 403);
    const gitRes = await fetch(`${base}/.git/HEAD`);
    assert.equal(gitRes.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
