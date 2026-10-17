import { filters } from './queries.mjs';
import { mapName } from './domain.mjs';
import { specialistEvidence } from './zhanfan.mjs';

const fields={destruction:'DestructionScore',losses:'LossesScore',damage:'DamageDealt',objectives:'ObjectivesCaptured',
  friendly_fire:'DamageFriendlyFireDealt',consumed:'SupplyPointsConsumed',received:'SupplyPointsConsumedFromAllies',
  supplied:'SupplyPointsConsumedByAllies',spawned:'TotalSpawnedUnitScore',refunded:'TotalRefundedUnitScore'};
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER;
const sum=(a,b)=>a===null||b===null||!valid(a+b)?null:a+b;
function metric(p,raw,key){
  const field=fields[key];
  if(Object.hasOwn(raw,field))return valid(raw[field])?raw[field]:null;
  if(valid(p[key]))return p[key];
  return p.protobuf?0:null;
}
function name(c,id){
  const n=c?.hudName??c?.name??c?.uiName;
  if(typeof n==='string')return n;
  return [n?.['zh-CN'],n?.zh,n?.en].find(x=>typeof x==='string')??`单位 #${id}`;
}

// Sampling predicates describe observable events, not training labels or conviction thresholds.
const scenarios=[
  {id:'shared_supply',title:'赢局中的净补给依赖',question:'这是正常的集中保障，还是资源依赖没有兑现贡献？',
    select:r=>r.won===true&&r.net_received>0,value:r=>r.net_received,
    limitation:'赢局和净吃补给都不证明搭便车；需要核对本人的职责与补给用途。'},
  {id:'costly_objectives',title:'负交换但有占点记录',question:'损失是否换来了需要的阵地，而不是无意义送兵？',
    select:r=>r.net_exchange!==null&&r.net_exchange<0&&r.values.objectives>0,value:r=>-r.net_exchange,
    limitation:'占点次数不能证明守住多久或在关键结算时控制目标；有占点也不自动免除损失。'},
  {id:'specialist',title:'零占点但有重防或空优战果',question:'旧模型是否把防空分工误当成占点不足？',
    select:r=>r.values.objectives===0&&(r.heavy_kills>0||r.air_kills>0),value:r=>(r.heavy_kills??0)+(r.air_kills??0),
    limitation:'这里只记录本人重防、实际空优挂载的单位总击杀，不等于击落敌机数量，也不包含威慑价值。'},
  {id:'supply_support',title:'零摧毁但提供了队友补给',question:'可见战果低，是否仍履行了约定的支援职责？',
    select:r=>r.values.destruction===0&&r.values.supplied>0,value:r=>r.values.supplied,
    limitation:'送补给本身不是充分贡献证据，也不应因没有摧毁分直接认定无贡献。'},
  {id:'friendly_fire',title:'友伤与负交换重叠',question:'损失和友伤是否被模型重复处罚，事件是否有战术背景？',
    select:r=>r.values.friendly_fire>0&&r.net_exchange!==null&&r.net_exchange<0,value:r=>r.values.friendly_fire,
    limitation:'两项同时发生不代表同一笔损失。友伤伤害不是摧毁价值，不能直接相加扣除；仅凭战报不能判断是否故意。'},
];

export function courtReview(store,params=new URLSearchParams()) {
  const f=filters(params),units=specialistEvidence(store,f);
  const overview=store.get(`SELECT COUNT(*) AS matches,SUM(detail_state='complete') AS complete FROM matches m WHERE ${f.sql}`,...f.args);
  const rows=store.all(`SELECT p.*,r.member_id,r.member_name,m.end_time,m.duration,m.map_id,m.mode,m.winner_team,
    json_type(m.raw_json,'$.Data')='object' AS protobuf FROM participants p JOIN matches m ON m.id=p.match_id
    LEFT JOIN registered_participants r ON r.match_id=p.match_id AND r.player_id=p.player_id
    WHERE ${f.sql} AND m.detail_state='complete' ORDER BY m.end_time,CAST(m.id AS INTEGER),p.player_id`,...f.args);
  const groups=new Map();
  for(const p of rows){
    if(!/^[1-9]\d*$/.test(p.player_id)||p.team_id===100)continue;
    const owner=p.member_id?'member:'+p.member_id:'player:'+p.player_id,key=p.match_id+':'+owner;
    let g=groups.get(key);
    if(!g){g={key,match_id:p.match_id,member_id:p.member_id??null,name:p.member_name??p.name,player_ids:[],teams:new Set(),
      end_time:p.end_time,duration:p.duration,map_id:p.map_id,map_name:mapName(p.map_id),mode:p.mode,winner_team:p.winner_team,
      values:Object.fromEntries(Object.keys(fields).map(k=>[k,0])),models:[]};groups.set(key,g);}
    g.player_ids.push(p.player_id);g.teams.add(p.team_id);
    const raw=JSON.parse(p.raw_json);for(const k of Object.keys(fields))g.values[k]=sum(g.values[k],metric(p,raw,k));
  }
  const unitRows=store.all(`SELECT u.*,r.member_id,c.data_json AS catalogue_json FROM unit_instances u JOIN matches m ON m.id=u.match_id
    LEFT JOIN registered_participants r ON r.match_id=u.match_id AND r.player_id=u.player_id
    LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id WHERE ${f.sql} AND m.detail_state='complete'`,...f.args);
  const models=new Map();
  for(const u of unitRows){
    const key=u.match_id+':'+(u.member_id?'member:'+u.member_id:'player:'+u.player_id),g=groups.get(key);if(!g)continue;
    const id=key+':'+u.unit_id;let m=models.get(id);
    if(!m){m={unit_id:u.unit_id,name:name(u.catalogue_json?JSON.parse(u.catalogue_json):null,u.unit_id),deployments:0,kills:0};models.set(id,m);g.models.push(m);}
    m.deployments++;m.kills=sum(m.kills,Number.isSafeInteger(u.kills)&&u.kills>=0?u.kills:null);
  }
  const all=[...groups.values()].map(g=>{
    const team=g.teams.size===1?[...g.teams][0]:null,knownTeam=Number.isInteger(team)&&team>=0&&team!==100;
    const outcome=knownTeam&&Number.isInteger(g.winner_team)&&g.winner_team>=0&&g.winner_team!==100&&rows.some(p=>p.match_id===g.match_id&&p.team_id===g.winner_team);
    const evidence=units.get(g.key),v=g.values;
    const {teams,winner_team,...rest}=g;
    return {...rest,team_id:knownTeam?team:null,won:outcome?team===g.winner_team:null,
      net_exchange:v.destruction===null||v.losses===null?null:v.destruction-v.losses,
      net_received:v.received===null||v.supplied===null?null:Math.max(0,v.received-v.supplied),
      heavy_kills:!evidence?0:evidence.heavy.known?evidence.heavy.kills:null,
      air_kills:!evidence?0:evidence.air.known?evidence.air.kills:null,
      models:g.models.sort((a,b)=>b.deployments-a.deployments||a.unit_id.localeCompare(b.unit_id))};
  });
  const member=/^\d+$/.test(params.get('member')??'')?Number(params.get('member')):null;
  const people=all.filter(r=>r.member_id!==null&&(member===null||r.member_id===member));
  const categories=scenarios.map(({select,value,...s})=>{
    const candidates=people.filter(r=>r.team_id!==null&&select(r)).sort((a,b)=>value(b)-value(a)||b.end_time-a.end_time||a.key.localeCompare(b.key));
    const seen=new Set(),selected=[];
    for(const r of candidates){if(seen.has(r.member_id))continue;seen.add(r.member_id);selected.push(r);if(selected.length===3)break;}
    return {...s,candidates:candidates.length,cases:selected.map(r=>({...r,status:'待人工复核',
      peers:all.filter(p=>p.match_id===r.match_id&&p.team_id===r.team_id).map(p=>({member_id:p.member_id,name:p.name,player_ids:p.player_ids,values:p.values}))}))};
  });
  return {kind:'court-evidence-review',version:'court-review-v1',overview:{matches:overview.matches,complete:overview.complete??0,
    missing:overview.matches-(overview.complete??0),person_matches:people.length,ambiguous_team:people.filter(r=>r.team_id===null).length,
    selected:new Set(categories.flatMap(c=>c.cases.map(r=>r.key))).size,confirmed_labels:0},
    limitations:['缺少目标控制时长和阶段结算轨迹','缺少侦察发现、激光指示和协同归因','无法区分主动承担战损与无意义损失','无法核对补给用途、战术分工与队友约定','缺少明确的对局规则版本，不能混同历史结算机制'],categories};
}
