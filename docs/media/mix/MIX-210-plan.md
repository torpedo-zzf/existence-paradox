# MIX-210 Technical Music QC & Mix Readiness Protocol

- **Status**: `offline_tooling_ready` (`MIX-210` remains `pending` in `orchestration/QUEUE.json` until approved Suno audio files are imported in `BGM-209`)
- **Owner Role**: `deepseek_harness` (local FFmpeg/ffprobe execution and technical QC; never holds Suno credentials or triggers paid generation)

## Automated Checks (`scripts/music-qc/run-music-qc.mjs`)
1. **Local-Only Provenance**: Rejects remote URLs (`http/https/s3/data/...`) before filesystem or FFmpeg access; verifies regular non-empty local file and SHA-256 checksum.
2. **Separate Score Enforcement**: Rejects any BGM file containing a video stream so score never duplicates or overwrites MiniMax-H3 native video/dialogue tracks.
3. **Decode & Loudness QC**: Verifies decodable audio stream (`ffprobe`) and inspects `mean_volume` / `max_volume` (`ffmpeg volumedetect`), failing closed on digital clipping (`>= 0 dB`) or pure silence (`<= -65 dB`).
4. **Loop Seam Telemetry**: For `loop: true` cues, samples the first 50 ms and last 50 ms mean levels to flag harsh loop boundary jumps.
5. **Silence Fallback Verification**: When `asset_path` is `null` in `episodes/01/music-cues.json`, validates `missing_bgm === "silence"`, `preserve_native_dialogue === true`, and `runtime_generation === false`.

## Reproducible Command
```bash
node scripts/music-qc/run-music-qc.mjs --cues episodes/01/music-cues.json
```
