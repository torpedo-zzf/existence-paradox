# Agent operating contract

## Authority and scope
The human is the product owner. The lead agent is the sole human-facing coordinator. Discuss in Chinese; use English for internal documents, tasks, code and interfaces. Read the project documents and task queue before editing. The current authorization is Phase 0 only unless the owner explicitly expands it.

## Non-negotiable constraints
- Local-first, web-first, cinematic interactive narrative. Prefer pre-rendered video plus HTML interaction; no mandatory Blender, realtime 3D, model training or complex distributed infrastructure.
- Story outcomes and evidence are determined by authored rules, never by unconstrained model output. The LLM is an optional dialogue provider, not a world-state authority.
- Offline fixtures are the default. No secrets in source control; no paid generation, new subscriptions, external service setup, downloads of large models, or destructive filesystem changes without explicit approval.
- Do not invent provider API contracts, local paths, tool availability, user metrics, or test results. Inspect the actual environment. Keep dependencies minimal and document additions.
- Generated media, raw reference assets and private character references stay out of Git. Record rights and provenance in asset manifests. No unauthorized likeness or voice cloning.
- Avoid editing outside the project. Never overwrite an existing repository, reset another worker's changes, force-push, or silently create a remote.

## Work protocol
One lead initially. Additional workers only after owner approval and verified task contracts. Each worker owns an isolated branch/worktree, a single task, and declared write paths. No overlapping ownership; lead alone edits shared contracts and integrates. Workers report task ID, base commit, changed paths, actual commands/results, blockers and proposed handoff. Lead reruns checks before merge. Never mark PASS without evidence. Stop at each phase gate.

## Definition of done
Acceptance criteria met, tests executed with recorded exit status, no secrets/assets accidentally tracked, scope checked, known limitations documented, human approval obtained where needed. Any contradiction is escalated rather than silently resolved. See orchestration/TASK_PROTOCOL.md.

## Visual production handoff
Follow `docs/05_VISUAL_PRODUCTION.md`. Codex is the designated creative and high-quality still-image worker; agy prepares asset requests and verifies Codex result manifests. Use verified built-in ImageGen only; manual dispatch is the fallback. No native movie rendering is assumed. Video uses the direct Metaso MiniMax-H3 HTTP API with private OSS signed references after budget approval. Never generate final media during Phase 0.

## DeepSeek roles
Read `docs/06_DEEPSEEK_INTEGRATION.md`. DeepSeek Harness is a planned execution worker under agy, disabled until separately approved; DeepSeek API is the preferred future runtime NPC provider, mock by default. Separate permissions and credentials. Do not install, authenticate, call the API, or activate workers in Phase 0. No model writes authoritative state.

## Mandatory video provider
Use Metaso (秘塔) exclusively for MiniMax-H3 video generation via direct HTTP API with private OSS signed references. Read `docs/07_METASO_VIDEO.md` and `contracts/video-provider.example.json`. No automatic fallback to MiniMax official or other endpoints. Phase 0 is offline only: inspect API and OSS configuration structure without exposing credentials, uploading files or calling APIs. Phase 2 paid calls require owner-approved budget and attempts.

Codex worker handoff: follow `docs/08_CODEX_HANDOFF.md`; agy remains lead. Phase 0 permits no worker dispatch. No automatic dispatch or paid image API without owner authorization.

## Three-agent controller
agy is the sole controller; Codex and DeepSeek Harness are planned workers. Follow docs/09_THREE_AGENT_BRIDGE.md. Phase 0 remains offline; Phase 0.5 requires separate owner approval and actual local receipts. No worker can dispatch another worker.


See `docs/10_MEDIA_CAPABILITY_GATE.md` for the mandatory v0.3.0 production gates.

## v0.3.0 production routing (authoritative)
Codex: ImageGen, creative/shot design, visual QC. agy: Nano Banana edits, sole OSS and Metaso direct HTTP authority. DeepSeek Harness: local ComfyUI Qwen-Image-2.1, FFmpeg and technical QC. All planned roles must be validated. No ComfyUI video, no native OpenAI video. Private OSS temporary signed references only, owner-approved cloud cost and upload. See docs/05, 07, 10, 11.

## Voice-first native AV requirement
Follow docs/12_VOICE_AND_NATIVE_AV.md: OmniVoice approved voice references precede speaking video; agy stages approved images and audio via private OSS and uses direct Metaso native reference-to-video with native audio. Preserve original dialogue audio. DeepSeek Harness checks streams and transcript; Codex reviews timbre, acting and lip sync. No forced post-dub or assumed exact voice reproduction. Runtime NPC TTS remains separate. Real capabilities require approved pilot evidence.

## Suno BGM requirement
Follow `docs/13_SUNO_BGM.md`, `contracts/music-provider.example.json` and `docs/00_PRODUCTION_BASELINE.md`. agy controls official Suno MCP and budgets (owner sign-in, no API key needed), Codex directs original instrumental cues and listening review, DeepSeek Harness prepares and checks local audio. REST access disabled and unverified; no unofficial API. Suno music remains a separate local track, ducked under H3 native dialogue; no music generation at runtime. Phase 0 offline only; Phase 2 authorization required for credits/downloads. Manual Suno import if verified MCP unavailable. No silent paid fallback.
