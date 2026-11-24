import {spawnSync} from 'node:child_process';
import os from 'node:os';
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8',timeout:5000});return r.status===0?(r.stdout||r.stderr||'available').trim().split('\n')[0]:'not available or not verified';}
console.log('Node:',process.version);console.log('OS:',os.platform(),os.release(),os.arch());console.log('CPU:',os.cpus()[0]?.model??'unknown');console.log('Memory GiB:',(os.totalmem()/2**30).toFixed(1));
for(const [cmd,args] of [['npm',['--version']],['git',['--version']],['ffmpeg',['-version']],['python3',['--version']]])console.log(`${cmd}:`,run(cmd,args));
const disk=spawnSync('df',['-h','.'],{encoding:'utf8',timeout:5000});console.log('Disk:',disk.status===0?disk.stdout.trim():'not verified');
console.log('Git root:',run('git',['rev-parse','--show-toplevel']));console.log('Git status:');const git=spawnSync('git',['status','--short','--branch'],{encoding:'utf8',timeout:5000});console.log(git.status===0?git.stdout.trim():'not a Git repository or Git unavailable');
console.log('ComfyUI / OmniVoice / agy: inspect actual installation manually; no service calls or model loading performed.');

// PATH check only; never execute a third-party harness or read credentials.
import {accessSync,constants} from 'node:fs';
import path from 'node:path';
const found=(process.env.PATH||'').split(path.delimiter).filter(Boolean).some(dir=>{try{accessSync(path.join(dir,'dsh'),constants.X_OK);return true;}catch{return false;}});
console.log('DeepSeek Harness (dsh PATH check only):',found?'candidate found; identity/login not verified':'not found on PATH; installation status unknown');
console.log('DeepSeek API: disabled; no credential or connectivity check performed.');

console.log('Metaso MiniMax-H3: designated provider; offline audit only, no credential or connectivity check performed.');

const codexFound=(process.env.PATH||'').split(path.delimiter).filter(Boolean).some(dir=>{try{accessSync(path.join(dir,'codex'),constants.X_OK);return true;}catch{return false;}});
console.log('Codex PATH:',codexFound?'candidate found; login/ImageGen/limits unverified':'not found on PATH; desktop availability unknown');

console.log('Media capabilities: ImageGen, Nano Banana, local Qwen-Image-2.1, private OSS staging and direct Metaso H3 HTTP separately unverified; follow docs/10_MEDIA_CAPABILITY_GATE.md. No live probes performed.');
console.log('ffprobe:',run('ffprobe',['-version']));

console.log('Voice-first OmniVoice references and Metaso native audio support: unverified; no audio generated/uploaded.');

console.log('Suno official MCP / REST: configured as disabled; OAuth, entitlement, quota and actual export unverified; no network or credential inspection.');
