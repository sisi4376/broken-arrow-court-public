// Official live-release notices, checked 2026-10-22:
// https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=1604270&count=100&feeds=steam_community_announcements
// These are display labels, independent of the archived price catalogues.
// Maintenance windows use the announced maximum duration conservatively.
// Hotfixes without a deployment time leave the entire CEST release day unknown.
const time=s=>Date.parse(s)/1000;
const releases=[
  ['1.1.0.4','2026-07-03T22:00:00Z','2026-07-30T10:00:00Z'],
  ['1.1.1','2026-07-30T13:00:00Z','2026-08-05T11:30:00Z'],
  ['1.1.1.1','2026-08-05T12:30:00Z','2026-08-10T22:00:00Z'],
  ['1.1.1.2','2026-08-11T22:00:00Z','2026-08-21T09:00:00Z'],
  ['1.1.2','2026-08-21T11:00:00Z','2026-08-31T10:00:00Z'],
  ['1.2.0','2026-08-31T13:00:00Z','2026-09-03T10:00:00Z'],
  ['1.2.0.1','2026-09-03T12:00:00Z','2026-09-06T22:00:00Z'],
  ['1.2.0.2','2026-09-07T22:00:00Z','2026-09-14T10:00:00Z'],
  ['1.2.0.3','2026-09-14T12:00:00Z','2026-10-20T11:00:00Z'],
  ['1.2.1','2026-10-20T14:00:00Z',null],
].map(([version,start,end])=>({version,start:time(start),end:end===null?Infinity:time(end)}));
const valid=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;

export function matchGameVersion(m){
  const end=m.end_time,start=m.detail?.data?.StartTime??m.raw?.StartTime??(valid(end)&&valid(m.duration)?end-m.duration:null);
  if(!valid(start)||!valid(end)||start>=end)return null;
  return releases.find(r=>start>=r.start&&end<=r.end)?.version??null;
}
