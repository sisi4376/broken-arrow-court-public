// Presentation copy only; imported player names and records stay verbatim.
export const COURT_COPY = Object.freeze({
  '法庭总览':'审判大厅', '对局档案':'对局卷宗', '开黑分析':'庭审分析', '朋友与账号':'看守所', '数据管理':'书记官室',
  '朋友详细分析':'被告档案', '对局详情':'卷宗详情', '法庭档案':'审判席',
  '朋友表现':'被告表现', '参与朋友':'涉案人员', '全部朋友':'全部被告', '朋友 / 账号':'被告 / 游戏账号',
  '最近的开黑':'最近立案', '开黑活动':'立案记录', '地图分布':'案发地点分布',
  '全部对局':'全部卷宗', '开黑对局':'涉案对局', '开黑时长':'涉案时长', '完整归档':'证据齐备',
  '候选对局':'待立案记录', '合格开黑':'已立案卷宗', '完整详情':'完整证据', '赛后汇总':'案情摘要',
  '赛后统计':'证据清单', '单位与时间轴':'现场还原', '玩家对比':'当庭对质', '原始档案':'原始证据',
  '对局 #':'卷宗 #', '登记游戏账号':'登记涉案账号', '登记账号':'登记涉案账号', '添加朋友':'收押登记', '邀请注册':'签发传票',
  '查看详细分析':'查看案底', '详细分析':'查看案底', '综合画像':'被告画像', '最近对局':'关联卷宗', '队友关系':'同案关系',
  '同队搭档':'同案搭档', '同队组合':'同案组合', '共同开黑':'共同涉案', '常用单位':'涉案装备',
  '查看账号生涯':'查看履历', '调整朋友归属':'调整被告归属', '修改称呼':'修改登记名',
  '立即同步':'调取新卷宗', '全量回溯':'重查旧案', '按 ID 补抓':'按案号调卷', '导入':'补交证据',
  '同步日志':'书记官日志', '同步任务':'调卷任务', '历史覆盖':'卷宗覆盖',
  '备份与导出':'封存与备份', '数据库备份':'封存备份', '导出完整档案':'导出完整卷宗', '下载本局数据':'下载本案证据',
  '朋友称呼':'被告称呼', '朋友不存在':'被告不存在', '朋友已添加':'已完成收押登记',
  '停用朋友':'移出看守所（停用）', '恢复朋友':'恢复收押（启用）', '管理员':'审判长',
  '只读访客':'旁听席', '朋友':'被告',
});
const escapePattern = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = new RegExp(Object.keys(COURT_COPY).sort((a,b)=>b.length-a.length).map(escapePattern).join('|'), 'g');
let enabled = false;
export const isCourtMode = () => enabled;
export function setCourtMode(value) {
  const changed = enabled !== (value === true);
  enabled = value === true;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.courtMode = enabled ? 'on' : 'off';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', enabled ? '#30201d' : '#151716');
  }
  return changed;
}
export function courtText(text) {
  return enabled && typeof text === 'string' ? text.replace(pattern, key => COURT_COPY[key]) : text;
}
// Translate authored template segments, never interpolated player/source data.
export function courtHtml(strings, ...values) {
  return strings.reduce((html, part, index) => html + courtText(part) + (index < values.length ? String(values[index]) : ''), '');
}
