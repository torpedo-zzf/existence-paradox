// Offline reference only. No network, provider, or state writes.
export function validateDialogue(output, allowedFactIds, allowedIntents) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return false;
  if (Object.keys(output).sort().join(',') !== 'intent,referencedFactIds,utterance') return false;
  if (typeof output.utterance !== 'string' || !output.utterance.trim() || output.utterance.length > 600) return false;
  if (!allowedIntents.includes(output.intent)) return false;
  return Array.isArray(output.referencedFactIds) && output.referencedFactIds.length <= 16 && output.referencedFactIds.every(id => typeof id === 'string' && allowedFactIds.includes(id));
}
export function chooseDialogue(output, allowedFactIds, allowedIntents, fallback) {
  return validateDialogue(output, allowedFactIds, allowedIntents) ? output.utterance : fallback;
}
