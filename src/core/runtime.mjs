// Deterministic interactive-cinema runtime for Phase 1+ slices.
// Authored rules alone govern state transitions; no external provider has state authority.

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const isId = (v) => typeof v === 'string' && /^[a-z][a-z0-9_-]*$/.test(v);
const isNonEmptyText = (v) => typeof v === 'string' && v.trim().length > 0;
const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const VALID_RELIABILITY = new Set(['verified', 'unverified', 'contradictory']);
const VALID_MOODS = new Set(['unease', 'investigation', 'revelation', 'aftermath']);
const VALID_MEDIA_TYPES = new Set(['placeholder', 'still', 'video']);

export const TRUST_MIN = -5;
export const TRUST_MAX = 5;

export function clampTrust(value) {
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, value));
}

export function validateSliceEpisode(ep) {
  assert(isPlainObject(ep), 'Episode must be an object');
  assert(isId(ep.id), 'Invalid episode id');
  assert(Number.isInteger(ep.version) && ep.version >= 1, 'Invalid episode version');
  assert(isNonEmptyText(ep.title), 'Episode title is required');
  assert(Array.isArray(ep.evidence), 'Episode evidence must be an array');
  assert(Array.isArray(ep.scenes) && ep.scenes.length > 0, 'Episode scenes must be a non-empty array');

  const evidenceIds = new Set();
  for (const item of ep.evidence) {
    assert(isPlainObject(item), 'Evidence item must be an object');
    assert(isId(item.id) && !evidenceIds.has(item.id), `Invalid or duplicate evidence id: ${item?.id}`);
    assert(isNonEmptyText(item.label), `Evidence label required: ${item.id}`);
    assert(isNonEmptyText(item.summary), `Evidence summary required: ${item.id}`);
    assert(isNonEmptyText(item.source), `Evidence source required: ${item.id}`);
    assert(VALID_RELIABILITY.has(item.reliability), `Invalid evidence reliability: ${item.id}`);
    evidenceIds.add(item.id);
  }

  const sceneIds = new Set();
  for (const scene of ep.scenes) {
    assert(isPlainObject(scene), 'Scene must be an object');
    assert(isId(scene.id) && !sceneIds.has(scene.id), `Invalid or duplicate scene id: ${scene?.id}`);
    sceneIds.add(scene.id);
  }
  assert(sceneIds.has(ep.startScene), `Unknown startScene: ${ep.startScene}`);

  const endingIds = new Set();
  for (const scene of ep.scenes) {
    assert(isNonEmptyText(scene.title), `Scene title required: ${scene.id}`);
    assert(isNonEmptyText(scene.location), `Scene location required: ${scene.id}`);
    assert(isNonEmptyText(scene.timecode), `Scene timecode required: ${scene.id}`);
    assert(VALID_MOODS.has(scene.mood), `Invalid scene mood: ${scene.id}`);

    assert(isPlainObject(scene.media), `Scene media required: ${scene.id}`);
    assert(VALID_MEDIA_TYPES.has(scene.media.type), `Invalid media type in ${scene.id}`);
    assert(scene.media.src === null || typeof scene.media.src === 'string', `Invalid media src in ${scene.id}`);
    assert(scene.media.poster === null || typeof scene.media.poster === 'string', `Invalid media poster in ${scene.id}`);
    assert(isNonEmptyText(scene.media.caption), `Media caption required in ${scene.id}`);

    assert(Array.isArray(scene.beats) && scene.beats.length > 0, `Scene beats required: ${scene.id}`);
    const beatIds = new Set();
    for (const beat of scene.beats) {
      assert(isPlainObject(beat), `Beat must be an object in ${scene.id}`);
      assert(isId(beat.id) && !beatIds.has(beat.id), `Invalid or duplicate beat id in ${scene.id}`);
      assert(typeof beat.speaker === 'string', `Beat speaker must be a string in ${scene.id}`);
      assert(isNonEmptyText(beat.text), `Beat text required in ${scene.id}/${beat.id}`);
      assert(Number.isInteger(beat.durationMs) && beat.durationMs >= 500 && beat.durationMs <= 30000, `Invalid beat durationMs in ${scene.id}/${beat.id}`);
      beatIds.add(beat.id);
    }

    assert(Array.isArray(scene.choices), `Scene choices must be an array: ${scene.id}`);
    if (scene.choices.length === 0) {
      assert(isPlainObject(scene.ending), `Ending metadata required for terminal scene: ${scene.id}`);
      assert(isId(scene.ending.id) && !endingIds.has(scene.ending.id), `Invalid or duplicate ending id in ${scene.id}`);
      assert(isNonEmptyText(scene.ending.title), `Ending title required in ${scene.id}`);
      assert(isNonEmptyText(scene.ending.summary), `Ending summary required in ${scene.id}`);
      endingIds.add(scene.ending.id);
    } else {
      assert(scene.ending === undefined || scene.ending === null, `Non-terminal scene cannot declare ending: ${scene.id}`);
    }

    const choiceIds = new Set();
    for (const choice of scene.choices) {
      assert(isPlainObject(choice), `Choice must be an object in ${scene.id}`);
      assert(isId(choice.id) && !choiceIds.has(choice.id), `Invalid or duplicate choice id in ${scene.id}`);
      assert(isNonEmptyText(choice.label), `Choice label required in ${scene.id}/${choice.id}`);
      assert(sceneIds.has(choice.target), `Unknown choice target ${choice.target} in ${scene.id}/${choice.id}`);
      assert(Array.isArray(choice.requiresEvidence) && choice.requiresEvidence.every((id) => evidenceIds.has(id)), `Invalid requiresEvidence in ${scene.id}/${choice.id}`);
      if (choice.requiresMinTrust !== undefined) {
        assert(Number.isInteger(choice.requiresMinTrust) && choice.requiresMinTrust >= TRUST_MIN && choice.requiresMinTrust <= TRUST_MAX, `Invalid requiresMinTrust in ${scene.id}/${choice.id}`);
      }
      if (choice.requiresMaxTrust !== undefined) {
        assert(Number.isInteger(choice.requiresMaxTrust) && choice.requiresMaxTrust >= TRUST_MIN && choice.requiresMaxTrust <= TRUST_MAX, `Invalid requiresMaxTrust in ${scene.id}/${choice.id}`);
      }
      assert(isPlainObject(choice.effects), `Choice effects required in ${scene.id}/${choice.id}`);
      assert(Array.isArray(choice.effects.evidence) && choice.effects.evidence.every((id) => evidenceIds.has(id)), `Invalid effect evidence in ${scene.id}/${choice.id}`);
      assert(Number.isInteger(choice.effects.trustDelta) && Math.abs(choice.effects.trustDelta) <= 5, `Invalid trustDelta in ${scene.id}/${choice.id}`);
      const flags = choice.effects.flags ?? [];
      assert(Array.isArray(flags) && flags.every((f) => isId(f)), `Invalid effect flags in ${scene.id}/${choice.id}`);
      choiceIds.add(choice.id);
    }
  }

  // Structural reachability check from startScene
  const byId = new Map(ep.scenes.map((s) => [s.id, s]));
  const reached = new Set();
  const visit = (id) => {
    if (reached.has(id)) return;
    reached.add(id);
    for (const c of byId.get(id).choices) visit(c.target);
  };
  visit(ep.startScene);
  assert(reached.size === sceneIds.size, 'Unreachable scene detected in episode graph');

  // Every scene must have a structural path to a terminal ending
  const canEnd = new Set(ep.scenes.filter((s) => s.choices.length === 0).map((s) => s.id));
  assert(canEnd.size > 0, 'Episode must define at least one ending scene');
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of ep.scenes) {
      if (!canEnd.has(s.id) && s.choices.some((c) => canEnd.has(c.target))) {
        canEnd.add(s.id);
        changed = true;
      }
    }
  }
  assert(canEnd.size === sceneIds.size, 'Scene without structural path to an ending detected');

  return true;
}

export function createInitialState(ep, completedEndings = []) {
  validateSliceEpisode(ep);
  const validEndings = new Set(ep.scenes.filter((s) => s.ending).map((s) => s.ending.id));
  const preserved = [...new Set(completedEndings.filter((id) => validEndings.has(id)))];
  return {
    episodeId: ep.id,
    version: ep.version,
    sceneId: ep.startScene,
    evidence: [],
    trust: 0,
    flags: [],
    history: [],
    visitedScenes: [ep.startScene],
    completedEndings: preserved
  };
}

export function validateStateForEpisode(ep, state) {
  if (!isPlainObject(state)) return { valid: false, reason: 'State is not an object' };
  if (state.episodeId !== ep.id || state.version !== ep.version) {
    return { valid: false, reason: 'Episode ID or version mismatch' };
  }
  const sceneIds = new Set(ep.scenes.map((s) => s.id));
  const evidenceIds = new Set(ep.evidence.map((e) => e.id));
  const endingIds = new Set(ep.scenes.filter((s) => s.ending).map((s) => s.ending.id));

  if (!sceneIds.has(state.sceneId)) return { valid: false, reason: 'Unknown sceneId' };
  if (!Array.isArray(state.evidence) || !state.evidence.every((id) => evidenceIds.has(id))) {
    return { valid: false, reason: 'Invalid evidence list' };
  }
  if (!Number.isInteger(state.trust) || state.trust < TRUST_MIN || state.trust > TRUST_MAX) {
    return { valid: false, reason: 'Trust out of bounds' };
  }
  if (!Array.isArray(state.flags) || !state.flags.every((f) => isId(f))) {
    return { valid: false, reason: 'Invalid flags list' };
  }
  if (!Array.isArray(state.history) || !state.history.every((h) => isPlainObject(h) && sceneIds.has(h.sceneId) && isId(h.choiceId))) {
    return { valid: false, reason: 'Invalid history entries' };
  }
  if (!Array.isArray(state.visitedScenes) || !state.visitedScenes.every((id) => sceneIds.has(id))) {
    return { valid: false, reason: 'Invalid visitedScenes list' };
  }
  if (!Array.isArray(state.completedEndings) || !state.completedEndings.every((id) => endingIds.has(id))) {
    return { valid: false, reason: 'Invalid completedEndings list' };
  }
  return { valid: true, reason: null };
}

export function getCurrentScene(ep, state) {
  const check = validateStateForEpisode(ep, state);
  assert(check.valid, `Invalid state: ${check.reason}`);
  return ep.scenes.find((s) => s.id === state.sceneId);
}

export function evaluateChoices(ep, state) {
  const scene = getCurrentScene(ep, state);
  const available = [];
  const locked = [];

  for (const choice of scene.choices) {
    const missingEvidence = choice.requiresEvidence.filter((id) => !state.evidence.includes(id));
    const trustTooLow = choice.requiresMinTrust !== undefined && state.trust < choice.requiresMinTrust;
    const trustTooHigh = choice.requiresMaxTrust !== undefined && state.trust > choice.requiresMaxTrust;

    if (missingEvidence.length === 0 && !trustTooLow && !trustTooHigh) {
      available.push(choice);
    } else {
      locked.push({
        choice,
        missingEvidence,
        trustBlocked: trustTooLow || trustTooHigh
      });
    }
  }

  return { available, locked };
}

export function applyChoice(ep, state, choiceId) {
  const { available } = evaluateChoices(ep, state);
  const choice = available.find((c) => c.id === choiceId);
  assert(choice, `Unknown or unavailable choice: ${choiceId}`);

  const targetScene = ep.scenes.find((s) => s.id === choice.target);
  const nextEvidence = [...new Set([...state.evidence, ...choice.effects.evidence])];
  const nextFlags = [...new Set([...state.flags, ...(choice.effects.flags ?? [])])];
  const nextVisited = [...new Set([...state.visitedScenes, choice.target])];
  const nextEndings = targetScene.ending
    ? [...new Set([...state.completedEndings, targetScene.ending.id])]
    : [...state.completedEndings];

  return {
    episodeId: state.episodeId,
    version: state.version,
    sceneId: choice.target,
    evidence: nextEvidence,
    trust: clampTrust(state.trust + choice.effects.trustDelta),
    flags: nextFlags,
    history: [...state.history, { sceneId: state.sceneId, choiceId: choice.id, target: choice.target }],
    visitedScenes: nextVisited,
    completedEndings: nextEndings
  };
}

export function restartEpisode(ep, previousState, { preserveEndings = true } = {}) {
  const endings = preserveEndings && Array.isArray(previousState?.completedEndings)
    ? previousState.completedEndings
    : [];
  return createInitialState(ep, endings);
}
