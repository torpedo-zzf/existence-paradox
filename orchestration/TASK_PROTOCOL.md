# Task execution protocol

Queue is the source of truth for phase authorization and task dependencies. Status values: pending, in_progress, blocked, review, done. Phase 0 is the only authorized phase by default; future tasks require explicit owner approval even when dependencies are met.

Each task must declare ID, phase, dependencies, owner role, allowed write paths, acceptance criteria and status. Before work, report current base commit (or uncommitted baseline), intended changes and conflict check. No simultaneous writers for shared contracts. If additional agents are authorized, use isolated Git branches/worktrees and assign distinct paths. No autonomous new agent recruitment.

Handoff: `task_id`, `base_commit`, `branch`, `changed_files`, `commands` (including actual exit codes), `acceptance_evidence`, `limitations`, `blockers`, `next_action`. Never mark done just because a file exists. Lead verifies and requests owner approval at phase gate. In initialization, no automatic commit/push. After owner authorizes commit, use English commit messages and a clean reviewed diff.

## DeepSeek execution worker
agy may propose a DeepSeek Harness worker only after explicit approval and verified local availability. Use isolated worktree, task ID, declared write paths and independent lead review. Never reuse runtime API credentials for development. Phase 0 has no workers.

## Codex creative worker
Use `docs/08_CODEX_HANDOFF.md` for file-based task/result protocol. Only after phase and owner approval. agy controls task assignment and integration; no simultaneous writers.

## Three-agent bridge
Phase 0.5 is an independent owner-approved connectivity gate, not a production phase. See docs/09_THREE_AGENT_BRIDGE.md. Keep worker execution disabled until verified. agy is the only dispatcher.


See `docs/10_MEDIA_CAPABILITY_GATE.md` for the mandatory v0.3.0 production gates.

## Voice-first native AV requirement
Follow docs/12_VOICE_AND_NATIVE_AV.md: OmniVoice approved voice references precede speaking video; agy stages approved images and audio via private OSS and uses direct Metaso native reference-to-video with native audio. Preserve original dialogue audio. DeepSeek Harness checks streams and transcript; Codex reviews timbre, acting and lip sync. No forced post-dub or assumed exact voice reproduction. Runtime NPC TTS remains separate. Real capabilities require approved pilot evidence.

## Suno BGM requirement
Follow `docs/13_SUNO_BGM.md`, `contracts/music-provider.example.json` and `docs/00_PRODUCTION_BASELINE.md`. agy controls official Suno MCP and budgets (owner sign-in, no API key needed), Codex directs original instrumental cues and listening review, DeepSeek Harness prepares and checks local audio. REST access disabled and unverified; no unofficial API. Suno music remains a separate local track, ducked under H3 native dialogue; no music generation at runtime. Phase 0 offline only; Phase 2 authorization required for credits/downloads. Manual Suno import if verified MCP unavailable. No silent paid fallback.
