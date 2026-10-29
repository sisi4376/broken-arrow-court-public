const states=new Map();
const storageKey='court.table-sorts.v1';
let loaded=false;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load() {
  if(loaded)return;loaded=true;
  try {for(const [id,state] of Object.entries(sessionStorage.getItem(storageKey)?JSON.parse(sessionStorage.getItem(storageKey)):{}))if(state&&typeof state.key==='string'&&['asc','desc'].includes(state.direction))states.set(id,state);} catch {}
}
function remember(id,state) {
  load();if(state)states.set(id,state);else states.delete(id);
  try {sessionStorage.setItem(storageKey,JSON.stringify(Object.fromEntries(states)));} catch {}
}
function valueOf(value,type) {
  if(value===null||value===undefined||value==='')return null;
  if(type==='text')return String(value);
  const n=Number(value);return Number.isNaN(n)?null:n;
}
export function compareValues(a,b,{type='number',direction='desc'}={}) {
  const x=valueOf(a,type),y=valueOf(b,type);
  // Missing data is always last, including ascending order. Zero is valid data.
  if(x===null||y===null)return x===y?0:x===null?1:-1;
  const result=type==='text'?x.localeCompare(y,'zh-CN',{numeric:true,sensitivity:'base'}):x===y?0:x<y?-1:1;
  return result===0?0:direction==='asc'?result:-result;
}
export function scoreRatio(numerator,denominator) {
  if(numerator===null||numerator===undefined||denominator===null||denominator===undefined)return null;
  return denominator?numerator/denominator:numerator>0?Infinity:null;
}
const serialValue=value=>value===Infinity?'Infinity':value===-Infinity?'-Infinity':value;
function ordered(items,column,state) {
  if(!column||!state)return [...items].sort((a,b)=>a.index-b.index);
  return [...items].sort((a,b)=>compareValues(a.values[column.key],b.values[column.key],{type:column.type,direction:state.direction})||a.index-b.index);
}
export function sortableTable(id,html,rows,columns) {
  load();
  const meta=columns.map(c=>({key:c.key,index:c.index,label:c.label,type:c.type??'number',first:c.first??(c.type==='text'?'asc':'desc')}));
  const state=states.get(id),active=meta.find(c=>c.key===state?.key);
  html=html.replace('<table',`<table data-sort-table="${escape(id)}" data-sort-columns="${escape(JSON.stringify(meta))}"`);
  html=html.replace(/<thead>([\s\S]*?)<\/thead>/,(_,head)=>{
    let i=0;return '<thead>'+head.replace(/<th(\s[^>]*)?>([\s\S]*?)<\/th>/g,(whole,attrs='',label)=>{
      const index=i++,c=meta.find(c=>c.index===index);if(!c)return whole;
      const selected=active?.key===c.key,direction=selected?state.direction:null;
      return `<th${attrs} aria-sort="${direction==='asc'?'ascending':direction==='desc'?'descending':'none'}"><button type="button" class="column-sort${selected?' active':''}" data-table-sort="${escape(c.key)}" title="点击按${escape(c.label)}排序，再次点击切换方向">${label}<span class="sort-arrow" aria-hidden="true">${direction==='asc'?'↑':direction==='desc'?'↓':'↕'}</span></button></th>`;
    })+'</thead>';
  });
  html=html.replace(/<tbody>([\s\S]*?)<\/tbody>/,(_,body)=>{
    const parts=[...body.matchAll(/<tr(?:\s[^>]*)?>[\s\S]*?<\/tr>/g)];
    if(parts.length!==rows.length)throw new Error('排序数据与表格行数不一致');
    const items=parts.map((m,index)=>{
      const values=Object.fromEntries(columns.map(c=>[c.key,serialValue(c.value(rows[index]))]));
      const row=m[0].replace('<tr',`<tr data-sort-index="${index}" data-sort-values="${escape(JSON.stringify(values))}"`);
      return {index,values,html:row};
    });
    return '<tbody>'+ordered(items,active,state).map(r=>r.html).join('')+'</tbody>';
  });
  const note=active?`${active.label} · ${state.direction==='asc'?'升序':'降序'}`:'默认排序';
  return `<div class="table-sort-bar" data-sort-controls="${escape(id)}"><span>点击列名排序</span><span class="table-sort-current" aria-live="polite">${escape(note)}</span><button type="button" class="table-sort-reset" data-table-sort-reset="${escape(id)}" ${active?'':'disabled'}>恢复默认</button></div>`+html;
}
export function installTableSorting() {
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-table-sort],[data-table-sort-reset]');if(!button)return;
    const table=button.hasAttribute('data-table-sort')?button.closest('table'):Array.from(document.querySelectorAll('[data-sort-table]')).find(t=>t.dataset.sortTable===button.dataset.tableSortReset);
    if(!table)return;
    event.preventDefault();event.stopImmediatePropagation();
    const id=table.dataset.sortTable,columns=JSON.parse(table.dataset.sortColumns);let state=null;
    if(button.hasAttribute('data-table-sort')){
      const column=columns.find(c=>c.key===button.dataset.tableSort);if(!column)return;
      const previous=states.get(id);state={key:column.key,direction:previous?.key===column.key?(previous.direction==='desc'?'asc':'desc'):column.first};
    }
    remember(id,state);const column=columns.find(c=>c.key===state?.key);
    const body=table.tBodies[0],items=Array.from(body.rows).map(row=>({index:Number(row.dataset.sortIndex),values:JSON.parse(row.dataset.sortValues),row}));
    for(const item of ordered(items,column,state))body.append(item.row);
    for(const th of table.tHead.querySelectorAll('th')){
      const control=th.querySelector('[data-table-sort]');if(!control)continue;
      const selected=control.dataset.tableSort===state?.key;
      th.setAttribute('aria-sort',selected?(state.direction==='asc'?'ascending':'descending'):'none');
      control.classList.toggle('active',selected);control.querySelector('.sort-arrow').textContent=selected?(state.direction==='asc'?'↑':'↓'):'↕';
    }
    const bar=Array.from(document.querySelectorAll('[data-sort-controls]')).find(b=>b.dataset.sortControls===id);
    bar.querySelector('.table-sort-current').textContent=column?`${column.label} · ${state.direction==='asc'?'升序':'降序'}`:'默认排序';
    bar.querySelector('[data-table-sort-reset]').disabled=!state;
  });
}
