# Suno score and adaptive BGM (v0.3.0)

## Provider and authority
Suno is the exclusive planned BGM producer. The owner reports an existing Pro subscription; no API key is available. agy is the sole controller, approves routing and handles Suno connection, generation budgets and ingestion. Codex is music director: original leitmotifs, cue sheet, prompts, dramatic placement and listening review. DeepSeek Harness executes local FFmpeg preparation, loop/timing/codec and technical QC; it never receives account credentials or independently generates paid music.

Use official Suno MCP (`https://api.suno.com/mcp`), authenticated by owner sign-in and consent. Official MCP uses the user's existing Suno plan credits and stores generated songs in the Suno library. Verify the actual agy client's remote MCP/OAuth support, tool list, account plan, credit balance, download allowance, instrumental generation and media export. If agy lacks working MCP support, it may delegate only the approved music task to Codex if its MCP/OAuth capability is independently verified. agy remains the sole approval/budget authority. Otherwise the owner generates and downloads tracks through suno.com and agy imports the files. Never use browser cookies, private endpoints, unofficial wrappers, or substitute third-party providers. Do not scrape or bypass quotas. Do not assume MCP can directly download files; manual authorized export is valid. No automatic fallback to another paid service.

REST API is excluded from this baseline by owner decision; no API key is needed or requested. Any future transport change requires an explicit architecture change approved by the owner. No fabricated endpoint or tool names. MCP may be used without an API key. Do not write OAuth tokens, browser cookies, keys or temporary download URLs into repo, logs, manifests or worker prompts.

## Setup on the Mac (after explicit authorization)
- In the installed agy client, inspect its actual custom remote MCP settings. Add server name `suno` and URL `https://api.suno.com/mcp` using the supported settings format; do not guess a configuration path or CLI flags. User completes official sign-in/consent in the client. Never copy OAuth tokens.
- Verify the connection and enumerate exposed tools. Inspect account plan and available credits/download limits if the connector exposes them; otherwise the owner confirms in Suno UI. Connection and generation are distinct approvals. The MCP endpoint is documented by Suno; agy-specific compatibility is unverified.
- If agy cannot connect, verify Codex's installed MCP client supports remote HTTP/OAuth and delegate only an approved music job under agy control. If both are blocked, use official Suno manual export and report the automation blocker. Do not switch providers.
- For the first paid-generation gate, approve one short original instrumental cue and a bounded attempt/download budget; verify the actual tool schema before calling. Record the actual library song ID, locally exported audio and SHA-256. No claim of automated download until proven.

## Production
1. Codex defines cue IDs, target emotional arc, original instrumental prompts, permitted scene/branch anchors and mix intent; owner approves the music direction. Music drafts may run in parallel with approved visuals and voice design; final cue boundaries follow picture lock.
2. agy requests a bounded number of approved Suno generations, records credit and download quotas before/after, song ID, source, creation/download dates and plan-at-creation evidence. No requests in Phase 0/0.5/1; Phase 2 only with explicit authorization covering generation credits and downloads. Unknown submission: reconcile in library before retry.
3. Import approved actual local audio, prefer WAV when legitimately available; otherwise use supported downloadable format. Store masters outside Git, verify decode and SHA-256. Record rights and provenance; no existing copyrighted music, artist imitation requests, unauthorized samples or voices. Owner reviews rights before release. Paid-plan commercial-use permission is not a copyright guarantee, and free-plan creations do not automatically gain retroactive rights.
4. DeepSeek Harness prepares loopable ambient cues and scene stingers with FFmpeg, checks seamless loops, loudness, clipping, silence, cue duration and decoded format. Codex reviews aesthetic and emotional continuity; agy approves final asset manifests and cue sheet.
5. Keep H3 native dialogue and ambience intact. For spoken video request no added music where supported; if unwanted baked-in score clashes, reject or review regeneration rather than overwrite speech. Default: BGM is a separate browser audio track under the deterministic cue engine; FFmpeg may mix a separate distribution trailer/master only with explicit approval, preserving native speech. Duck BGM under dialogue; fade across scene changes and choices; no duplicated baked score. Support mute/volume, pause/resume, seek, reload, replay and autoplay restrictions. Branch audio must be deterministic and locally cached. Missing optional BGM degrades to silence, never blocks the offline prototype; final production must pass the BGM gate or obtain explicit owner waiver.

## Initial cue plan (draft)
- BGM-001: Identity motif — understated analog synth/piano, lonely near-future unease.
- BGM-002: Investigation loop — quiet pulse, sparse textures, no distracting melody.
- BGM-003: Revelation — short dissonant sting, controlled dynamic peak.
- BGM-004: Emotional aftermath — restrained motif variation, ambiguous resolution.
No music files or real song IDs are included. Cue times and assets are illustrative; validate against actual episode and locked video.

## Acceptance
Actual approved downloaded file, provider song ID, hash, rights record, credit/download usage (unknown explicitly stated), decode/loop tests, owner listening approval, dialogue intelligibility and desktop/mobile cue playback evidence. Generation, import and mixing are distinct gates. No actual access asserted by this package.

## Official references (checked 2026-11-25)
- https://suno.com/mcp
- https://help.suno.com/en/articles/14551425
- https://help.suno.com/en/articles/14486145
- https://platform.suno.com/
- https://suno.com/pricing
- https://help.suno.com/en/articles/9601665
- https://help.suno.com/en/articles/13876865
