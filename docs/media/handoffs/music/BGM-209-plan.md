# BGM-209 Offline Music Direction & Authorization Plan (Episode 01 Slice)

- **Status**: `offline_ready_awaiting_owner_suno_auth` (`BGM-209` remains `pending` in `orchestration/QUEUE.json`)
- **Provider Lock**: Suno only (`official_mcp` at `https://api.suno.com/mcp`, or `owner_manual_suno_download` fallback via `suno.com`). REST API disabled; no unofficial APIs, cookies, or third-party fallbacks.
- **Runtime Policy**: `runtime_generation: false`, `preserve_native_dialogue: true`, `missing_bgm: "silence"`.

## Cue Sheet Mapping (`episodes/01/music-cues.json`)

| Cue ID | Title | Scene Anchors (`ep01-slice`) | Loop | Base Gain | Duck Gain | Dramatic Role |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| `BGM-001` | Identity Motif (Cold Dawn) | `wake` | Yes | 0.60 | 0.30 | Opens cold-dawn disorientation under native bedroom ambience (`EP01-S01-VID01-768p.mp4`). |
| `BGM-002` | Investigation Loop (Missing Three Days) | `terminal_check`, `door_anomaly`, `clinic_clue` | Yes | 0.65 | 0.28 | Continuous low-profile investigative pulse across the 3 apartment/terminal clue scenes. |
| `BGM-003` | Revelation & Crossroads Tension | `lin_call`, `crossroads` | Yes | 0.55 | 0.20 | Carries tension from Lin's encrypted call (`EP01-S05-VID01-r4-768p.mp4`) into the elevator crossroads; ducks aggressively under native H3 speech. |
| `BGM-004` | Emotional Aftermath (Double Shadow) | `ending_archive`, `ending_meeting` | No | 0.65 | 0.30 | Ambiguous restrained resolution for both endings. |

## Native Audio & Ducking Rules
1. Never replace, re-dub, or overwrite MiniMax-H3 native dialogue (`EP01-S05-VID01-r4-768p.mp4`) or native ambience (`EP01-S01-VID01-768p.mp4`).
2. BGM is delivered as a separate local audio track managed by `src/player/bgm-engine.mjs`.
3. When a scene plays spoken video or non-narrator dialogue beats, BGM ducks smoothly to `base_gain * duck_gain`.
4. When any cue has `asset_path: null` or fails to load/decode, the player degrades cleanly to `silence_fallback` without blocking gameplay.

## Gate Before Any Live Suno Generation or Import
Before transitioning `BGM-209` from `pending` to live execution, the product owner must explicitly approve:
1. Transport route: verified official Suno MCP OAuth (`https://api.suno.com/mcp`) OR manual generation/export on `suno.com`.
2. Credit budget, download budget, and max attempt cap for the 4 cues.
3. Plan-at-creation & rights review for every imported local audio file (`assets/inbox/music/`), recorded with SHA-256 and song ID via `providers/music/suno-adapter.mjs`.
