# Existence Paradox v0.3.0 (working title)
Episode 01: Identity Not Found. Near-future interactive science-fiction mystery. Start with START_HERE.md and AGENTS.md. Internal contracts use English; owner communication uses Chinese.

## Baseline
Node.js >=22, npm, Git. No dependencies, network, media or credentials required for `npm run verify` and `npm run audit:env`. This is an initialization baseline, not a finished game. Phase 1 player and production adapters are not implemented. No remote repository is configured.

## Production architecture
agy is the sole controller; Codex and DeepSeek Harness are required planned workers, disabled until approved and verified. Codex owns creative direction/ImageGen; agy owns Nano Banana edits, OSS staging and direct Metaso MiniMax-H3 HTTP jobs; DeepSeek Harness owns Qwen-Image-2.1 local ComfyUI batches and technical QC/FFmpeg. OmniVoice is local TTS. DeepSeek API is a separate optional runtime NPC provider, mock by default. No native OpenAI movie-video capability assumed. See docs/05, 07, 09, 10 and 11, contracts and queue. ComfyUI is NOT in the H3 path. Aliyun OSS is temporary private staging, not gameplay hosting. No actual API calls, uploads, worker verification or live adapters in this baseline.

## Voice-first native AV requirement
Follow docs/12_VOICE_AND_NATIVE_AV.md: OmniVoice approved voice references precede speaking video; agy stages approved images and audio via private OSS and uses direct Metaso native reference-to-video with native audio. Preserve original dialogue audio. DeepSeek Harness checks streams and transcript; Codex reviews timbre, acting and lip sync. No forced post-dub or assumed exact voice reproduction. Runtime NPC TTS remains separate. Real capabilities require approved pilot evidence.

## Suno BGM requirement
Follow `docs/13_SUNO_BGM.md`, `contracts/music-provider.example.json` and `docs/00_PRODUCTION_BASELINE.md`. agy controls official Suno MCP and budgets (owner sign-in, no API key needed), Codex directs original instrumental cues and listening review, DeepSeek Harness prepares and checks local audio. REST access disabled and unverified; no unofficial API. Suno music remains a separate local track, ducked under H3 native dialogue; no music generation at runtime. Phase 0 offline only; Phase 2 authorization required for credits/downloads. Manual Suno import if verified MCP unavailable. No silent paid fallback.
