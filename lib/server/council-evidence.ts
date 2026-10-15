import type {Research} from '../terminal-engine.ts';
// Keep held-out measurements, risk evidence and source labels; omit bulky chart/profile arrays.
export function councilResearch(research:Research){
 const lab=research.strategy_lab;
 return {model:research.model,as_of:research.as_of,candidate:research.candidate,active_tolerance:research.active_tolerance,decision:research.decision,methodology:research.methodology,studies:research.studies,snapshot:research.snapshot?{reason:research.snapshot.reason,display_levels:research.snapshot.display_levels?.slice(-4)}:undefined,strategy_lab:lab?{as_of:lab.as_of,bars:lab.bars,coverage_days:lab.coverage_days,split:lab.split,training_selected:lab.training_selected,candidate:lab.candidate,decision:lab.decision,methodology:lab.methodology,limitations:lab.limitations,profile_context:lab.profile_context,profile:{start_time:lab.profile.start_time,end_time:lab.profile.end_time,poc:lab.profile.poc,val:lab.profile.val,vah:lab.profile.vah,methodology:lab.profile.methodology},studies:lab.studies.map(s=>({strategy:s.strategy,parameter:s.parameter,train:s.train,validation:s.validation,test:s.test,stress_test:s.stress_test}))}:undefined};
}
// Bound prompts before inference; full evidence remains in the database and vault.
export function compactCouncilInput(raw:string,maximumBytes=9000){
 const value=JSON.parse(raw);
 if(typeof value.evidence==='string'){try{value.evidence=JSON.parse(value.evidence);}catch{throw new Error('Council evidence could not be decoded');}}
 const originalQuestion=String(value.ownerQuestion||'');value.ownerQuestion=originalQuestion.slice(0,800);value.questionTruncated=originalQuestion.length>800;
 value.obsidianMemory=(value.obsidianMemory||[]).slice(0,2).map((m:{name:string;text:string})=>({name:m.name,text:m.text.slice(0,350),truncated:true}));
 value.teamDiscussion=(value.teamDiscussion||[]).slice(-2).map((m:{role:string;text:string})=>({role:m.role,text:m.text.slice(0,550),truncated:true}));
 const e=value.evidence||{},r=e.research||{},lab=r.strategy_lab;
 if(r.snapshot)r.snapshot={reason:String(r.snapshot.reason||'').slice(0,180),display_levels:r.snapshot.display_levels?.slice(-3)};
 r.methodology=String(r.methodology||'').slice(0,260);
 if(lab){lab.methodology=String(lab.methodology||'').slice(0,260);lab.limitations=lab.limitations?.slice(0,3);const selected=lab.studies?.find((s:{strategy:string;parameter:number})=>s.strategy===lab.training_selected?.strategy&&s.parameter===lab.training_selected?.parameter);lab.studies=[...(selected?[selected]:[]),...(lab.studies||[]).filter((s:unknown)=>s!==selected)].slice(0,3);}
 if(e.paper){e.paper.openPositions=e.paper.openPositions?.slice(0,3);e.paper.fills=e.paper.fills?.slice(-2);}
 if(e.recordedOutcomes){e.recordedOutcomes.recent=e.recordedOutcomes.recent?.slice(0,3);e.recordedOutcomes.pausedCount=e.recordedOutcomes.pausedContexts?.length||0;e.recordedOutcomes.pausedContexts=e.recordedOutcomes.pausedContexts?.slice(0,3);e.recordedOutcomes.methodology=String(e.recordedOutcomes.methodology||'').slice(0,220);}
 e.demoOrders=e.demoOrders?.slice(0,2);e.historicalExperiments=e.historicalExperiments?.slice(0,1);
 value.evidence=e;value.omissions='Bounded evidence summary. Memory/discussion, methodology, positions and strategy rows may be omitted or truncated. Do not invent omitted data or claim a new experiment ran. Full measurements remain in the vault.';
 const size=()=>Buffer.byteLength(JSON.stringify(value),'utf8');
 if(size()>maximumBytes){value.obsidianMemory=[];value.teamDiscussion=value.teamDiscussion.map((m:{role:string;text:string})=>({...m,text:m.text.slice(0,250)}));if(lab)lab.studies=lab.studies?.slice(0,1);r.studies=r.studies?.slice(0,1);if(e.paper){e.paper.fills=[];e.paper.openPositions=[];}}
 if(size()>maximumBytes){if(e.recordedOutcomes){e.recordedOutcomes.recent=[];e.recordedOutcomes.pausedContexts=[];}value.ownerQuestion=value.ownerQuestion.slice(0,300);value.questionTruncated=originalQuestion.length>300;value.teamDiscussion=[];e.historicalExperiments=[];if(lab){lab.limitations=[];lab.methodology='See full vault report';}r.methodology='See full vault report';}
 if(size()>maximumBytes)throw new Error('Research evidence exceeds the bounded council prompt; use a shorter question. No inference was made.');
 return JSON.stringify(value);
}
export function rateResetSeconds(headers:Headers,now=Date.now()):number|undefined{
 const retry=headers.get('retry-after');
 if(retry){const seconds=Number(retry);if(Number.isFinite(seconds)&&seconds>=0)return Math.ceil(seconds);const date=Date.parse(retry);if(Number.isFinite(date))return Math.max(0,Math.ceil((date-now)/1000));}
 const reset=headers.get('x-ratelimit-reset-tokens');if(!reset)return undefined;
 const match=/^(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(reset);
 return match&&(match[1]||match[2])?Math.ceil(Number(match[1]||0)*60+Number(match[2]||0)):undefined;
}

export function councilFacts(context:{exchange:string;source:string;timeframe:string}){
 const seconds=({'5m':300,'15m':900,'1h':3600,'4h':14400} as Record<string,number>)[context.timeframe];
 return {dataProvenance:context.source==='demo'?'Synthetic historical sample generated by Penguin. Not actual Binance demo candles, live market evidence or a future holdout.':context.exchange==='binance-demo'?'Exchange-backed Binance USD-M demo data; simulated funds.':'Exchange closed candles; paper orders remain simulated.',barSeconds:seconds??null,barsIn48Hours:seconds?172800/seconds:null,barsIn12Hours:seconds?43200/seconds:null,baselineResearchProtocol:{split:'70/30 chronological; training selects, holdout vetoes',entry:'Long-only 0.618 reclaim; next-bar open',stop:'Anchor end price multiplied by 0.998; accept risk only within 0.2–4% of entry',target:'Entry plus twice the accepted price risk (2R)',timeoutBars:24,feesBpsPerSide:12},researchLabProtocol:{split:'60/20/20 chronological',stopDistanceATR:2,rewardRiskRatio:2,targetDistanceATR:4,timeoutBars:24,feesBpsPerSide:12,stressFeesBpsPerSide:24,entry:'Next-bar open; nominal long target = entry + 4*ATR, stop = entry - 2*ATR.'},executionProtocol:'Paper automation is retired. New demo market entries use Penguin demo-fixed-risk-v1: native MARK_PRICE SL 2% from preview mark, TP1/TP2/TP3 1R/2R/3R from that reference and 40/30/30 filtered reducing quantities; fill slippage changes actual R. Brackets are submitted after entry; never call protection active without verified acknowledgements. Legacy positions retain sampled monitoring. This is not the original confluence worker. ATR research exits and AI proposals are not automatically deployed.',statistics:'A chronological non-overlapping split from one period does not itself prove look-ahead leakage. Training-only selection is implemented; repeated holdout inspection remains selection risk. A few positive trades do not establish significance. No p-value is supplied; never invent one or equate R drawdown with equity percent.',paperPnlUnit:'USD; a fill pnl is an absolute currency amount, not a percentage. Percentage requires a specified denominator.',experimentStatus:'Proposals only; no new forward experiment has been executed. Keep proposed acceptance criteria consistent across roles, or explicitly label and justify a revision.'};
}
