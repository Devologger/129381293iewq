import type {Research} from '../terminal-engine.ts';
// Keep held-out measurements, risk evidence and source labels; omit bulky chart/profile arrays.
export function councilResearch(research:Research){
 const lab=research.strategy_lab;
 return {model:research.model,as_of:research.as_of,candidate:research.candidate,active_tolerance:research.active_tolerance,decision:research.decision,methodology:research.methodology,studies:research.studies,snapshot:research.snapshot,strategy_lab:lab?{as_of:lab.as_of,bars:lab.bars,coverage_days:lab.coverage_days,split:lab.split,training_selected:lab.training_selected,candidate:lab.candidate,decision:lab.decision,methodology:lab.methodology,limitations:lab.limitations,profile_context:lab.profile_context,profile:{start_time:lab.profile.start_time,end_time:lab.profile.end_time,poc:lab.profile.poc,val:lab.profile.val,vah:lab.profile.vah,methodology:lab.profile.methodology},studies:lab.studies.map(s=>({strategy:s.strategy,parameter:s.parameter,train:s.train,validation:s.validation,test:s.test,stress_test:s.stress_test}))}:undefined};
}
export function rateResetSeconds(headers:Headers,now=Date.now()):number|undefined{
 const retry=headers.get('retry-after');
 if(retry){const seconds=Number(retry);if(Number.isFinite(seconds)&&seconds>=0)return Math.ceil(seconds);const date=Date.parse(retry);if(Number.isFinite(date))return Math.max(0,Math.ceil((date-now)/1000));}
 const reset=headers.get('x-ratelimit-reset-tokens');if(!reset)return undefined;
 const match=/^(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(reset);
 return match&&(match[1]||match[2])?Math.ceil(Number(match[1]||0)*60+Number(match[2]||0)):undefined;
}
