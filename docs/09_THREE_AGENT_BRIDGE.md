# Three-agent bridge — agy as sole controller

agy is the sole owner-facing controller. Codex and DeepSeek Harness are planned execution workers, not independent controllers. DeepSeek NPC runtime API remains a separate service. No worker may recruit other agents or merge main. Phase 0 remains offline; neither worker is enabled until explicit owner approval and local validation.

## Phase 0.5 — connectivity gate (separate owner approval)

1. Verify actual executable paths, versions, account login and local help for agy, codex and dsh. Do not install or log in automatically. Use the existing account login, not runtime or video API keys. If account login is unavailable, report blocked and request owner action.
2. `npm run agents:smoke` is dry-run only. After the owner approves two small model requests, agy itself must execute `npm run agents:smoke -- --approve-live` and capture its actual exit code and both JSON receipts. The script uses a temporary directory, read-only worker modes, no interactive approvals for dsh, 120-second per-worker timeout, random exact-response challenges, no retries, and does not print raw model logs. It strips common API key variables; it does not guarantee isolation from all local account settings or credential stores. Confirm local sandbox settings before running. No ImageGen, media API, or runtime NPC calls. A missing executable, auth failure, timeout, unsupported flags, malformed reply or missing challenge is a blocked result. Never bypass permissions. A pass validates only invocation and response, not worker file editing or ImageGen.
3. Next, with separate approval and a clean committed baseline, agy creates two distinct Git worktrees and assigns synthetic tasks with disjoint write paths. Confirm each worker edits only its assigned fixture, tests pass, main remains unchanged, and each produces a verifiable diff. agy alone reviews and integrates after owner approval. No production implementation yet.
4. Separately test failure handling (missing executable, timeout, invalid result and path conflict) with fixtures, never paid retries. Report real local evidence and stop for phase authorization.

## Production dispatcher requirements (not implemented in this starter)

Use a small Node.js CLI adapter, no extra orchestrator service. Read authoritative QUEUE.json, check owner phase authorization and dependency status, atomically claim task, create isolated worktree from approved base, enforce write-path claims, capture exit code and result, validate changed paths and run acceptance tests. Persist state pending -> in_progress -> review -> done or blocked. Require a reviewed diff, not self-reported success. Bound concurrency to two workers and permit at most one writer per shared path; no automatic retries, model changes, credential changes, paid media calls or pushes. Report conflicts to agy. Worktree is not a security sandbox; use native worker sandbox permissions and verify changes independently. Save only sanitized metadata, not reasoning or secrets. agy can call the dispatcher after scoped shell authorization; never use blanket permission bypass. agy is the only scheduling authority by project policy, not an OS-enforced identity.

References: https://antigravity.google/docs/cli/headless/ ; https://learn.chatgpt.com/docs/non-interactive-mode ; https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md . CLI versions and local flags must be rechecked.


See `docs/10_MEDIA_CAPABILITY_GATE.md` for the mandatory v0.3.0 production gates.
