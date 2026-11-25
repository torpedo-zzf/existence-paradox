import {readFileSync,existsSync} from 'node:fs';
import {validateEpisode} from '../src/engine.mjs';
const root=new URL('../',import.meta.url);
const required=['docs/12_VOICE_AND_NATIVE_AV.md','docs/11_OSS_STAGING.md','contracts/oss-provider.example.json','docs/10_MEDIA_CAPABILITY_GATE.md','contracts/media-capabilities.example.json','docs/09_THREE_AGENT_BRIDGE.md','scripts/agent-bridge.mjs','tests/agent-bridge.test.mjs','docs/08_CODEX_HANDOFF.md','docs/07_METASO_VIDEO.md','contracts/video-provider.example.json','docs/06_DEEPSEEK_INTEGRATION.md','contracts/ai-provider.example.json','src/dialogue-contract.mjs','tests/dialogue-contract.test.mjs','START_HERE.md','AGY_PROMPT.txt','AGENTS.md','README.md','docs/01_PRD.md','docs/02_WORLD_AND_STORY.md','docs/03_ARCHITECTURE.md','docs/04_MEDIA_PIPELINE.md','docs/05_VISUAL_PRODUCTION.md','contracts/media-request.schema.json','episodes/01/media-requests.example.json','orchestration/TASK_PROTOCOL.md','orchestration/QUEUE.json','contracts/episode.schema.json','episodes/01/opening.json','src/engine.mjs','tests/engine.test.mjs','scripts/validate-init.mjs','scripts/audit-env.mjs','.gitignore','.env.example','package.json'];
function check(condition,message){if(!condition)throw new Error(message);}
for(const path of required)check(existsSync(new URL(path,root)),`Missing ${path}`);
const read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
read('contracts/episode.schema.json'); // parse only; runtime validator checks episode shape and graph
validateEpisode(read('episodes/01/opening.json'));
const q=read('orchestration/QUEUE.json');
check(Number.isInteger(q.authorized_phase)&&q.authorized_phase>=0,'Invalid authorization');
const ids=new Map(q.tasks.map(t=>[t.id,t]));check(ids.size===q.tasks.length,'Duplicate task ID');
const active=new Set(),done=new Set();
function visit(id){check(!active.has(id),'Task dependency cycle');if(done.has(id))return;active.add(id);const t=ids.get(id);check(t,`Missing task ${id}`);check(Number.isInteger(t.phase)&&t.phase>=0&&['pending','in_progress','blocked','review','done'].includes(t.status)&&t.write_paths.length&&t.acceptance.length&&t.owner_role,'Invalid task contract');for(const dep of t.depends_on){check(ids.has(dep)&&ids.get(dep).phase<=t.phase,'Invalid dependency');visit(dep);}active.delete(id);done.add(id);}
for(const id of ids.keys())visit(id);
check(ids.get('INIT-001')?.phase===0,'Missing Phase 0');
console.log(`PASS: ${required.length} required paths; episode contract; ${ids.size} task contracts (structural checks).`);

read('contracts/media-request.schema.json'); // parse schema; targeted fixture checks below, not a full JSON Schema validator
const media=read('episodes/01/media-requests.example.json');
check(typeof media.episode_id==='string' && media.requests.length>0,'Invalid media batch');
const assetIds=new Set();
for(const r of media.requests){
  check(/^[A-Za-z0-9_-]+$/.test(r.asset_id)&&!assetIds.has(r.asset_id),'Invalid/duplicate asset ID');
  check(r.status==='requested'&&Number.isInteger(r.revision)&&r.revision>0&&r.prompt&&r.acceptance.length,'Invalid media fixture');
  check(r.reference_ids.every(id=>assetIds.has(id)),'Fixture reference must precede dependent asset');
  if(r.kind==='video')check(r.producer==='metaso_minimax_h3_direct'&&r.video_provider==='metaso'&&r.paid_approval_required===true&&r.duration_seconds>0,'Missing video cost/provider gate');
  else if(r.kind==='voice_reference')check(r.producer==='omnivoice_local'&&r.voice_id&&r.dialogue_text&&r.duration_seconds>=2&&r.duration_seconds<=15,'Invalid voice reference');
  else check(['codex_imagegen','comfyui_qwen_image_2_1','agy_nano_banana'].includes(r.producer),'Invalid still producer');
  assetIds.add(r.asset_id);
}
console.log(`PASS: ${assetIds.size} visual handoff fixture requests (targeted checks; no generation).`);

const ai=read('contracts/ai-provider.example.json');
check(ai.development.lead==='agy'&&ai.development.worker==='deepseek_harness'&&ai.development.enabled===false&&ai.development.authorization_required===true,'Unsafe dev worker defaults');
const rt=ai.runtime;
check(rt.default_provider==='mock'&&rt.preferred_live_provider==='deepseek_api'&&rt.live_enabled===false&&rt.authorized_phase===3&&rt.budget_approved===false&&rt.model_id===null&&rt.endpoint===null&&rt.session_cost_cap===null&&rt.state_authority==='deterministic_engine'&&rt.credentials_location==='server_only'&&rt.fallback==='authored_dialogue','Unsafe runtime defaults');
check(['max_turns','max_output_tokens','timeout_ms'].every(k=>Number.isInteger(rt[k])&&rt[k]>0),'Missing bounded runtime parameters');
check(q.authorized_phase>=0&&q.authorized_phase<=2,'Phase 3+ requires separate owner approval');
console.log('PASS: DeepSeek development/runtime separation and disabled offline defaults.');

const video=read('contracts/video-provider.example.json');
check(video.provider==='metaso'&&video.model==='MiniMax-H3'&&video.transport==='direct_http'&&video.comfyui_allowed===false&&video.reference_transport==='aliyun_oss_presigned_get'&&video.base_url==='https://metaso.cn/api/minimax'&&video.credential_env==='METASO_API_KEY','Invalid video provider lock');
check(video.enabled===false&&video.authorized_phase===2&&video.budget_approved===false&&video.batch_budget_cny===null&&video.max_attempts===null&&video.allow_reference_upload===false&&video.auto_retry===false&&video.automatic_provider_fallback===false,'Unsafe video defaults');
check(video.pricing_reference.verified_for_account===false&&video.pricing_reference.additional_input_charges_possible===true,'Unverified pricing must be explicit');
console.log('PASS: Metaso provider lock and offline budget/upload/retry defaults.');

check(ai.development.creative_worker==='codex'&&ai.development.creative_worker_enabled===false,'Unsafe Codex defaults');
console.log('PASS: Codex creative worker specified, disabled at initialization.');

const caps=read('contracts/media-capabilities.example.json');
check(caps.controller==='agy'&&JSON.stringify(caps.workers)===JSON.stringify(['codex','deepseek_harness'])&&caps.owner_approval_required===true&&caps.automatic_paid_fallback===false&&caps.live_media_phase===2,'Unsafe media capability control');
for(const key of ['image_generation','image_editing','video_generation','native_openai_video'])check(caps.capabilities[key]?.live_enabled===false,'Media must default disabled');
for(const key of ['image_generation','image_editing'])check(caps.capabilities[key].agent==='codex'&&caps.capabilities[key].producer==='codex_imagegen'&&caps.capabilities[key].status==='unverified','Missing explicit ImageGen capability');
check(caps.capabilities.video_generation.provider==='metaso'&&caps.capabilities.video_generation.agent==='agy'&&caps.capabilities.video_generation.status==='unverified'&&caps.capabilities.native_openai_video.status==='not_assumed','Invalid video boundary');
for(const [id,dep,role] of [['VIS-201','SLICE-104','codex'],['IMG-202','VIS-201','codex'],['IMG-205','IMG-202','lead/media'],['IMG-206','IMG-202','deepseek_harness'],['OSS-207','IMG-205','lead/media'],['VID-203','OSS-207','lead/media'],['QC-204','VID-203','deepseek_harness'],['MEDIA-201','QC-204','lead/media']]){const t=ids.get(id);check(t?.phase===2&&t.owner_role===role&&t.depends_on.includes(dep)&&['pending','in_progress','blocked','review','done'].includes(t.status),`Invalid media task ${id}`);}
console.log('PASS: separate ImageGen generation/editing, Metaso video and QC gates; no live capability verified.');

const oss=read('contracts/oss-provider.example.json');
check(oss.provider==='aliyun_oss'&&oss.enabled===false&&oss.allow_upload===false&&oss.private_bucket_required===true&&oss.public_access_allowed===false&&oss.persist_signed_urls===false&&oss.verified===false&&oss.bucket===null,'Unsafe OSS defaults');
check(ids.get('OSS-207').depends_on.includes('IMG-206'),'Missing Qwen dependency');
for(const [key,agent,producer] of [['nano_banana_edit','agy','agy_nano_banana'],['qwen_image','deepseek_harness','comfyui_qwen_image_2_1'],['oss_staging','agy','aliyun_oss_presigned_get']]){const c=caps.capabilities[key];check(c?.agent===agent&&c.producer===producer&&c.live_enabled===false&&c.status==='unverified','Invalid routing '+key);}
check(caps.capabilities.video_generation.producer==='metaso_minimax_h3_direct','Video transport mismatch');
console.log('PASS: three image routes, OSS private staging, direct Metaso transport and dependencies; all offline.');

check(ids.get('VOICE-208')?.phase===2&&ids.get('OSS-207').depends_on.includes('VOICE-208'),'Voice must precede OSS/video');
check(video.native_audio_required===true&&video.speaking_shot_mode==='reference_to_video'&&video.mix_first_last_with_reference_audio===false&&video.post_dub_default===false&&video.audio_reference_support_verified===false,'Unsafe native AV defaults');
check(caps.capabilities.voice.stage==='before_speaking_video'&&caps.capabilities.voice.live_enabled===false&&oss.staged_media_types.includes('audio'),'Missing voice-first staging');
for(const r of media.requests.filter(r=>r.kind==='video')){check(['native_ambience','native_reference_dialogue'].includes(r.audio_mode),'Missing audio mode');if(r.audio_mode==='native_reference_dialogue'){const refs=r.audio_reference_ids.map(id=>media.requests.find(a=>a.asset_id===id));check(r.dialogue_text&&refs.length>=1&&refs.length<=3&&refs.every(a=>a?.kind==='voice_reference'&&r.reference_ids.includes(a.asset_id))&&refs.reduce((n,a)=>n+a.duration_seconds,0)<=15,'Invalid native speech fixture');}}
console.log('PASS: voice-first task dependencies, native AV configuration and reference dialogue fixture; no live verification.');

for(const p of ['docs/00_PRODUCTION_BASELINE.md','docs/13_SUNO_BGM.md','contracts/music-provider.example.json','episodes/01/music-cues.example.json','tests/music-contract.test.mjs'])check(existsSync(new URL(p,root)),`Missing ${p}`);
const music=read('contracts/music-provider.example.json');
check(music.provider==='suno'&&music.selected_transport==='official_mcp'&&music.rest.allowed_in_baseline===false&&music.preferred_transport==='official_mcp'&&music.mcp_url==='https://api.suno.com/mcp'&&music.controller==='agy'&&music.live_enabled===false&&music.rest.enabled===false&&music.rest.endpoint===null&&music.credit_budget===null&&music.download_budget===null&&music.max_attempts===null&&music.automatic_paid_fallback===false&&music.owner_approval_required===true&&music.runtime_generation===false&&music.preserve_native_dialogue===true,'Unsafe music defaults');
check(caps.capabilities.bgm_generation?.live_enabled===false,'Suno must default disabled');
check(ids.get('BGM-209')?.depends_on.includes('VIS-201')&&ids.get('MIX-210')?.depends_on.includes('BGM-209')&&ids.get('MIX-210')?.depends_on.includes('QC-204')&&ids.get('MEDIA-201')?.depends_on.includes('MIX-210'),'Missing BGM integration gates');
console.log('PASS: Suno MCP-first offline configuration, separate score and dependency gates; no live verification.');
