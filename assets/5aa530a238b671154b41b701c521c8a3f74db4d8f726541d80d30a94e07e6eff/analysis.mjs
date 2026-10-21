import { filters, memberStats } from './queries.mjs';
import { mapName } from './domain.mjs';
import { zhanfanAnalysis } from './zhanfan.mjs';

export function deckModel(store) {
  const row=store.get("SELECT data_json FROM analysis_catalogue WHERE key='deck_model'");
  return row?JSON.parse(row.data_json):{specializations:[],units:{}};
}
const countryName=id=>Number(id)===1?'俄':Number(id)===2?'美':`国家 ${id}`;
const SPEC_NAMES={3:'海军陆战队',4:'装甲旅',5:'空降步兵',6:'斯崔克骑兵团',7:'空降旅',8:'近卫坦克旅',9:'摩托化步兵',10:'海岸部队',12:'国土防卫部队',13:'特种作战部队',15:'机械化步兵',16:'波罗的海部队'};
export function specName(s) { return `${countryName(s.countryId)} · ${SPEC_NAMES[s.id]??s.name}`; }
export function identifyDeck(raw, override, model) {
  const specs=model.specializations;
  function known(ids,source) {
    const pair=ids.map(id=>specs.find(s=>Number(s.id)===Number(id)));
    if(pair.length!==2||!pair.every(Boolean)||pair[0].id===pair[1].id||pair[0].countryId!==pair[1].countryId)return null;
    pair.sort((a,b)=>a.id-b.id);
    return {key:pair.map(s=>s.id).join('_'),name:pair.map(s=>SPEC_NAMES[s.id]??s.name).join(' + '),country:countryName(pair[0].countryId),spec_ids:pair.map(s=>s.id),source};
  }
  if(override){const result=known([override.spec1,override.spec2],'confirmed');if(result)return result;}
  const explicit=raw.SpecializationIds??raw.specialization_ids;
  if(Array.isArray(explicit)){const result=known(explicit,'source');if(result)return result;}
  const ids=[...new Set((raw.AnalysisUnitIds??Object.values(raw.UnitData??{}).map(u=>u.Id)).map(String))];
  const evidence=ids.map(id=>model.units[id]).filter(u=>u?.spec_ids?.length);
  if(!evidence.length)return {key:'unknown',name:'专精组合未确认',source:'unknown',reason:ids.length?'专精映射不足':'缺少单位明细'};
  const candidates=[];
  for(let i=0;i<specs.length;i++)for(let j=i+1;j<specs.length;j++){
    const a=specs[i],b=specs[j];
    if(a.countryId===b.countryId&&evidence.every(u=>u.country_id===a.countryId&&u.spec_ids.some(id=>id===a.id||id===b.id)))candidates.push([a.id,b.id]);
  }
  if(candidates.length!==1)return {key:'unknown',name:'专精组合未确认',source:'unknown',reason:candidates.length?`仍有 ${candidates.length} 种可能组合`:'出场单位与当前专精目录不一致',candidates:candidates.length};
  return {...known(candidates[0],'inferred'),evidence_units:evidence.length,total_units:ids.length};
}

function metric() { return {matches:0,wins:0,losses_count:0,decided:0,rating_delta:0,rating_samples:0,destruction:0,destruction_samples:0,losses:0,losses_samples:0,objectives:0,objectives_samples:0,detail_matches:0,damage:0,friendly_fire:0,supplied_allies:0,duration:0,confirmed:0,inferred:0}; }
function add(m,r) {
  m.matches++;if(r.won!==null){m.decided++;m.wins+=r.won===1?1:0;m.losses_count+=r.won===0?1:0;}
  if(r.rating_delta!==null){m.rating_delta+=r.rating_delta;m.rating_samples++;}
  for(const key of ['destruction','losses','objectives'])if(r[key]!==null&&r[key]!==undefined){m[key]+=r[key];m[key+'_samples']++;}
  m.duration+=r.duration??0;
  if(r.complete){m.detail_matches++;m.damage+=r.damage;m.friendly_fire+=r.friendly_fire;m.supplied_allies+=r.supplied_allies;}
  if(r.deck?.source==='inferred')m.inferred++;else if(r.deck&&r.deck.key!=='unknown')m.confirmed++;
}
function finish(m) {
  return {...m,unknown:m.matches-m.decided,win_rate:m.decided?m.wins/m.decided:null,avg_rating_delta:m.rating_samples?m.rating_delta/m.rating_samples:null,
    rating_delta:m.rating_samples?m.rating_delta:null,destruction:m.destruction_samples?m.destruction:null,losses:m.losses_samples?m.losses:null,objectives:m.objectives_samples?m.objectives:null,
    avg_destruction:m.destruction_samples?m.destruction/m.destruction_samples:null,avg_losses:m.losses_samples?m.losses/m.losses_samples:null,
    avg_objectives:m.objectives_samples?m.objectives/m.objectives_samples:null,avg_damage:m.detail_matches?m.damage/m.detail_matches:null,
    avg_friendly_fire:m.detail_matches?m.friendly_fire/m.detail_matches:null,avg_supplied_allies:m.detail_matches?m.supplied_allies/m.detail_matches:null};
}
function groupStats(rows,keyFor,metaFor) {
  const groups=new Map();for(const r of rows){const key=keyFor(r);let g=groups.get(key);if(!g){g={...metric(),...metaFor(r),match_ids:new Set()};groups.set(key,g);}add(g,r);g.match_ids.add(r.match_id);}
  return [...groups.values()].map(g=>{const {match_ids,...rest}=g;return {...finish(rest),unique_matches:match_ids.size};}).sort((a,b)=>b.matches-a.matches||b.decided-a.decided||String(a.key).localeCompare(String(b.key)));
}
function rank(rows,min,descending=true) { return rows.filter(r=>r.decided>=min).sort((a,b)=>(descending?b.win_rate-a.win_rate:a.win_rate-b.win_rate)||b.decided-a.decided||b.matches-a.matches||String(a.key).localeCompare(String(b.key))); }
function minimum(params) { return Math.max(1,Math.min(100,Math.floor(Number(params.get('min_games'))||5))); }

function records(store,params,model) {
  const f=filters(params);
  const rows=store.all(`SELECT r.*,m.map_id,m.end_time,m.duration,m.detail_state FROM registered_participants r JOIN matches m ON m.id=r.match_id WHERE ${f.sql} ORDER BY m.end_time,CAST(m.id AS INTEGER),r.member_id,r.player_id`,...f.args);
  const overrides=new Map(store.all('SELECT * FROM match_decks').map(o=>[`${o.match_id}:${o.player_id}`,o]));
  const merged=new Map();
  for(const r of rows){
    const raw=JSON.parse(r.raw_json);const deck=identifyDeck(raw,overrides.get(`${r.match_id}:${r.player_id}`),model);
    const key=`${r.match_id}:${r.member_id}`;let row=merged.get(key);
    if(!row){row={match_id:r.match_id,member_id:r.member_id,name:r.member_name,map_id:r.map_id,end_time:r.end_time,duration:r.duration,complete:r.detail_state==='complete',won:null,team_id:null,rating_delta:null,destruction:null,losses:null,objectives:null,damage:0,friendly_fire:0,supplied_allies:0,accounts:[],teams:new Set(),outcomes:new Set()};merged.set(key,row);}
    row.accounts.push({player_id:r.player_id,name:r.name,deck});
    row.teams.add(r.team_id);row.outcomes.add(r.won);
    if(r.rating_delta!==null)row.rating_delta=(row.rating_delta??0)+r.rating_delta;
    for(const key of ['destruction','losses','objectives'])if(r[key]!==null)row[key]=(row[key]??0)+r[key];
    if(row.complete){row.damage+=Number(raw.DamageDealt)||0;row.friendly_fire+=Number(raw.DamageFriendlyFireDealt)||0;row.supplied_allies+=Number(raw.SupplyPointsConsumedByAllies)||0;}
  }
  return [...merged.values()].map(r=>{
    const {teams,outcomes,...rest}=r;
    rest.team_id=teams.size===1?[...teams][0]:null;
    rest.won=teams.size===1&&outcomes.size===1?[...outcomes][0]:null;
    const deckKeys=new Set(r.accounts.map(a=>a.deck.key));
    rest.deck=deckKeys.size===1?r.accounts[0].deck:{key:'unknown',name:'专精组合未确认',source:'unknown',reason:'同一朋友多账号组合不同或部分未确认'};
    if(rest.deck.key!=='unknown'&&r.accounts.some(a=>a.deck.source==='inferred'))rest.deck={...rest.deck,source:'inferred'};
    return rest;
  });
}

function relationships(allRows,memberId,min) {
  const mine=new Map(allRows.filter(r=>r.member_id===memberId).map(r=>[r.match_id,r]));const groups=new Map();
  for(const other of allRows){const self=mine.get(other.match_id);if(!self||other.member_id===memberId)continue;
    let g=groups.get(other.member_id);if(!g){g={key:String(other.member_id),member_id:other.member_id,name:other.name,together:0,same:metric(),opposed:metric(),unclassified:0};groups.set(other.member_id,g);}g.together++;
    if(self.team_id===null||other.team_id===null){g.unclassified++;continue;}
    if(self.team_id===other.team_id)add(g.same,self);else add(g.opposed,self);
  }
  const rows=[...groups.values()].map(g=>({...g,same:finish(g.same),opposed:finish(g.opposed)})).sort((a,b)=>b.same.matches-a.same.matches||b.together-a.together||a.member_id-b.member_id);
  const teammates=rows.filter(g=>g.same.matches).map(g=>({...g.same,key:g.key,member_id:g.member_id,name:g.name,together:g.together,opposed:g.opposed}));
  return {rows,most:teammates[0]??null,best:rank(teammates,min)[0]??null,worst:rank(teammates,min,false)[0]??null,eligible:teammates.filter(t=>t.decided>=min).length};
}
function trend(rows) {
  let win=0,loss=0,bestWin=0,bestLoss=0,current=0;
  for(const r of rows){if(r.won===null){win=0;loss=0;current=0;}else if(r.won){win++;loss=0;bestWin=Math.max(bestWin,win);current=win;}else{loss++;win=0;bestLoss=Math.max(bestLoss,loss);current=-loss;}}
  const last=rows.slice(-10),recent=metric();last.forEach(r=>add(recent,r));
  const periods=groupStats(rows,r=>r.end_time?new Date((r.end_time+8*3600)*1000).toISOString().slice(0,7):'未知日期',r=>({key:r.end_time?new Date((r.end_time+8*3600)*1000).toISOString().slice(0,7):'未知日期'})).sort((a,b)=>a.key.localeCompare(b.key));
  return {recent:finish(recent),recent_results:last.map(r=>({match_id:r.match_id,won:r.won,end_time:r.end_time})),current_streak:current,best_win_streak:bestWin,best_loss_streak:bestLoss,periods};
}
function unitPreferences(store,params,allRows,memberId) {
  const f=filters(params);const extra=memberId?' AND r.member_id=?':'';
  const used=store.all(`SELECT r.member_id,u.match_id,u.unit_id,COUNT(*) AS instances,SUM(u.kills) AS kills,SUM(u.damage) AS damage,SUM(u.damage_received) AS damage_received,SUM(u.refunded) AS refunded,SUM(u.death_time IS NOT NULL) AS deaths,SUM(u.supply) AS supply,c.data_json AS catalogue_json
    FROM unit_instances u JOIN registered_participants r ON r.match_id=u.match_id AND r.player_id=u.player_id JOIN matches m ON m.id=u.match_id LEFT JOIN unit_catalogue c ON c.unit_id=u.unit_id
    WHERE ${f.sql}${extra} AND m.detail_state='complete' GROUP BY r.member_id,u.match_id,u.unit_id`,...f.args,...(memberId?[memberId]:[]));
  const outcomes=new Map(allRows.map(r=>[`${r.match_id}:${r.member_id}`,r]));const groups=new Map();
  for(const u of used){let g=groups.get(u.unit_id);if(!g){g={...metric(),key:u.unit_id,unit_id:u.unit_id,instances:0,kills:0,unit_damage:0,damage_received:0,refunded:0,deaths:0,supply:0,catalogue:u.catalogue_json?JSON.parse(u.catalogue_json):null};groups.set(u.unit_id,g);}const r=outcomes.get(`${u.match_id}:${u.member_id}`);if(!r)continue;add(g,r);for(const k of ['instances','kills','damage_received','refunded','deaths','supply'])g[k]+=u[k]??0;g.unit_damage+=u.damage??0;}
  const complete=allRows.filter(r=>(!memberId||r.member_id===memberId)&&r.complete).length;
  return [...groups.values()].map(g=>({...finish(g),damage:g.unit_damage,usage_rate:complete?g.matches/complete:null})).sort((a,b)=>b.matches-a.matches||b.instances-a.instances||String(a.unit_id).localeCompare(String(b.unit_id)));
}
function unitHighlights(units) {
  const highest=key=>{
    const eligible=units.filter(u=>Number.isFinite(u[key])&&u[key]>0);
    const maximum=Math.max(0,...eligible.map(u=>u[key]));
    return eligible.filter(u=>u[key]===maximum).sort((a,b)=>String(a.unit_id).localeCompare(String(b.unit_id),'en',{numeric:true}));
  };
  return {most_used:highest('instances'),most_damage:highest('damage'),most_kills:highest('kills')};
}
function summarize(rows,min) {
  const total=metric();rows.forEach(r=>add(total,r));
  const decks=groupStats(rows,r=>r.deck.key,r=>({key:r.deck.key,name:r.deck.name,country:r.deck.country,spec_ids:r.deck.spec_ids??[]}));
  const maps=groupStats(rows,r=>r.map_id,r=>({key:r.map_id,map_id:r.map_id,name:mapName(r.map_id)}));
  const deckMaps=groupStats(rows.filter(r=>r.deck.key!=='unknown'),r=>`${r.deck.key}:${r.map_id}`,r=>({key:`${r.deck.key}:${r.map_id}`,deck:r.deck.name,deck_key:r.deck.key,map_id:r.map_id,map:mapName(r.map_id)}));
  return {overview:{...finish(total),unique_matches:new Set(rows.map(r=>r.match_id)).size,deck_known:rows.filter(r=>r.deck.key!=='unknown').length},decks,maps,deck_maps:deckMaps,
    favorites:{deck:decks.find(d=>d.key!=='unknown')??null,best_deck:rank(decks.filter(d=>d.key!=='unknown'),min)[0]??null,best_map:rank(maps,min)[0]??null,worst_map:rank(maps,min,false)[0]??null}};
}
export function overallAnalysis(store,params=new URLSearchParams()) {
  const model=deckModel(store),min=minimum(params),all=records(store,params,model);
  const memberId=/^\d+$/.test(params.get('member')??'')?Number(params.get('member')):null;
  const rows=memberId?all.filter(r=>r.member_id===memberId):all;
  return {...summarize(rows,min),min_games:min,units:unitPreferences(store,params,rows,memberId),model:{updated_at:model.updated_at??null,db_file:model.db_file??null},perspective:'member-match'};
}
export function friendAnalysis(store,id,params=new URLSearchParams()) {
  const member=store.get('SELECT id,name,active FROM members WHERE id=?',Number(id));if(!member)return null;
  const scoped=new URLSearchParams(params);scoped.set('member',String(member.id));
  const model=deckModel(store),min=minimum(params),all=records(store,scoped,model),rows=all.filter(r=>r.member_id===member.id);
  const base=summarize(rows,min);
  const teammates=relationships(all,member.id,min),units=unitPreferences(store,scoped,rows,member.id);
  const court=zhanfanAnalysis(store,scoped);
  return {...base,member,min_games:min,teammates,units,unit_highlights:unitHighlights(units),trend:trend(rows),stats:memberStats(store,scoped).find(m=>m.member_id===member.id)??null,
    court:{model:court.model,min_games:court.min_games,sentencing_window:court.sentencing_window,report:court.members.find(r=>r.member_id===member.id)??null},
    recent_matches:rows.slice(-20).reverse().map(r=>({id:r.match_id,end_time:r.end_time,map:mapName(r.map_id),won:r.won,rating_delta:r.rating_delta,deck:r.deck,destruction:r.destruction,losses:r.losses,accounts:r.accounts})),
    match_archive:personalMatches(store,member.id,params),
    model:{updated_at:model.updated_at??null,db_file:model.db_file??null}};
}

export function personalMatches(store,memberId,params=new URLSearchParams()){
  const scoped=new URLSearchParams(params);scoped.set('scope','all');scoped.set('member',String(memberId));scoped.delete('team');
  const f=filters(scoped,{candidates:true}),scope=params.get('match_scope')==='other'?'other':'court',limit=20;
  const counts=store.get(`SELECT COUNT(*) total,COALESCE(SUM(m.friend_count>=3),0) court,COALESCE(SUM(m.friend_count<3),0) other FROM matches m WHERE ${f.sql}`,...f.args);
  const total=counts[scope],pages=Math.max(1,Math.ceil(total/limit)),requested=Number(params.get('match_page'));
  const page=Math.min(pages,Number.isSafeInteger(requested)&&requested>0?requested:1);
  const items=store.all(`SELECT m.id,m.end_time,m.duration,m.map_id,m.mode,m.friend_count,m.detail_state,
    CASE WHEN COUNT(*)=COUNT(r.won) AND COUNT(*)=COUNT(r.team_id) AND COUNT(DISTINCT r.team_id)=1 AND COUNT(DISTINCT r.won)=1 THEN MIN(r.won) END won,
    SUM(r.rating_delta) rating_delta,SUM(r.destruction) destruction,SUM(r.losses) losses
    FROM matches m JOIN registered_participants r ON r.match_id=m.id AND r.member_id=?
    WHERE ${f.sql} AND m.friend_count${scope==='court'?'>=3':'<3'} GROUP BY m.id
    ORDER BY m.end_time DESC,CAST(m.id AS INTEGER) DESC LIMIT ? OFFSET ?`,Number(memberId),...f.args,limit,(page-1)*limit);
  for(const item of items){item.map=mapName(item.map_id);item.accounts=store.all('SELECT player_id,name FROM registered_participants WHERE match_id=? AND member_id=? ORDER BY player_id',item.id,Number(memberId));}
  return {scope,items,total,page,pages,counts};
}
