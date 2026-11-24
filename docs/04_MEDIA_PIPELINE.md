# Cinematic asset production plan

## Visual direction
Near-future psychological thriller: restrained color, believable lighting, subtle signs of advanced infrastructure, consistent character appearance, selective close-ups. Prioritize suspense and clarity over spectacle. Original composition and licensed assets only.

## Workflow after owner approval
1. Write scene beats and shot list; assign immutable shot and actor IDs.
2. Establish approved character reference sheet, wardrobe, location continuity and lighting. Obtain rights and consent for likenesses/voices.
3. Prototype with low-cost stills and temporary audio. Use Codex ImageGen as the primary high-quality visual source via approved task handoff; use Nano Banana for consistency edits and verified local Qwen-Image-2.1 ComfyUI for supporting batches. Follow docs/05_VISUAL_PRODUCTION.md and record source and terms.
4. Establish approved local OmniVoice character voice references and shot dialogue timing before any speaking video. Follow docs/12_VOICE_AND_NATIVE_AV.md.
5. Stage approved images and audio in private OSS, then generate native audiovisual clips through direct Metaso MiniMax-H3 HTTP reference-to-video. Preserve native speech; do not default to post-dubbing. Pre-render offline; verify actual provider inputs and billing before use.
6. Review consistency, lip sync, continuity, timing, subtitles, rights, and cost. Reject bad shots; no automatic retries without limits.
7. Encode distribution media with FFmpeg if available; target H.264/AAC MP4 for broad compatibility, test on target browsers. Retain masters outside Git.
8. Register media via manifest; player accesses approved assets by ID. Missing assets use authored fallback stills/text.

## Asset record
Each asset: ID, episode, relative file path, type, duration if known, source/provider, generation parameters or workflow version, consent/license status, review status, cost if known, checksum when finalized. Never store secrets or private reference material in manifest. Only approved assets enter a release.

## Cost gate
Owner approves budget per batch and total ceiling before cloud calls. Log estimated and actual usage. No assumption about current prices. Limit clip duration, variants and retries; cache approved assets. Phase 0 and Phase 1 use zero paid generation by default.

See `05_VISUAL_PRODUCTION.md` for the owner-mediated image/video handoff and request contract.

Metaso is the only authorized MiniMax-H3 provider. See `docs/07_METASO_VIDEO.md`; estimate input and output charges and obtain explicit approval before submitting a job. Store task IDs and reconcile unknown submissions before any retry.


See `docs/10_MEDIA_CAPABILITY_GATE.md` for the mandatory v0.3.0 production gates.

## Suno BGM requirement
Follow `docs/13_SUNO_BGM.md`, `contracts/music-provider.example.json` and `docs/00_PRODUCTION_BASELINE.md`. agy controls official Suno MCP and budgets (owner sign-in, no API key needed), Codex directs original instrumental cues and listening review, DeepSeek Harness prepares and checks local audio. REST access disabled and unverified; no unofficial API. Suno music remains a separate local track, ducked under H3 native dialogue; no music generation at runtime. Phase 0 offline only; Phase 2 authorization required for credits/downloads. Manual Suno import if verified MCP unavailable. No silent paid fallback.
