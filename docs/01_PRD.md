# Product requirements — draft v0.1

## Product thesis
A cinematic sci-fi mystery for people who enjoy films, suspense, science fiction and story-driven games, including viewers who do not play traditional games. The value proposition is to become the protagonist and investigate a personal mystery; AI is a production/enabling tool, not the marketing proposition.

## Player promise
In 2042, a civil identity system declares the player dead three days ago. A duplicate is living the player's life. The player must decide whom to trust, which evidence to collect, and whether restoring their identity is worth the consequences. No mandatory combat, grinding, or complex controls.

## Target and scope
- First vertical slice: 3–5 minutes, one main location (apartment), one or two characters visible at most, one identity anomaly, at least two meaningfully different choices, one persistent evidence item, two distinct stopping outcomes, replay support. Temporary stills and placeholder clips are valid.
- First commercial episode, subject to approval: 15–25 minutes, 3–4 reusable locations, 3–5 named characters, 3 provisional endings. These are planning ceilings, not confirmed commitments.
- PC and mobile browser first, responsive landscape/portrait interaction, Simplified Chinese UI/subtitles, keyboard and touch support. WeChat mini program, Steam and localization are later evaluation items, not initial requirements.
- Half-defined protagonist; bounded NPC autonomy; local rather than global world simulation. Player can inspect objects, read messages, make decisions, ask constrained questions and review an evidence journal.

## Core loop
Watch -> observe -> investigate -> choose or question -> consequences -> review evidence -> continue. Player decisions must affect information, trust or route rather than only change a line of dialogue.

## MVP requirements
P0: authored scene graph, video/still playback abstraction, captions, choice UI, evidence journal, deterministic state transitions, save/reload/restart, error recovery, mobile usability, replay without corrupting saves.
P1 after approval: optional bounded NPC conversation, provider adapters, voice synthesis and generated clip ingestion. LLM unavailability must not block gameplay.
P2: additional episodes, account/cloud sync, platform-specific packaging, telemetry beyond local development. Explicit consent and privacy design before analytics.

## Non-goals
Open-world simulation, real-time generated movies, multiplayer, inventory grind, photorealistic realtime 3D, autonomous agents changing canon, automatic public publishing, paid API calls during initialization.

## Validation hypotheses (provisional, not benchmarks)
Recruit 15–30 target testers for a small qualitative study; separately compare three spoiler-free hooks on Bilibili/Douyin if approved. Record completion, time to first meaningful choice, voluntary replay, comprehension of the mystery, and stated willingness to play/pay. Initial internal thresholds to revisit: >=70% of testers finish the short slice, >=30% voluntarily replay or ask for continuation, and at least half can articulate the core mystery unaided. These are exploratory signals, not statistically representative demand or revenue forecasts. Do not collect private data by default.

## Launch gate
The owner approves story, visual direction, budget, asset rights and distribution after a tested slice. No launch pricing or release date is committed.

## AI provider decision
DeepSeek API is the preferred Phase 3 live NPC provider, mock/authored fallback by default. DeepSeek Harness is a planned execution worker, not a runtime dependency. See docs/06_DEEPSEEK_INTEGRATION.md.


See `docs/10_MEDIA_CAPABILITY_GATE.md` for the mandatory v0.3.0 production gates.

## Voice-first native AV requirement
Follow docs/12_VOICE_AND_NATIVE_AV.md: OmniVoice approved voice references precede speaking video; agy stages approved images and audio via private OSS and uses direct Metaso native reference-to-video with native audio. Preserve original dialogue audio. DeepSeek Harness checks streams and transcript; Codex reviews timbre, acting and lip sync. No forced post-dub or assumed exact voice reproduction. Runtime NPC TTS remains separate. Real capabilities require approved pilot evidence.

## Suno BGM requirement
Follow `docs/13_SUNO_BGM.md`, `contracts/music-provider.example.json` and `docs/00_PRODUCTION_BASELINE.md`. agy controls official Suno MCP and budgets (owner sign-in, no API key needed), Codex directs original instrumental cues and listening review, DeepSeek Harness prepares and checks local audio. REST access disabled and unverified; no unofficial API. Suno music remains a separate local track, ducked under H3 native dialogue; no music generation at runtime. Phase 0 offline only; Phase 2 authorization required for credits/downloads. Manual Suno import if verified MCP unavailable. No silent paid fallback.
