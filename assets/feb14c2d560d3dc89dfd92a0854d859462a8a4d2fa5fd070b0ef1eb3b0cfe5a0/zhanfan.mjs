import { filters, minimumGames } from './queries.mjs';

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
const clamp = n => Math.max(0,Math.min(100,n));
const rounded = n => Math.round(n*10)/10;
const KEYS = {destruction:'DestructionScore',losses:'LossesScore',objectives:'ObjectivesCaptured',damage:'DamageDealt',friendly_fire:'DamageFriendlyFireDealt',supplied:'SupplyPointsConsumedByAllies',received:'SupplyPointsConsumedFromAllies',consumed:'SupplyPointsConsumed'};

export function calibratedScore(raw) {
  if(typeof raw!=='number'||!Number.isFinite(raw))return null;
  const value=clamp(raw),anchors=ZHANFAN_MODEL.calibration;
  if(value===0)return 0;
  const i=anchors.findIndex(a=>a.raw>=value),low=anchors[i-1],high=anchors[i];
  return low.score+(value-low.raw)*(high.score-low.score)/(high.raw-low.raw);
}
export function sentenceLabel(months) {
  return sentenceDetails(months).sentence;
}
export function sentenceMonths(score) {
  if(typeof score!=='number'||!Number.isFinite(score))return null;
  const value=clamp(score),rule=ZHANFAN_MODEL.sentencing;
  if(value<=rule.acquittal_score)return 0;
  const severity=(value-rule.acquittal_score)/(rule.life_score-rule.acquittal_score);
  return Math.min(ZHANFAN_MODEL.max_months,Math.max(1,Math.round(ZHANFAN_MODEL.life_months*severity**rule.exponent)));
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
function readMetric(p,raw,key,protobuf) {
  const field=KEYS[key];
  if(Object.hasOwn(raw,field))return typeof raw[field]==='number'&&Number.isFinite(raw[field])&&raw[field]>=0&&raw[field]<=Number.MAX_SAFE_INTEGER?raw[field]:null;
  const n=p[key];
  if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER)return n;
  return protobuf?0:null;
}
function groupedParticipants(rows) {
  const grouped=new Map();
  for(const p of rows){
    if(!/^[1-9]\d*$/.test(p.player_id)||p.team_id===100)continue;
    const key=p.member_id?`member:${p.member_id}`:`player:${p.player_id}`;
    let g=grouped.get(key);
    if(!g){g={key,member_id:p.member_id,name:p.member_name,teams:new Set(),values:Object.fromEntries(Object.keys(KEYS).map(k=>[k,0])),valid:true};grouped.set(key,g);}
    g.teams.add(p.team_id);
    const raw=JSON.parse(p.raw_json);
    for(const k of Object.keys(KEYS)){const n=readMetric(p,raw,k,!!p.protobuf);if(n===null)g.valid=false;else {g.values[k]+=n;if(g.values[k]>Number.MAX_SAFE_INTEGER)g.valid=false;}}
  }
  return [...grouped.values()].map(g=>({...g,team_id:g.teams.size===1?[...g.teams][0]:null}));
}
function metrics(g) {
  const v=g.values;
  // Duration is identical within a match, so it cancels from per-minute midranks.
  return {exchange:(v.destruction-v.losses)/(v.destruction+v.losses+ZHANFAN_MODEL.exchange_buffer),damage:v.damage,objectives:v.objectives,supply:v.supplied};
}
function gamePenalties(g,team) {
  const values=team.map(p=>metrics(p)),mine=metrics(g),v=g.values;
  const p=key=>percentile(mine[key],values.map(x=>x[key]));
  const logistics=v.supplied>0?p('supply'):0;
  const output=Math.max(p('damage'),logistics),contribution=Math.max(p('objectives'),logistics);
  return {
    exchange:100-p('exchange'),output:100-output,contribution:100-contribution,
    discipline:clamp(100*(v.friendly_fire/(v.damage+v.friendly_fire+50))/ZHANFAN_MODEL.friendly_fire_limit),
    dependency:clamp(100*Math.max(0,v.received-v.supplied)/Math.max(v.consumed,v.received,ZHANFAN_MODEL.supply_buffer))*(1-Math.max(output,contribution)/100),
  };
}

export function zhanfanAnalysis(store,params=new URLSearchParams()) {
  const f=filters(params),min=minimumGames(params,'court_min_games');
  const rows=store.all(`SELECT p.*,r.member_id,r.member_name,m.detail_state,m.duration,m.winner_team,json_type(m.raw_json,'$.Data')='object' AS protobuf
    FROM participants p JOIN matches m ON m.id=p.match_id LEFT JOIN registered_participants r ON r.match_id=p.match_id AND r.player_id=p.player_id
    WHERE ${f.sql} ORDER BY CAST(p.match_id AS INTEGER),p.player_id`,...f.args);
  const games=new Map();for(const p of rows){if(!games.has(p.match_id))games.set(p.match_id,[]);games.get(p.match_id).push(p);}
  const members=new Map(store.all('SELECT id AS member_id,name FROM members WHERE active=1 ORDER BY id').map(m=>[m.member_id,{...m,matches:0,complete_matches:0,scored_matches:0,outcome_matches:0,wins:0,losses:0,skipped:{missing_detail:0,ambiguous_team:0,invalid_data:0,no_peers:0},sums:Object.fromEntries(ZHANFAN_MODEL.dimensions.map(d=>[d.key,0]))}]));
  for(const participants of games.values()){
    const match=participants[0],groups=groupedParticipants(participants);
    const peers=groups.filter(g=>g.valid&&Number.isInteger(g.team_id)&&g.team_id>=0&&g.team_id!==100);
    for(const g of groups){
      const m=members.get(g.member_id);if(!m)continue;m.matches++;
      if(match.detail_state!=='complete'){m.skipped.missing_detail++;continue;}m.complete_matches++;
      if(g.team_id===null){m.skipped.ambiguous_team++;continue;}
      if(!g.valid||!Number.isFinite(match.duration)||match.duration<=0){m.skipped.invalid_data++;continue;}
      const team=peers.filter(p=>p.team_id===g.team_id);
      if(team.length<2){m.skipped.no_peers++;continue;}
      const penalties=gamePenalties(g,team);m.scored_matches++;
      for(const [key,value] of Object.entries(penalties))m.sums[key]+=value;
      const winner=match.winner_team;
      if(Number.isInteger(winner)&&winner>=0&&winner!==100&&participants.some(p=>p.team_id===winner)){
        const won=g.team_id===winner;m.outcome_matches++;m.wins+=Number(won);m.losses+=Number(!won);m.sums.victory+=won?0:100;
      }
    }
  }
  const reports=[...members.values()].map(m=>{
    const {sums,...rest}=m,n=m.scored_matches,reliability=n/(n+ZHANFAN_MODEL.prior_games);
    const components=ZHANFAN_MODEL.dimensions.map(d=>{
      const samples=d.key==='victory'?m.outcome_matches:n,confidence=samples/(samples+ZHANFAN_MODEL.prior_games);
      const average=samples?sums[d.key]/samples:null,penalty=n?d.prior+((average??d.prior)-d.prior)*confidence:null;
      return {...d,samples,average,penalty,points:penalty===null?null:penalty*d.weight/100,change:penalty===null?null:(penalty-d.prior)*d.weight/100};
    });
    const raw=n?weighted(components):null,raw_score=n?Math.round(raw*100)/100:null;
    const score=n?rounded(calibratedScore(raw)):null,months=sentenceMonths(score);
    const variants=n?[score,...components.flatMap(c=>[weighted(components,c.key,0.8),weighted(components,c.key,1.2)].map(v=>rounded(calibratedScore(v))))].map(sentenceMonths):[];
    return {...rest,components,reliability,raw_score,score,win_rate:m.outcome_matches?100*m.wins/m.outcome_matches:null,sentence_months:months,...sentenceDetails(months),eligible:n>=min,rank:null,
      status:n===0?'待取证':n<min?'暂缓宣判':n<20?'初步判决':'娱乐判决',
      sensitivity:n?{low_months:Math.min(...variants),high_months:Math.max(...variants)}:null};
  });
  const ranking=reports.filter(r=>r.eligible).sort((a,b)=>b.score-a.score||b.scored_matches-a.scored_matches||a.member_id-b.member_id);
  let last=null,rank=0;for(const [i,r]of ranking.entries()){if(r.score!==last)rank=i+1;r.rank=rank;last=r.score;}
  reports.sort((a,b)=>Number(b.eligible)-Number(a.eligible)||(b.score??-1)-(a.score??-1)||b.scored_matches-a.scored_matches||a.member_id-b.member_id);
  return {model:ZHANFAN_MODEL,min_games:min,members:reports,ranked:ranking.length};
}
