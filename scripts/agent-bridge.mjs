import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
export function workerCommand(worker, token) {
  const prompt = `Connectivity test only. Do not use tools, edit files, delegate, or access external services other than your own model. Reply with exactly ${token}`;
  if(worker==='codex') return ['codex',['exec','--sandbox','read-only','--json','--skip-git-repo-check',prompt]];
  if(worker==='deepseek') return ['dsh',['--profile','headless','--permission-mode','read-only','--approval-policy','never',prompt]];
  throw Error('Unknown worker');
}
export function validReply(worker, result, token) {
  if(result.error || result.status!==0 || result.signal) return false;
  if(worker==='deepseek') return String(result.stdout).trim()===token;
  if(worker!=='codex') return false;
  let final;
  try { for(const line of String(result.stdout).trim().split('\n')) {const event=JSON.parse(line);if(event.type==='item.completed'&&event.item?.type==='agent_message')final=event.item.text;} } catch {return false;}
  return final?.trim()===token;
}
export function probe(worker, token, cwd, execute=spawnSync) {
  const [command,args]=workerCommand(worker,token);
  const env={...process.env};
  // Development login must be independent of media and runtime credentials.
  for(const key of ['METASO_API_KEY','MINIMAX_API_KEY','DEEPSEEK_API_KEY','OPENAI_API_KEY','CODEX_API_KEY','SUNO_API_KEY','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET','OSS_SECURITY_TOKEN']) delete env[key];
  const result=execute(command,args,{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe'],killSignal:'SIGKILL'});
  return {worker,exit_code:result.status??null,signal:result.signal??null,passed:validReply(worker,result,token),error_code:result.error?.code??null};
}
function main(){
  const args=process.argv.slice(2);
  if(args.length===0){console.log('DRY RUN: no worker invoked. Live smoke requires owner approval for model usage and: npm run agents:smoke -- --approve-live');return;}
  if(args.length!==1||args[0]!=='--approve-live'){console.error('Unknown arguments; no worker invoked.');process.exitCode=2;return;}
  const cwd=mkdtempSync(join(tmpdir(),'ep-agent-smoke-'));
  try {for(const worker of ['codex','deepseek']){const token='EP_'+randomBytes(8).toString('hex');const report=probe(worker,token,cwd);console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;}} finally {rmSync(cwd,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
