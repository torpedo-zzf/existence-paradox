# Codex creative worker and local handoff

agy remains the lead/sole task coordinator; Codex is the designated creative and visual worker, DeepSeek Harness is a planned execution worker, and DeepSeek API is a separate runtime provider. ChatGPT discussion is not an execution dependency. See https://openai.com/index/introducing-images-2-6/ for announced Codex image capability. Installed version, entitlement, limits and dispatch are unverified. Do not assume API access is included in a subscription.

Phase 0: check executable presence only, inspect non-secret configuration if available, report capability as unknown unless evidenced. No job dispatch or generation. Phase 1: mock assets only. Phase 2: owner approves task and tool usage before generation. Use Codex built-in ImageGen when available; no separate paid API or browser automation without approval.

## File handoff
agy issues an English task JSON containing task_id, base_commit, asset_ids, request_file, allowed_write_paths, approved_reference_ids, max_attempts, cost authorization, acceptance checks. One writer per path. Owner opens Codex in the isolated worktree or authorized project path and submits the task manually until an authorized dispatch mechanism is tested. Codex reads AGENTS.md and the task, writes candidates only to assets/inbox/<asset-id>/ and a result JSON to docs/media/handoffs/<task_id>.json. Result includes task_id, base_commit, status, output paths, SHA-256, dimensions, actual provider/tool, cost or unknown, limitations and blockers. agy verifies files and hashes, obtains owner approval and imports assets. Do not mark missing files as delivered. No automatic commits, pushes, retries or tool substitutions. No secret in handoff files. If tool unavailable, report blocked or owner-approved manual asset delivery, with actual provenance. No automatic dispatch code is shipped.


See `docs/10_MEDIA_CAPABILITY_GATE.md` for the mandatory v0.3.0 production gates.
