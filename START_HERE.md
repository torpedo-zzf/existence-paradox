# 《存在悖论：查无此人》项目初始化包

> 项目代号 Existence Paradox / Episode 01: Identity Not Found。中文名称和英文名称都是暂定，未进行商标或平台重名核查。

## 目标
做一部近未来科幻悬疑互动电影：玩家突然发现自己在官方系统中已死亡，另一个拥有相同身份的人正在过着原来的生活。玩家通过调查、观察、对话、选择和承担后果寻找真相。以《底特律：变人》的叙事深度为长期参考，以《The Complex》的有限场景、电影化表现为初期规模参考；不复制现有作品的剧情或资产。

## 在 Mac 上初始化
1. 将整个压缩包解压到一个**新目录**。建议项目目录 `/Users/yul/work/games/existence-paradox`，不要覆盖现有仓库。
2. 把解压得到的 `existence-paradox-init-v0.3.0` 文件夹重命名为 `existence-paradox`（如果已在同名目录中，确保根目录直接包含 `AGENTS.md`）。
3. 在终端进入项目根目录：`cd /Users/yul/work/games/existence-paradox`。执行 `node --version`，需要 Node.js 22 或以上。
4. 在此目录打开 agy，粘贴 `AGY_PROMPT.txt` 的全文。无需假定 agy 的 CLI 参数或安装方式。
5. 本包可先独立验证：`npm run verify`。无需安装第三方依赖或下载模型。
6. agy 完成 Phase 0 后，检查它的报告，先申请 Phase 0.5 联通验收授权，通过后再授权 Phase 1。不要直接让它生成完整游戏或调用付费模型。

## 本包已经包含
- 英文内部研发文档：PRD、原创世界观与首章草案、技术架构、生产规范、任务与验收规则。
- 一个可校验的开场剧情 JSON 样例、JSON Schema、无外部依赖的剧情状态机与自动化测试。
- Phase 0 自检脚本、初始化指令、环境变量样例和 Git 忽略规则。

## 未包含 / 不代表完成
未提供可运行的网页播放器、真实影片、演员素材、在线服务、完整剧本、真实 AI 工作流接入、部署与发布功能。云端视频生成费用和本机 OmniVoice 性能尚未验证。状态机只是初始参考实现。样例剧情仅用于验证分支，不代表首章定稿。

## 先做什么
先跑通本地无付费依赖的开场试玩（3–5 分钟），再决定是否投入高质量影片；完整首章目标 15–25 分钟是暂定规划，不是本次初始化交付物。产品、故事、画质均需通过试玩验证。用户沟通中文，内部研发、任务与协议使用英文。

## v0.3.0 正式架构
agy 唯一主控；Codex 负责创意、ImageGen、分镜；DeepSeek Harness 负责本机 ComfyUI/Qwen-Image-2.1 批量图片、FFmpeg 与质检；agy 负责 Nano Banana 一致性编辑、阿里云 OSS 临时参考素材上传、Metaso MiniMax-H3 直接 HTTP 视频任务。视频禁止经过 ComfyUI。统一视觉资产库与 SHA-256 去重，先审核再上传。OSS 私有 Bucket、预签名 GET URL、最小权限、按任务生命周期清理。原始及完成素材保留本机，游戏不依赖 OSS 或视频 API。
Phase 0 仅离线盘点；Phase 0.5 单独授权验证两个 worker（`npm run agents:smoke` 默认 dry run，批准后 `npm run agents:smoke -- --approve-live`），之后才授权 Phase 1。Phase 2 单独审批图片、OSS 上传与视频生成预算，先验证真实文件。阅读 docs/07_METASO_VIDEO.md、docs/10_MEDIA_CAPABILITY_GATE.md、docs/11_OSS_STAGING.md。无真实接入或付费调用，OSS 地域和域名待确认。已有项目须在独立目录审查合并，不得覆盖。

语音架构（v0.3.0 强制）：先由本地 OmniVoice 建立固定角色声音档案，agy 将获批参考音频和图片经私有 OSS 临时 URL 提交 Metaso MiniMax 原生兼容 API，以 reference-to-video 音画同出，保留原生对白；禁止默认后期覆盖对白。Codex 审核音色与口型，DeepSeek Harness 质检音视频流及台词。先验证真实接口支持，失败则阻塞并汇报，不自动切换供应商。Phase 0 不调用。详见 docs/12_VOICE_AND_NATIVE_AV.md。

## v0.3.0 Suno 背景音乐
先读 docs/00_PRODUCTION_BASELINE.md（完整技术分工）和 docs/13_SUNO_BGM.md。Suno Pro 已订阅（用户报告），无 API Key；固定使用官方 MCP https://api.suno.com/mcp，须用户亲自 OAuth 授权，先验证 agy 是否支持，否则由 agy 授权已验证的 Codex MCP 或手动导入官网音乐。不使用 REST API，不需要 API Key。初始化不登录、不生成、不下载、不消耗额度。音乐独立于 H3 原生对白轨，动态降低 BGM 音量、分支切换淡入淡出；缺音乐时静音降级。Suno、OSS、Metaso 和 Agent 真实联通均需另行授权验证。
