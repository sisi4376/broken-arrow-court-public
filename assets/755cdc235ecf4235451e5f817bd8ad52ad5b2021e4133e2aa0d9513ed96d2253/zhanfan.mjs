import { filters, minimumGames, sentencingWindow } from './queries.mjs';
import { classifyAirLoadout } from './air-superiority.mjs';
import { CONTEXT_RULES, contextualEvidence, INDEPENDENT_RULES, independentEvidence, independentRatioPenalty, STACKED_CORRECTIONS, stackedEvidence } from './court-model.mjs';

export const ZHANFAN_MODEL = {
  version: 'zhanfan-v2', prior_games: 10, raw_baseline: 40, baseline: 50, max_months: 360, life_months: 240,
  calibration: [{raw:0,score:0},{raw:20,score:10},{raw:30,score:25},{raw:40,score:50},{raw:50,score:75},{raw:60,score:90},{raw:100,score:100}],
  sentencing: {acquittal_score:25,life_score:85,exponent:1.4},
  exchange_buffer: 500, friendly_fire_limit: 0.05, supply_buffer: 1000,
  dimensions: [
    {key:'exchange',name:'战损交换',weight:25,prior:50},
    {key:'output',name:'战斗 / 后勤产出',weight:20,prior:50},
    {key:'contribution',name:'占点 / 支援贡献',weight:20,prior:50},
    {key:'victory',name:'胜负表现',weight:15,prior:50},
    {key:'discipline',name:'友伤约束',weight:10,prior:0},
    {key:'dependency',name:'低产出补给依赖',weight:10,prior:0},
  ],
  sentence_bands: [
    {max_months:0,name:'当庭释放',flavor:'本庭宣布：这顿饭你坐主桌，饭勺不予没收。'},
    {max_months:11,name:'不足 1 年',flavor:'饭勺暂扣，训练场签到后再来申请加饭。'},
    {max_months:35,name:'1 至不足 3 年',flavor:'情节较轻，准予带饭复盘，不准带兵送餐。'},
    {max_months:59,name:'3 至不足 5 年',flavor:'建议把“再来一碗”改成“再看一遍回放”。'},
    {max_months:119,name:'5 至不足 10 年',flavor:'今日加餐：战损复盘。吃完这一局再开下一局。'},
    {max_months:179,name:'10 至不足 15 年',flavor:'表现良好可减刑，补给车已经在门口等你了。'},
    {max_months:239,name:'15 至不足 20 年',flavor:'本庭建议：先把饭碗放下，再把部队拉出火力圈。'},
    {max_months:null,name:'20 年及以上 · 无期徒刑',flavor:'食堂已为你保留固定座位，出狱日期暂不排期。'},
  ],
  sources: [
    {title:'OECD / JRC 综合指标方法手册',url:'https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html'},
    {title:'Microsoft Research：团队结果与个体不确定性',url:'https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/'},
    {title:'Broken Arrow 官方生存指南：后勤与战斗',url:'https://www6.slitherine.com/news/broken-arrows-survival-guide'},
  ],
};
export const ZHANFAN_PERCENTILE_TRIAL_MODEL = {
  ...ZHANFAN_MODEL, version:'zhanfan-v3-trial2',
  combat:{destruction_weight:0.6,damage_weight:0.4,support_percentile_cap:15},
  freeloading:{free_share:0.35,contribution_cutoff:60},
  dimensions:[
    {key:'exchange',name:'战损交换',weight:25,prior:50},
    {key:'output',name:'战斗产出',weight:20,prior:50},
    {key:'contribution',name:'占点贡献',weight:15,prior:50},
    {key:'victory',name:'胜负表现',weight:20,prior:50},
    {key:'discipline',name:'友伤约束',weight:6,prior:0},
    {key:'dependency',name:'蹭饭行为',weight:14,prior:0},
  ],
};
export const ZHANFAN_TRIAL_MODEL = {
  ...ZHANFAN_PERCENTILE_TRIAL_MODEL,version:'zhanfan-v3-ratio-trial',
  ratio:{slope:30,destruction_buffer:500,damage_buffer:50,objectives_buffer:1},
};
export const ZHANFAN_CONTEXT_MODEL = {
  ...ZHANFAN_MODEL, version:'zhanfan-v4-context', raw_baseline:12.5, baseline:12.5,
  calibration:[{raw:0,score:0},{raw:100,score:100}],
  context:CONTEXT_RULES, combat:{}, freeloading:{free_share:CONTEXT_RULES.free_supply_share},
  dimensions:[
    {key:'pressure',name:'可见贡献不足',weight:35,prior:0},
    {key:'exchange',name:'低效战损',weight:20,prior:0},
    {key:'dependency',name:'蹭队友补给',weight:15,prior:0},
    {key:'victory',name:'长期胜负',weight:25,prior:50},
    {key:'discipline',name:'友伤约束',weight:5,prior:0},
  ],
};
export const ZHANFAN_INDEPENDENT_MODEL = {
  ...ZHANFAN_CONTEXT_MODEL,version:'zhanfan-v5-independent',raw_baseline:42.5,baseline:42.5,
  context:INDEPENDENT_RULES,
  dimensions:[
    {key:'pressure',name:'战斗兑现',weight:35,prior:50},
    {key:'exchange',name:'战损交换',weight:25,prior:50},
    {key:'dependency',name:'蹭队友补给',weight:10,prior:0},
    {key:'victory',name:'长期胜负',weight:25,prior:50},
    {key:'discipline',name:'友伤约束',weight:5,prior:0},
  ],
  benchmarks:[
    {name:'双倍兑现与交换、60% 胜率',ratio:2,win_rate:0.6,score:25},
    {name:'参考产出、等价交换、50% 胜率',ratio:1,win_rate:0.5,score:42.5},
    {name:'半数兑现与交换、50% 胜率',ratio:0.5,win_rate:0.5,score:57.5},
    {name:'四分之一兑现与交换、50% 胜率',ratio:0.25,win_rate:0.5,score:72.5},
  ].map(b=>({...b,sentence_months:sentenceMonths(b.score)})),
};
export const ZHANFAN_CORE_MODEL = {
  ...ZHANFAN_INDEPENDENT_MODEL,version:'zhanfan-v6-core',aggregation:'core-adjustments',raw_baseline:50,baseline:50,
  dimensions:[
    {key:'pressure',name:'战斗兑现',kind:'core',weight:60,prior:50},
    {key:'exchange',name:'战损交换',kind:'core',weight:40,prior:50},
    {key:'victory',name:'胜负修正',kind:'adjustment',weight:20,center:50,prior:50},
    {key:'dependency',name:'蹭队友补给',kind:'adjustment',weight:8,center:0,prior:0},
    {key:'discipline',name:'友伤约束',kind:'adjustment',weight:4,center:0,prior:0},
  ],
  benchmarks:[
    {name:'双倍兑现与交换、60% 胜率',ratio:2,win_rate:0.6,score:23},
    {name:'参考产出、等价交换、50% 胜率',ratio:1,win_rate:0.5,score:50},
    {name:'半数兑现与交换、50% 胜率',ratio:0.5,win_rate:0.5,score:75},
    {name:'四分之一兑现与交换、50% 胜率',ratio:0.25,win_rate:0.5,score:100},
    {name:'四分之一兑现与交换、80% 胜率',ratio:0.25,win_rate:0.8,score:94},
  ].map(b=>({...b,sentence_months:sentenceMonths(b.score)})),
};
export function createOvercapModel(scoreCap=150) {
  if(!Number.isInteger(scoreCap)||scoreCap<100||scoreCap>200)throw new RangeError('单项上限须为100～200的整数');
  return {...ZHANFAN_CORE_MODEL,version:'zhanfan-v7-overcap',context:{...INDEPENDENT_RULES,score_cap:scoreCap},
    benchmarks:[
      {name:'双倍兑现与交换、60% 胜率',ratio:2,win_rate:0.6},
      {name:'参考产出、等价交换、50% 胜率',ratio:1,win_rate:0.5},
      {name:'半数兑现与交换、50% 胜率',ratio:0.5,win_rate:0.5},
      {name:'四分之一兑现与交换、50% 胜率',ratio:0.25,win_rate:0.5},
      {name:'八分之一兑现与交换、80% 胜率',ratio:0.125,win_rate:0.8},
      {name:'十六分之一兑现与交换、80% 胜率',ratio:0.0625,win_rate:0.8},
    ].map(b=>{const raw_core=independentRatioPenalty(b.ratio,1,0,scoreCap),score=clamp(raw_core+20*(0.5-b.win_rate));return {...b,raw_core,score,sentence_months:sentenceMonths(score)};})};
}
export const ZHANFAN_OVERCAP_MODEL=createOvercapModel();
export const ZHANFAN_SIGNED_MODEL={
  ...ZHANFAN_OVERCAP_MODEL,version:'zhanfan-v8-signed',
  context:{...INDEPENDENT_RULES,score_floor:-50,score_cap:150,slope:50},
  benchmarks:[
    {name:'四倍兑现与交换、50% 胜率',ratio:4,win_rate:.5},
    {name:'双倍兑现与交换、60% 胜率',ratio:2,win_rate:.6},
    {name:'参考产出、等价交换、50% 胜率',ratio:1,win_rate:.5},
    {name:'半数兑现与交换、50% 胜率',ratio:.5,win_rate:.5},
    {name:'四分之一兑现与交换、80% 胜率',ratio:.25,win_rate:.8},
  ].map(b=>{const raw_core=independentRatioPenalty(b.ratio,1,0,150,-50,50),score=clamp(raw_core+20*(.5-b.win_rate));return {...b,raw_core,score,sentence_months:sentenceMonths(score)};}),
};
const EXPANDED_SENTENCING={...ZHANFAN_MODEL.sentencing,life_score:75};
export const ZHANFAN_EXPANDED_MODEL={
  ...ZHANFAN_SIGNED_MODEL,version:'zhanfan-v9-expanded',
  sentencing:EXPANDED_SENTENCING,
  context:{...INDEPENDENT_RULES,score_floor:-100,score_cap:200,slope:75},
  benchmarks:ZHANFAN_SIGNED_MODEL.benchmarks.map(b=>{
    const raw_core=independentRatioPenalty(b.ratio,1,0,200,-100,75),score=clamp(raw_core+20*(.5-b.win_rate));
    return {...b,raw_core,score,sentence_months:sentenceMonths(score,EXPANDED_SENTENCING)};
  }),
};
export const ZHANFAN_STACKED_MODEL={
  ...ZHANFAN_EXPANDED_MODEL,version:'zhanfan-v10-stacked',stacked:true,
  approved_trial:'stacked-20-trial-v2',
  dimensions:[
    ...ZHANFAN_EXPANDED_MODEL.dimensions.filter(d=>d.kind==='core'),
    ...STACKED_CORRECTIONS.map(d=>({...d,kind:'adjustment',weight:d.key==='victory'?40:20,
      center:d.key==='victory'?50:0,prior:d.key==='victory'?50:0,cap:20})),
  ],
  benchmarks:ZHANFAN_EXPANDED_MODEL.benchmarks.map(b=>{
    const score=clamp(b.raw_core+40*(.5-b.win_rate));
    return {...b,score,sentence_months:sentenceMonths(score,EXPANDED_SENTENCING)};
  }),
};
function clamp(n) { return Math.max(0,Math.min(100,n)); }
const rounded = n => Math.round(n*10)/10;
const KEYS = {destruction:'DestructionScore',losses:'LossesScore',objectives:'ObjectivesCaptured',damage:'DamageDealt',friendly_fire:'DamageFriendlyFireDealt',supplied:'SupplyPointsConsumedByAllies',received:'SupplyPointsConsumedFromAllies',consumed:'SupplyPointsConsumed'};
const COUNT_KEYS={kills:'Destruction',units_lost:'Losses'};

export function calibratedScore(raw,model=ZHANFAN_MODEL) {
  if(typeof raw!=='number'||!Number.isFinite(raw))return null;
  const value=clamp(raw),anchors=model.calibration;
  if(value===0)return 0;
  const i=anchors.findIndex(a=>a.raw>=value),low=anchors[i-1],high=anchors[i];
  return low.score+(value-low.raw)*(high.score-low.score)/(high.raw-low.raw);
}
export function sentenceLabel(months) {
  return sentenceDetails(months).sentence;
}
export function sentenceMonths(score,rule=ZHANFAN_MODEL.sentencing) {
  if(typeof score!=='number'||!Number.isFinite(score))return null;
  const value=clamp(score);
  if(value<=rule.acquittal_score)return 0;
  const severity=(value-rule.acquittal_score)/(rule.life_score-rule.acquittal_score);
  const months=Math.min(ZHANFAN_MODEL.max_months,Math.max(1,Math.round(ZHANFAN_MODEL.life_months*severity**rule.exponent)));
  return value<rule.life_score?Math.min(ZHANFAN_MODEL.life_months-1,months):months;
}
export function sentenceDetails(months) {
  if(typeof months!=='number'||!Number.isFinite(months))return {sentence:'待取证',stage:'待取证',flavor:'证据尚未到齐，先把完整战报端上来。',life:false};
  const n=Math.max(0,Math.min(360,Math.round(months)));
  const band=ZHANFAN_MODEL.sentence_bands.find(b=>b.max_months===null||n<=b.max_months);
  const life=n>=ZHANFAN_MODEL.life_months;
  const years=Math.floor(n/12),rest=n%12;
  const sentence=life?'无期徒刑':n===0?'当庭释放':`有期徒刑 ${years?years+' 年':''}${years&&rest?' ':''}${rest?rest+' 个月':''}`;
  return {sentence,stage:band.name,flavor:band.flavor,life};
}
// Ties use midranks, including self: equal teammates are neutral, not all "worst".
function percentile(value, values) {
  const less=values.filter(v=>v<value).length,equal=values.filter(v=>v===value).length;
  return 100*(less+equal/2)/values.length;
}
function weighted(components, dimension=null, factor=1) {
  let sum=0,weights=0;
  for(const c of components){const w=c.weight*(c.key===dimension?factor:1);sum+=c.penalty*w;weights+=w;}
  return clamp(sum/weights);
}
function aggregate(components,model,dimension=null,factor=1) {
  if(model.aggregation!=='core-adjustments')return weighted(components,dimension,factor);
  const weight=c=>c.weight*(c.key===dimension?factor:1);
  const core=components.filter(c=>c.kind==='core'),total=core.reduce((sum,c)=>sum+weight(c),0);
  const base=core.reduce((sum,c)=>sum+c.penalty*weight(c),0)/total;
  const adjustment=components.filter(c=>c.kind==='adjustment').reduce((sum,c)=>sum+(c.penalty-c.center)*weight(c)/100,0);
  return clamp(base+adjustment);
}
function readMetric(p,raw,key,protobuf) {
  const field=KEYS[key]??COUNT_KEYS[key];
  if(Object.hasOwn(raw,field))return typeof raw[field]==='number'&&Number.isFinite(raw[field])&&raw[field]>=0&&raw[field]<=Number.MAX_SAFE_INTEGER?raw[field]:null;
  const n=p[key];
  if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER)return n;
  return protobuf?0:null;
}
function groupedParticipants(rows,stacked=false) {
  const keys=stacked?{...KEYS,...COUNT_KEYS}:KEYS;
  const grouped=new Map();
  for(const p of rows){
    if(!/^[1-9]\d*$/.test(p.player_id)||p.team_id===100)continue;
    const key=p.member_id?`member:${p.member_id}`:`player:${p.player_id}`;
    let g=grouped.get(key);
    if(!g){g={key,member_id:p.member_id,name:p.member_name,teams:new Set(),values:Object.fromEntries(Object.keys(keys).map(k=>[k,0])),valid:true};grouped.set(key,g);}
    g.teams.add(p.team_id);
    const raw=JSON.parse(p.raw_json);
    for(const k of Object.keys(keys)){
      const n=readMetric(p,raw,k,!!p.protobuf);
      if(Object.hasOwn(COUNT_KEYS,k)){
        g.values[k]=n===null||g.values[k]===null||g.values[k]+n>Number.MAX_SAFE_INTEGER?null:g.values[k]+n;
      }else if(n===null)g.valid=false;
      else {g.values[k]+=n;if(g.values[k]>Number.MAX_SAFE_INTEGER)g.valid=false;}
    }
  }
  return [...grouped.values()].map(g=>({...g,team_id:g.teams.size===1?[...g.teams][0]:null}));
}
function metrics(g) {
  const v=g.values;
  // Duration is identical within a match, so it cancels from per-minute midranks.
  return {exchange:(v.destruction-v.losses)/(v.destruction+v.losses+ZHANFAN_MODEL.exchange_buffer),destruction:v.destruction,damage:v.damage,objectives:v.objectives,supply:v.supplied};
}
export function freeloadingEvidence(values,contribution,model=ZHANFAN_TRIAL_MODEL) {
  const rule=model.freeloading,net_received=Math.max(0,values.received-values.supplied);
  const share=Math.min(1,net_received/Math.max(values.consumed,values.received,model.supply_buffer));
  const excess=Math.max(0,(share-rule.free_share)/(1-rule.free_share));
  const shortfall=Math.max(0,Math.min(1,(rule.contribution_cutoff-contribution)/rule.contribution_cutoff));
  return {net_received,share,contribution,penalty:100*excess*shortfall};
}
export function performanceRatioPenalty(value,reference,buffer=0,slope=30) {
  if([value,reference,buffer].some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>Number.MAX_SAFE_INTEGER)||typeof slope!=='number'||!Number.isFinite(slope)||slope<=0)return null;
  if(value===reference)return 50;
  if(!value&&!buffer)return 100;
  if(!reference&&!buffer)return 0;
  return clamp(50-slope*(Math.log2(value+buffer)-Math.log2(reference+buffer)));
}
function gamePenalties(g,team,model) {
  if(model.stacked){
    const e=stackedEvidence(g,team,model);if(!e)return null;
    const penalties={pressure:e.combat,exchange:e.exchange,
      ...Object.fromEntries(Object.entries(e.corrections).map(([k,v])=>[k,v===null?null:v*5]))};
    const specialistRelief=-(e.corrections.heavy??0)-(e.corrections.air??0);
    return {penalties,
      support:{available:e.specialist_values.length>0,credit:specialistRelief},
      food:{share:e.supply_share,net_received:e.net_received,penalty:e.corrections.dependency},
      evidence:{...e,combat_base:e.combat,exchange_base:e.exchange,combat_penalty:e.combat,exchange_penalty:e.exchange,
        weak_combat:e.combat>50,weak_exchange:e.exchange>50,
        objective_relief:-e.corrections.objectives,specialist_relief:specialistRelief,
        risk:e.combat>50||e.exchange>50||Object.values(e.corrections).some(v=>v>0),
        penalties},
    };
  }
  if(model.context?.scale==='independent')return independentEvidence(g,team,model);
  if(model.context)return contextualEvidence(g,team,model);
  const values=team.map(p=>metrics(p)),mine=metrics(g),v=g.values;
  const p=key=>percentile(mine[key],values.map(x=>x[key]));
  const logistics=v.supplied>0?p('supply'):0;
  let output=Math.max(p('damage'),logistics),contribution=Math.max(p('objectives'),logistics);
  let support=null;
  if(model.combat){
    const base=model.combat.destruction_weight*p('destruction')+model.combat.damage_weight*p('damage');
    const evidence=[];let available=false;
    for(const kind of ['heavy','air']){
      if(!team.every(t=>t.unit_evidence[kind].known))continue;
      available=true;
      if(g.unit_evidence[kind].kills>0)evidence.push(percentile(g.unit_evidence[kind].kills,team.map(t=>t.unit_evidence[kind].kills)));
    }
    const credit=Math.min(model.combat.support_percentile_cap,Math.max(0,...evidence.map(v=>v-base)));
    output=base+credit;contribution=p('objectives');
    support={available,credit};
  }
  // Freeze food evidence to the previous percentile rule to isolate the new scoring scale.
  const food=model.freeloading?freeloadingEvidence(v,Math.max(output,contribution),model):null;
  let exchange=100-p('exchange');
  if(model.ratio){
    const others=team.filter(t=>t.key!==g.key),r=model.ratio;
    const mean=key=>Math.min(Number.MAX_SAFE_INTEGER,others.reduce((sum,t)=>sum+t.values[key]/others.length,0));
    const penalty=(key,buffer)=>performanceRatioPenalty(v[key],mean(key),buffer,r.slope);
    exchange=performanceRatioPenalty(v.destruction,v.losses,model.exchange_buffer,r.slope);
    const base=clamp(100-model.combat.destruction_weight*penalty('destruction',r.destruction_buffer)-model.combat.damage_weight*penalty('damage',r.damage_buffer));
    support.credit=Math.min(support.credit,100-base);output=clamp(base+support.credit);
    contribution=100-penalty('objectives',r.objectives_buffer);
  }
  return {
    penalties:{exchange,output:100-output,contribution:100-contribution,
    discipline:clamp(100*(v.friendly_fire/(v.damage+v.friendly_fire+50))/ZHANFAN_MODEL.friendly_fire_limit),
    dependency:food?food.penalty:clamp(100*Math.max(0,v.received-v.supplied)/Math.max(v.consumed,v.received,ZHANFAN_MODEL.supply_buffer))*(1-Math.max(output,contribution,logistics)/100)},support,food,
  };
}

export function specialistEvidence(store,f) {
  // Compare all same-team humans, merging registered alts; unknown evidence never becomes zero.
  const row=store.get("SELECT data_json FROM analysis_catalogue WHERE key='air_superiority_model'");
  const model=row?JSON.parse(row.data_json):{units:{}},result=new Map(),cache=new Map();
  const rows=store.all(`SELECT u.match_id,u.player_id,r.member_id,u.unit_id,u.kills,u.raw_json,c.data_json AS catalogue_json
    FROM unit_instances u JOIN matches m ON m.id=u.match_id
    LEFT JOIN registered_participants r ON r.match_id=u.match_id AND r.player_id=u.player_id
    LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id WHERE ${f.sql} AND m.detail_state='complete'`,...f.args);
  for(const u of rows){
    const key=`${u.match_id}:${u.member_id?'member:'+u.member_id:'player:'+u.player_id}`;
    let e=result.get(key);if(!e){e={heavy:{known:true,kills:0},air:{known:true,kills:0}};result.set(key,e);}
    const c=u.catalogue_json?JSON.parse(u.catalogue_json):null,role=c?.role;
    if(!['number','string'].includes(typeof role)||!/^\d+$/.test(String(role))||!Number.isSafeInteger(Number(role))){e.heavy.known=e.air.known=false;continue;}
    const add=kind=>{const t=e[kind];if(!Number.isSafeInteger(u.kills)||u.kills<0||!Number.isSafeInteger(t.kills+u.kills))t.known=false;else t.kills+=u.kills;};
    if(Number(role)===15)add('heavy');
    if(Number(role)>=160&&Number(role)<=164){
      const raw=JSON.parse(u.raw_json),cacheKey=u.unit_id+':'+JSON.stringify(raw.OptionIds);
      let loadout=cache.get(cacheKey);if(!loadout){loadout=classifyAirLoadout(raw,model.units[u.unit_id]);cache.set(cacheKey,loadout);}
      if(loadout.status==='unknown')e.air.known=false;
      else if(loadout.status==='eligible')add('air');
    }
  }
  return result;
}

function analyze(store,params,model) {
  const f=filters(params),min=minimumGames(params,'court_min_games'),window=sentencingWindow(params);
  const units=model.combat?specialistEvidence(store,f):null;
  const rows=store.all(`SELECT p.*,r.member_id,r.member_name,m.detail_state,m.duration,m.winner_team,json_type(m.raw_json,'$.Data')='object' AS protobuf
    FROM participants p JOIN matches m ON m.id=p.match_id LEFT JOIN registered_participants r ON r.match_id=p.match_id AND r.player_id=p.player_id
    WHERE ${f.sql} ORDER BY CAST(p.match_id AS INTEGER),p.player_id`,...f.args);
  const games=new Map();for(const p of rows){if(!games.has(p.match_id))games.set(p.match_id,[]);games.get(p.match_id).push(p);}
  const members=new Map(store.all('SELECT id AS member_id,name FROM members WHERE active=1 ORDER BY id').map(m=>[m.member_id,{...m,matches:0,complete_matches:0,scored_matches:0,outcome_matches:0,wins:0,losses:0,skipped:{missing_detail:0,ambiguous_team:0,invalid_data:0,no_peers:0},...(model.combat?{specialist:{available_matches:0,unavailable_matches:0,credited_matches:0,credit_sum:0}}:{}),...(model.freeloading?{freeloading:{dependent_matches:0,penalized_matches:0,net_received:0,share_sum:0}}:{}),sums:Object.fromEntries(model.dimensions.map(d=>[d.key,0]))}]));
  if(model.stacked)for(const m of members.values())m.samples_by_key=Object.fromEntries(model.dimensions.map(d=>[d.key,0]));
  if(model.context)for(const m of members.values()){
    m.skipped.no_activity=0;
    m.context={imbalanced_matches:0,exchange_matches:0,objective_relief_matches:0,specialist_relief_matches:0,contribution_sum:0,examples:[]};
    if(model.context.scale==='independent')m.context.mode='independent';
  }
  for(const participants of games.values()){
    const match=participants[0],groups=groupedParticipants(participants,model.stacked);
    if(units)for(const g of groups)g.unit_evidence=units.get(`${match.match_id}:${g.key}`)??{heavy:{known:true,kills:0},air:{known:true,kills:0}};
    const peers=groups.filter(g=>g.valid&&Number.isInteger(g.team_id)&&g.team_id>=0&&g.team_id!==100);
    for(const g of groups){
      const m=members.get(g.member_id);if(!m)continue;m.matches++;
      if(match.detail_state!=='complete'){m.skipped.missing_detail++;continue;}m.complete_matches++;
      if(g.team_id===null){m.skipped.ambiguous_team++;continue;}
      if(!g.valid||!Number.isFinite(match.duration)||match.duration<=0){m.skipped.invalid_data++;continue;}
      const team=peers.filter(p=>p.team_id===g.team_id);
      if(team.length<2){m.skipped.no_peers++;continue;}
      const evaluated=gamePenalties(g,team,model);
      if(!evaluated){m.skipped.no_activity++;continue;}
      const {penalties,support,food,evidence}=evaluated;m.scored_matches++;
      if(evidence){
        m.context.imbalanced_matches+=Number(evidence.weak_combat??(evidence.deficit>0));
        m.context.exchange_matches+=Number(evidence.weak_exchange??(penalties.exchange>0));
        m.context.objective_relief_matches+=Number(evidence.objective_relief>0);
        m.context.specialist_relief_matches+=Number(evidence.specialist_relief>0);
        m.context.contribution_sum+=evidence.contribution??Math.max(0,Math.min(1,1-penalties.pressure/100));
        const points=model.dimensions.filter(d=>d.key!=='victory').reduce((sum,d)=>sum+penalties[d.key]*d.weight/100,0);
        m.context.examples.push({match_id:match.match_id,...evidence,points,
          ...(model.aggregation?{core_points:model.dimensions.filter(d=>d.kind==='core').reduce((sum,d)=>sum+penalties[d.key]*d.weight/100,0)}:{})});
      }
      if(support){m.specialist.available_matches+=Number(support.available);m.specialist.unavailable_matches+=Number(!support.available);m.specialist.credited_matches+=Number(support.credit>0);m.specialist.credit_sum+=support.credit;}
      if(food){m.freeloading.dependent_matches+=Number(food.share>model.freeloading.free_share);m.freeloading.penalized_matches+=Number(food.penalty>0);m.freeloading.net_received+=food.net_received;m.freeloading.share_sum+=food.share;}
      for(const [key,value] of Object.entries(penalties)){
        if(value===null)continue;
        m.sums[key]+=value;if(model.stacked)m.samples_by_key[key]++;
      }
      const winner=match.winner_team;
      if(Number.isInteger(winner)&&winner>=0&&winner!==100&&participants.some(p=>p.team_id===winner)){
        const won=g.team_id===winner;m.outcome_matches++;m.wins+=Number(won);m.losses+=Number(!won);m.sums.victory+=won?0:100;
      }
    }
  }
  const reports=[...members.values()].map(m=>{
    const {sums,samples_by_key,...rest}=m,n=m.scored_matches,reliability=n/(n+model.prior_games);
    const components=model.dimensions.map(d=>{
      const samples=d.key==='victory'?m.outcome_matches:model.stacked?samples_by_key[d.key]:n,confidence=samples/(samples+model.prior_games);
      const average=samples?sums[d.key]/samples:null,penalty=n?d.prior+((average??d.prior)-d.prior)*confidence:null;
      return {...d,samples,...(model.stacked?{unavailable:n-samples}:{}),average,penalty,points:penalty===null?null:(penalty-(d.center??0))*d.weight/100,change:penalty===null?null:(penalty-d.prior)*d.weight/100};
    });
    const raw=n?aggregate(components,model):null,raw_score=n?Math.round(raw*100)/100:null;
    const score=n?rounded(calibratedScore(raw,model)):null,months=sentenceMonths(score,model.sentencing);
    const variants=n?[score,...components.flatMap(c=>[aggregate(components,model,c.key,0.8),aggregate(components,model,c.key,1.2)].map(v=>rounded(calibratedScore(v,model))))].map(v=>sentenceMonths(v,model.sentencing)):[];
    if(model.aggregation){
      rest.score_breakdown={core:n?components.filter(c=>c.kind==='core').reduce((sum,c)=>sum+c.points,0):null,
        adjustments:components.filter(c=>c.kind==='adjustment').map(c=>({key:c.key,name:c.name,points:c.points})),
        before_clamp:n?components.reduce((sum,c)=>sum+c.points,0):null,
        ceiling_without_extras:n?clamp(50+((model.context.score_cap??100)-50)*reliability+components.find(c=>c.key==='victory').points):null,
        ...(model.context.score_cap?{item_cap:model.context.score_cap}:{}),
        ...(model.context.score_floor!==undefined?{item_floor:model.context.score_floor}:{})};
    }
    if(rest.context){
      const examples=rest.context.examples;
      rest.context={...rest.context,
        risk_examples:examples.filter(e=>e.risk??(e.deficit>0)).sort((a,b)=>b.points-a.points||a.match_id.localeCompare(b.match_id)).slice(0,3),
        relief_examples:examples.filter(e=>e.objective_relief>0||e.specialist_relief>0).sort((a,b)=>(b.objective_relief+b.specialist_relief)-(a.objective_relief+a.specialist_relief)||a.match_id.localeCompare(b.match_id)).slice(0,2)};
      delete rest.context.examples;
    }
    return {...rest,components,reliability,raw_score,score,win_rate:m.outcome_matches?100*m.wins/m.outcome_matches:null,sentence_months:window.eligible?months:null,...sentenceDetails(window.eligible?months:null),eligible:window.eligible&&n>=min,rank:null,
      status:!window.eligible?'统计范围不足30天':n===0?'待取证':n<min?'暂缓宣判':n<20?'初步判决':'娱乐判决',
      sensitivity:window.eligible&&n?{low_months:Math.min(...variants),high_months:Math.max(...variants)}:null};
  });
  const ranking=reports.filter(r=>r.eligible).sort((a,b)=>b.score-a.score||b.scored_matches-a.scored_matches||a.member_id-b.member_id);
  let last=null,rank=0;for(const [i,r]of ranking.entries()){if(r.score!==last)rank=i+1;r.rank=rank;last=r.score;}
  reports.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(b.score??-1)-(a.score??-1)||b.scored_matches-a.scored_matches||a.member_id-b.member_id);
  return {model,min_games:min,members:reports,ranked:ranking.length,sentencing_window:window};
}

export function zhanfanAnalysis(store,params=new URLSearchParams()) {
  return analyze(store,params,ZHANFAN_STACKED_MODEL);
}
export function expandedZhanfanAnalysis(store,params=new URLSearchParams()) {
  return analyze(store,params,ZHANFAN_EXPANDED_MODEL);
}
export function signedZhanfanAnalysis(store,params=new URLSearchParams()) {
  return analyze(store,params,ZHANFAN_SIGNED_MODEL);
}
export function overcapZhanfanAnalysis(store,params=new URLSearchParams(),scoreCap=ZHANFAN_OVERCAP_MODEL.context.score_cap) {
  return analyze(store,params,createOvercapModel(scoreCap));
}
export function coreZhanfanAnalysis(store,params=new URLSearchParams()) {
  return analyze(store,params,ZHANFAN_CORE_MODEL);
}
export function independentZhanfanAnalysis(store,params=new URLSearchParams()) {
  return analyze(store,params,ZHANFAN_INDEPENDENT_MODEL);
}
export function contextZhanfanAnalysis(store,params=new URLSearchParams()) {
  return analyze(store,params,ZHANFAN_CONTEXT_MODEL);
}
export function legacyZhanfanAnalysis(store,params=new URLSearchParams()) {
  return analyze(store,params,ZHANFAN_MODEL);
}

export function zhanfanTrialComparison(store,params=new URLSearchParams()) {
  const current=legacyZhanfanAnalysis(store,params),previous=analyze(store,params,ZHANFAN_PERCENTILE_TRIAL_MODEL),trial=analyze(store,params,ZHANFAN_TRIAL_MODEL);
  const members=current.members.map(old=>{
    const prior=previous.members.find(r=>r.member_id===old.member_id),next=trial.members.find(r=>r.member_id===old.member_id),comparable=old.eligible&&prior.eligible&&next.eligible;
    const drivers=next.components.map(c=>({key:c.key,name:c.name,delta:prior.score===null||next.score===null?null:Math.round((c.change-(prior.components.find(o=>o.key===c.key)?.change??0))*1000)/1000})).sort((a,b)=>Math.abs(b.delta??0)-Math.abs(a.delta??0));
    return {member_id:old.member_id,name:old.name,current:old,previous:prior,trial:next,comparable,
      delta_score:comparable?rounded(next.score-old.score):null,
      delta_months:comparable?next.sentence_months-old.sentence_months:null,
      delta_previous_score:comparable?rounded(next.score-prior.score):null,
      delta_previous_months:comparable?next.sentence_months-prior.sentence_months:null,
      delta_rank:comparable?old.rank-next.rank:null,drivers};
  });
  const ranges=Object.fromEntries([['current',current],['previous',previous],['trial',trial]].map(([key,data])=>{
    const values=data.members.filter(r=>r.eligible).map(r=>r.score),mean=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
    return [key,{min:values.length?Math.min(...values):null,max:values.length?Math.max(...values):null,sd:values.length?Math.round(Math.sqrt(values.reduce((n,v)=>n+(v-mean)**2,0)/values.length)*100)/100:null}];
  }));
  return {current,previous,trial,ranges,min_games:current.min_games,members,summary:{
    increased:members.filter(r=>r.delta_score>0).length,decreased:members.filter(r=>r.delta_score<0).length,unchanged:members.filter(r=>r.delta_score===0).length,
    previous_increased:members.filter(r=>r.delta_previous_score>0).length,previous_decreased:members.filter(r=>r.delta_previous_score<0).length,previous_unchanged:members.filter(r=>r.delta_previous_score===0).length,
    comparable:members.filter(r=>r.comparable).length,
  }};
}

function compareReports(current,previous) {
  return {kind:'court-model-comparison',current,previous,min_games:current.min_games,
    members:current.members.map(next=>{
      const old=previous.members.find(r=>r.member_id===next.member_id),comparable=next.eligible&&old.eligible;
      return {member_id:next.member_id,name:next.name,current:next,previous:old,comparable,
        delta_score:comparable?rounded(next.score-old.score):null,
        delta_months:comparable?next.sentence_months-old.sentence_months:null};
    })};
}

export function contextZhanfanComparison(store,params=new URLSearchParams()) {
  return compareReports(contextZhanfanAnalysis(store,params),legacyZhanfanAnalysis(store,params));
}

export function zhanfanComparison(store,params=new URLSearchParams()) {
  return compareReports(zhanfanAnalysis(store,params),expandedZhanfanAnalysis(store,params));
}

export function expandedZhanfanComparison(store,params=new URLSearchParams()) {
  return compareReports(expandedZhanfanAnalysis(store,params),signedZhanfanAnalysis(store,params));
}

export function signedZhanfanComparison(store,params=new URLSearchParams()) {
  return compareReports(signedZhanfanAnalysis(store,params),overcapZhanfanAnalysis(store,params));
}

export function overcapZhanfanComparison(store,params=new URLSearchParams()) {
  return compareReports(overcapZhanfanAnalysis(store,params),coreZhanfanAnalysis(store,params));
}

export function coreZhanfanComparison(store,params=new URLSearchParams()) {
  return compareReports(coreZhanfanAnalysis(store,params),independentZhanfanAnalysis(store,params));
}

export function independentZhanfanComparison(store,params=new URLSearchParams()) {
  return compareReports(independentZhanfanAnalysis(store,params),contextZhanfanAnalysis(store,params));
}
