(()=>{
'use strict';
const KEY='improve:v2',THEME_KEY='improve:theme',DAY=86400000;
const TIMEFRAMES=[
  {id:'daily',label:'Daily',icon:'☀️'},
  {id:'scheduled',label:'Scheduled',icon:'📌'},
  {id:'weekly',label:'Weekly',icon:'📅'},
  {id:'monthly',label:'Monthly',icon:'🗓'},
  {id:'yearly',label:'Yearly',icon:'📆'},
  {id:'5year',label:'5 Year',icon:'🚩'},
  {id:'10year',label:'10 Year',icon:'🏁'},
  {id:'life',label:'Life',icon:'♾️'},
];
const TF=Object.fromEntries(TIMEFRAMES.map(t=>[t.id,t]));
const PRIORITY={high:{label:'🔴 High',cls:'badge-hi',cardCls:'pri-high',order:0},medium:{label:'🟡 Medium',cls:'badge-md',cardCls:'pri-med',order:1},low:{label:'🔵 Low',cls:'badge-lo',cardCls:'pri-low',order:2},none:{label:'—',cls:'badge-freq',cardCls:'',order:3}};

// ── Date helpers ───────────────────────────────────────────────────────
const iso=dt=>dt.toISOString().slice(0,10);
const todayKey=()=>iso(new Date());
const dayKeyFor=d=>iso(new Date(Date.now()-d*DAY));
const fmtDate=k=>{if(!k)return'';const[y,m,d]=k.split('-');return new Date(+y,+m-1,+d).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});};
const addDays=(k,n)=>iso(new Date(new Date(k+'T12:00:00').getTime()+n*DAY));

function periodKeyForDt(period,dt){
  if(period==='day')return iso(dt);
  if(period==='week'){const off=(dt.getDay()+6)%7;return 'W'+iso(new Date(dt-off*DAY));}
  if(period==='month')return dt.toISOString().slice(0,7);
  if(period==='lifetime')return 'LIFETIME';
  return dt.toISOString().slice(0,4);
}
const periodKey=(period,offset=0)=>periodKeyForDt(period,new Date(Date.now()-offset*DAY));
const valOn=(g,k)=>g.log[k]||0;
const targetPer=g=>g.type==='count'?(g.goal||1):1;

function getLogKey(g){
  if(g.tf==='scheduled')return g.scheduledDate||todayKey();
  return periodKey(g.period,0);
}
function periodDone(g,offset=0){
  if(g.tf==='scheduled'){const k=g.scheduledDate||todayKey();return valOn(g,k)>=targetPer(g);}
  const k=periodKey(g.period,offset);
  if(g.period==='lifetime')return valOn(g,k)>=targetPer(g);
  return(g.period==='day'||g.freq<=1)?valOn(g,k)>=targetPer(g):valOn(g,k)>=g.freq;
}
function periodProgress(g,offset=0){
  if(g.tf==='scheduled'){const k=g.scheduledDate||todayKey();return{val:valOn(g,k),target:targetPer(g),key:k};}
  const k=periodKey(g.period,offset);
  const target=g.period==='lifetime'?targetPer(g):(g.period==='day'||g.freq<=1)?targetPer(g):g.freq;
  return{val:valOn(g,k),target,key:k};
}
function streak(g){
  if(g.tf==='scheduled'||g.period==='lifetime')return periodDone(g,0)?1:0;
  let s=0;
  if(g.period==='day'){for(let d=0;d<400;d++){if(periodDone(g,d))s++;else{if(d===0)continue;break;}}}
  else{const seen=new Set();let off=0,guard=0;while(guard++<2000){const k=periodKey(g.period,off);if(!seen.has(k)){seen.add(k);if(periodDone(g,off))s++;else if(off!==0)break;}off++;if(g.period==='week'&&off>(s+2)*7+14)break;if(g.period==='month'&&off>(s+2)*31+40)break;if(g.period==='year'&&off>(s+2)*366+400)break;}}
  return s;
}

// ── State ─────────────────────────────────────────────────────────────
let state={goals:[]},activeTab='daily',activeView='goals';
let calOffset=0,sumCalOffset=0,editingId=null,trendChart=null,selectedDate=todayKey();
let completedOpen=false,dragSrcIdx=null;

function defaultState(){return{goals:[
  {id:'g1',tf:'daily',name:'Drink water',type:'count',goal:8,freq:1,period:'day',reminder:'09:00',notes:'Refill bottle every morning',priority:'medium',order:0,completedOn:null,log:{}},
  {id:'g2',tf:'daily',name:'Exercise',type:'binary',freq:4,period:'week',reminder:'07:00',notes:'4x a week target',priority:'high',order:1,completedOn:null,log:{}},
  {id:'g3',tf:'scheduled',name:'Doctor appointment',type:'binary',freq:1,period:'day',scheduledDate:todayKey(),reminder:'',notes:'Annual checkup',priority:'medium',order:0,completedOn:null,log:{}},
  {id:'g4',tf:'yearly',name:'Read 24 books',type:'count',goal:24,freq:1,period:'year',reminder:'',notes:'2 per month',priority:'low',order:0,completedOn:null,log:{}},
  {id:'g5',tf:'life',name:'Visit 30 countries',type:'count',goal:30,freq:1,period:'lifetime',reminder:'',notes:'Bucket list',priority:'medium',order:0,completedOn:null,log:{}},
]};}

function loadState(){
  try{const s=localStorage.getItem(KEY);if(s)state=JSON.parse(s);else state=defaultState();}
  catch{state=defaultState();}
  state.goals=state.goals.map((g,i)=>({freq:1,period:'day',reminder:'',notes:'',priority:'none',order:i,completedOn:null,log:{},...g}));
}
function saveState(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch{}}

// ── Theme ─────────────────────────────────────────────────────────────
function loadTheme(){applyTheme(localStorage.getItem(THEME_KEY)||'dark',false);}
function applyTheme(theme,save=true){
  document.documentElement.setAttribute('data-theme',theme);
  document.getElementById('theme-btn').textContent=theme==='dark'?'☀️':'🌙';
  document.getElementById('theme-meta').setAttribute('content',theme==='dark'?'#0a0a0f':'#f5f5f7');
  if(save)localStorage.setItem(THEME_KEY,theme);
  if(trendChart)renderChart();
}
function toggleTheme(){const c=document.documentElement.getAttribute('data-theme')||'dark';applyTheme(c==='dark'?'light':'dark');}

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2500);}

// ── Notifications ─────────────────────────────────────────────────────
async function requestNotifications(){
  if(!('Notification'in window)){toast('Not supported');return;}
  const p=await Notification.requestPermission();toast(p==='granted'?'Reminders enabled ✓':'Permission denied');
}
function checkReminders(){
  if(Notification.permission!=='granted')return;
  const now=new Date(),hh=now.getHours(),mm=now.getMinutes();
  state.goals.forEach(g=>{if(!g.reminder)return;const[rh,rm]=g.reminder.split(':').map(Number);if(rh===hh&&Math.abs(rm-mm)<=1)new Notification('IM-PROVE',{body:`Time to: ${g.name}`,icon:'icons/icon-192.png'});});
}

// ── Period options ────────────────────────────────────────────────────
function periodOptions(selected,tf){
  const opts=[{v:'day',l:'per day'},{v:'week',l:'per week'},{v:'month',l:'per month'},{v:'year',l:'per year'}];
  if(tf==='life')opts.push({v:'lifetime',l:'in lifetime'});
  return opts.map(o=>`<option value="${o.v}"${selected===o.v?' selected':''}>${o.l}</option>`).join('');
}

// ── Auto-add daily→scheduled ─────────────────────────────────────────
// When a daily goal is added, also create a scheduled copy for today if it doesn't exist
function syncDailyToScheduled(g){
  if(g.tf!=='daily'||g.period!=='day')return;
  const tk=todayKey();
  const exists=state.goals.some(x=>x.tf==='scheduled'&&x.sourceId===g.id&&x.scheduledDate===tk);
  if(!exists){
    const copy={...g,id:'s'+Date.now()+'_'+g.id,tf:'scheduled',scheduledDate:tk,sourceId:g.id,order:state.goals.filter(x=>x.tf==='scheduled').length,completedOn:null,log:{}};
    state.goals.push(copy);
  }
}
function syncAllDailyToScheduled(){
  const tk=todayKey();
  state.goals.filter(g=>g.tf==='daily'&&g.period==='day').forEach(g=>{
    const exists=state.goals.some(x=>x.tf==='scheduled'&&x.sourceId===g.id&&x.scheduledDate===tk);
    if(!exists){
      const copy={...g,id:'s'+Date.now()+Math.random(),tf:'scheduled',scheduledDate:tk,sourceId:g.id,order:state.goals.filter(x=>x.tf==='scheduled').length,completedOn:null,log:{}};
      state.goals.push(copy);
    }
  });
}

// ── Shift incomplete goals ────────────────────────────────────────────
function checkIncompleteAndShift(){
  const yesterday=dayKeyFor(1);
  const incomplete=state.goals.filter(g=>{
    if(g.completedOn)return false;
    if(g.tf==='scheduled'){return(g.scheduledDate||todayKey())===yesterday&&!periodDone(g,0);}
    if(g.period==='day'){return valOn(g,yesterday)<targetPer(g);}
    return false;
  });
  if(!incomplete.length)return;
  openShiftDialog(incomplete,yesterday);
}

function openShiftDialog(goals,fromDate){
  const body=document.getElementById('shift-body');
  body.innerHTML=`<p style="font-size:13px;color:var(--text2);margin-bottom:16px;">These goals from <strong>${fmtDate(fromDate)}</strong> were not completed. What would you like to do?</p>`+
  goals.map(g=>`
    <div class="shift-card">
      <div class="shift-title">${g.name}</div>
      <div class="shift-sub">${g.tf==='scheduled'?`Scheduled for ${fmtDate(g.scheduledDate)}`:`Daily goal — ${valOn(g,fromDate)}/${targetPer(g)} done`}</div>
      <div class="shift-options">
        <div class="shift-opt" data-shift="tomorrow" data-id="${g.id}"><span class="shift-opt-icon">📅</span>Move to tomorrow</div>
        <div class="shift-opt" data-shift="pick" data-id="${g.id}"><span class="shift-opt-icon">🗓</span>Pick a later date<input type="date" min="${todayKey()}" value="${todayKey()}" style="margin-left:auto;background:var(--bg3);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-size:12px;padding:4px 6px;outline:none;" onclick="event.stopPropagation()" /></div>
        <div class="shift-opt" data-shift="skip" data-id="${g.id}"><span class="shift-opt-icon">✕</span>Skip / dismiss</div>
      </div>
    </div>`).join('');
  body.innerHTML+=`<button class="btn-cancel" id="shift-close" style="width:100%;margin-top:4px;">Close</button>`;
  document.getElementById('shift-overlay').classList.add('open');
}

// ── Render dispatcher ─────────────────────────────────────────────────
function render(){
  renderTabs();
  if(activeView==='goals')renderGoalsView();
  else renderSummaryView();
}

function renderTabs(){
  const tabsEl=document.getElementById('tabs');
  tabsEl.style.display=activeView==='goals'?'flex':'none';
  tabsEl.innerHTML=TIMEFRAMES.map(tf=>{
    const n=state.goals.filter(g=>g.tf===tf.id).length,on=activeTab===tf.id;
    return`<button class="tab-btn ${on?'active':''}" data-tab="${tf.id}">${tf.label}${n?`<span class="tab-count">${n}</span>`:''}</button>`;
  }).join('');
  document.getElementById('fab-add').style.display=activeView==='goals'?'flex':'none';
}

// ══════════════════════════════════════════════════════════════════════
// GOALS VIEW
// ══════════════════════════════════════════════════════════════════════
function renderGoalsView(){
  const el=document.getElementById('main-area');
  const allTabGoals=state.goals.filter(g=>g.tf===activeTab);

  // Separate active vs completed
  const activeGoals=allTabGoals.filter(g=>!g.completedOn);
  const completedGoals=allTabGoals.filter(g=>!!g.completedOn);

  // Sort active: by priority first, then manual order
  if(activeTab==='scheduled'){
    activeGoals.sort((a,b)=>{
      const pd=(PRIORITY[a.priority]||PRIORITY.none).order-(PRIORITY[b.priority]||PRIORITY.none).order;
      if(pd!==0)return pd;
      return(a.scheduledDate||'').localeCompare(b.scheduledDate||'')||a.order-b.order;
    });
  }else{
    activeGoals.sort((a,b)=>{
      const pd=(PRIORITY[a.priority]||PRIORITY.none).order-(PRIORITY[b.priority]||PRIORITY.none).order;
      return pd!==0?pd:a.order-b.order;
    });
  }

  const daily=state.goals.filter(g=>g.period==='day'&&!g.completedOn);
  const doneToday=daily.filter(g=>periodDone(g,0)).length;
  const best=state.goals.filter(g=>!g.completedOn).reduce((a,g)=>Math.max(a,streak(g)),0);

  let html=`<div class="metrics">${[
    ['Total',state.goals.filter(g=>!g.completedOn).length,''],
    ['Today',`${doneToday}/${daily.length}`,'green'],
    ['Best streak',best,'accent'],
    ['Done',completedGoals.length,''],
  ].map(([l,v,c])=>`<div class="metric-card"><div class="metric-label">${l}</div><div class="metric-value ${c}">${v}</div></div>`).join('')}</div>`;

  if(!activeGoals.length){
    html+=`<div class="empty"><div class="empty-icon">🎯</div>No active ${TF[activeTab].label.toLowerCase()} goals.<br>Tap + to add one.</div>`;
  }else{
    html+=activeGoals.map((g,idx)=>renderGoalCard(g,idx,activeGoals.length)).join('');
  }

  // Completed section
  if(completedGoals.length){
    // Group by completedOn date
    const byDate={};
    completedGoals.forEach(g=>{const d=g.completedOn||'unknown';(byDate[d]=byDate[d]||[]).push(g);});
    const sortedDates=Object.keys(byDate).sort((a,b)=>b.localeCompare(a));
    html+=`<div class="completed-section">
      <div class="completed-header" id="completed-toggle">
        <span class="completed-title">✓ Completed (${completedGoals.length})</span>
        <span class="completed-toggle">${completedOpen?'▲ hide':'▼ show'}</span>
      </div>
      <div class="completed-list ${completedOpen?'open':''}" id="completed-list">
        ${sortedDates.map(date=>`
          <div class="completed-date-group">
            <div class="completed-date-label">${date==='unknown'?'Unknown date':fmtDate(date)}</div>
            ${byDate[date].map(g=>`
              <div class="completed-card">
                <span style="font-size:16px;">${(PRIORITY[g.priority]||PRIORITY.none).label.split(' ')[0]||'✓'}</span>
                <span class="completed-card-name">${g.name}</span>
                <button class="completed-card-restore" data-restore="${g.id}">↩ Restore</button>
              </div>`).join('')}
          </div>`).join('')}
      </div>
    </div>`;
  }

  // Calendar / grid / chart for non-scheduled tabs
  if(activeTab!=='scheduled'){
    html+=`<div class="section-sep"></div>
    <div style="margin-bottom:20px;">
      <div class="sum-header">
        <span class="sum-title">Calendar</span>
        <div class="cal-nav">
          <button class="cal-nav-btn" id="cal-prev">‹</button>
          <span class="cal-month-label" id="cal-month-label"></span>
          <button class="cal-nav-btn" id="cal-next">›</button>
        </div>
      </div>
      <div class="cal-grid" id="cal-grid"></div>
    </div>
    <div style="margin-bottom:20px;">
      <div class="sum-header"><span class="sum-title">Last 7 days</span><span class="sum-sub">daily &amp; weekly</span></div>
      <div class="week-grid"><div class="wg-table" id="week-grid"></div></div>
    </div>
    <div>
      <div class="sum-header"><span class="sum-title">Completion trend</span></div>
      <div class="chart-wrap"><canvas id="trend-chart" role="img"></canvas></div>
    </div>`;
  }

  el.innerHTML=html;
  if(activeTab!=='scheduled'){renderCalendar();renderWeekGrid();renderChart();}
  setupDrag();
}

function renderGoalCard(g,idx,total){
  if(editingId===g.id)return renderEditForm(g);
  const done=periodDone(g,0);
  const{val,target}=periodProgress(g,0);
  const s=streak(g);
  const pct=Math.min(100,Math.round(100*val/target));
  const isScheduled=g.tf==='scheduled';
  const isSrc=g.tf==='daily'&&g.period==='day';

  const status=isScheduled?scheduledStatus(g):null;
  const freqTxt=isScheduled?`📅 ${fmtDate(g.scheduledDate||todayKey())}`:
    g.period==='lifetime'?`Lifetime target: ${target}`:
    g.freq>1?`${g.freq}× per ${g.period}`:
    g.type==='count'?`${target} per ${g.period}`:`once per ${g.period}`;

  const priInfo=PRIORITY[g.priority]||PRIORITY.none;
  const priBadge=g.priority&&g.priority!=='none'?`<span class="badge ${priInfo.cls}">${priInfo.label}</span>`:'';
  const statusBadge=isScheduled?(
    status==='upcoming'?`<span class="badge badge-upcoming">⏳ upcoming</span>`:
    status==='overdue'?`<span class="badge" style="background:var(--red-bg);color:var(--red)">⚠️ overdue</span>`:
    status==='done'?`<span class="badge badge-done">✓ done</span>`:
    `<span class="badge badge-date">📌 today</span>`
  ):'';
  const syncBadge=isSrc?`<span class="badge" style="background:var(--pink-bg);color:var(--pink)">📌 in scheduled</span>`:'';

  const priCardCls=priInfo.cardCls?priInfo.cardCls:'';
  const cardCls=isScheduled&&status==='upcoming'?'goal-card upcoming':isScheduled?`goal-card scheduled`:
    `goal-card ${done&&!isScheduled?'done':''} ${priCardCls}`;

  let ctrl;
  if(g.type==='binary'&&g.freq<=1){
    ctrl=`<button class="ctrl-btn ${done?'tick-done':''}" data-act="toggle" data-id="${g.id}" title="${done?'Mark undone':'Mark done'}">${done?'✓':'○'}</button>`;
  }else{
    ctrl=`<div class="goal-controls">
      <button class="ctrl-btn" data-act="dec" data-id="${g.id}">−</button>
      <span class="ctrl-val">${val}/${target}</span>
      <button class="ctrl-btn ${done?'tick-done':''}" data-act="inc" data-id="${g.id}">+</button>
    </div>`;
  }

  const moveUpBtn=idx>0?`<button class="ctrl-btn" data-act="moveup" data-id="${g.id}" title="Move up" style="font-size:11px;">▲</button>`:'';
  const moveDnBtn=idx<total-1?`<button class="ctrl-btn" data-act="movedn" data-id="${g.id}" title="Move down" style="font-size:11px;">▼</button>`:'';

  return`<div class="${cardCls}" data-gid="${g.id}" draggable="true">
    <div class="goal-card-header">
      <div class="drag-handle" title="Drag to reorder">⠿</div>
      <div class="goal-type-dot ${isScheduled?'dot-scheduled':g.type==='binary'?'dot-binary':'dot-count'}"></div>
      <div class="goal-info">
        <div class="goal-name">${g.name}</div>
        <div class="goal-meta">
          <span class="badge badge-freq">${freqTxt}</span>
          ${priBadge}${s>0&&!isScheduled?`<span class="badge badge-streak">🔥 ${s}</span>`:''}
          ${g.reminder?`<span class="badge badge-remind">🔔 ${g.reminder}</span>`:''}
          ${statusBadge}${syncBadge}
        </div>
      </div>
      <div class="goal-controls">
        ${g.type==='binary'&&g.freq<=1?ctrl:''}
        ${moveUpBtn}${moveDnBtn}
        <button class="ctrl-btn" data-act="markdone" data-id="${g.id}" title="Mark complete" style="color:var(--green)">✔</button>
        <button class="ctrl-btn" data-act="edit" data-id="${g.id}" title="Edit">✎</button>
        <button class="ctrl-btn" data-act="note" data-id="${g.id}" style="color:${g.notes?'var(--blue)':''}">📝</button>
        <button class="ctrl-btn" data-act="del" data-id="${g.id}" style="color:var(--red)">✕</button>
      </div>
    </div>
    ${(g.type!=='binary'||g.freq>1)?`<div class="goal-card-header" style="margin-top:8px;gap:0;padding-left:38px;">${ctrl}</div>`:''}
    <div class="progress-bar"><div class="progress-fill ${done?'done-fill':''}" style="width:${pct}%"></div></div>
    <div class="notes-box" id="notes-${g.id}">
      <textarea rows="2" data-noteid="${g.id}" placeholder="Add a note…">${(g.notes||'').replace(/</g,'&lt;')}</textarea>
    </div>
  </div>`;
}

function scheduledStatus(g){
  const tk=todayKey(),sd=g.scheduledDate||tk;
  if(sd>tk)return'upcoming';
  if(sd<tk)return periodDone(g,0)?'done':'overdue';
  return periodDone(g,0)?'done':'today';
}

// ── Drag and drop ─────────────────────────────────────────────────────
function setupDrag(){
  const cards=document.querySelectorAll('[data-gid][draggable]');
  cards.forEach(card=>{
    card.addEventListener('dragstart',e=>{dragSrcIdx=getActiveOrder().findIndex(g=>g.id===card.dataset.gid);card.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');document.querySelectorAll('.drag-over').forEach(el=>el.classList.remove('drag-over'));});
    card.addEventListener('dragover',e=>{e.preventDefault();card.classList.add('drag-over');});
    card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
    card.addEventListener('drop',e=>{
      e.preventDefault();card.classList.remove('drag-over');
      const destId=card.dataset.gid;
      const ordered=getActiveOrder();
      const destIdx=ordered.findIndex(g=>g.id===destId);
      if(dragSrcIdx===null||dragSrcIdx===destIdx)return;
      const moved=ordered.splice(dragSrcIdx,1)[0];
      ordered.splice(destIdx,0,moved);
      ordered.forEach((g,i)=>g.order=i);
      saveState();render();
    });
  });
}
function getActiveOrder(){
  return state.goals.filter(g=>g.tf===activeTab&&!g.completedOn).sort((a,b)=>{
    const pd=(PRIORITY[a.priority]||PRIORITY.none).order-(PRIORITY[b.priority]||PRIORITY.none).order;
    return pd!==0?pd:a.order-b.order;
  });
}

// ── Edit form ─────────────────────────────────────────────────────────
function renderEditForm(g){
  const isScheduled=g.tf==='scheduled';
  const p=g.priority||'none';
  return`<div class="edit-form" data-editid="${g.id}">
    <div class="form-row"><label class="form-label">Goal name</label>
      <input class="form-input" data-f="name" value="${(g.name||'').replace(/"/g,'&quot;')}" /></div>
    <div class="form-row-2">
      <div><label class="form-label">Type</label>
        <select class="form-input" data-f="type">
          <option value="binary"${g.type==='binary'?' selected':''}>Done / not done</option>
          <option value="count"${g.type==='count'?' selected':''}>Count / quantity</option>
        </select></div>
      <div><label class="form-label">Target amount</label>
        <input class="form-input" data-f="goal" type="number" min="1" value="${g.goal||1}" /></div>
    </div>
    ${isScheduled?`<div class="form-row"><label class="form-label">Scheduled date</label>
      <input class="form-input" data-f="scheduledDate" type="date" value="${g.scheduledDate||todayKey()}" /></div>`:
    `<div class="form-row-2">
      <div><label class="form-label">Frequency</label><input class="form-input" data-f="freq" type="number" min="1" value="${g.freq||1}" /></div>
      <div><label class="form-label">Per period</label><select class="form-input" data-f="period">${periodOptions(g.period,g.tf)}</select></div>
    </div>`}
    <div class="form-row"><label class="form-label">Priority</label>
      <div class="pri-selector">
        ${['high','medium','low','none'].map(v=>`<div class="pri-opt${p===v?' selected':''}" data-p="${v}">${{high:'🔴 High',medium:'🟡 Med',low:'🔵 Low',none:'— None'}[v]}</div>`).join('')}
      </div>
      <input type="hidden" data-f="priority" value="${p}" />
    </div>
    <div class="form-row"><label class="form-label">Reminder</label>
      <input class="form-input" data-f="reminder" type="time" value="${g.reminder||''}" /></div>
    <div class="form-row"><label class="form-label">Notes</label>
      <textarea class="form-input" data-f="notes" rows="2">${(g.notes||'').replace(/</g,'&lt;')}</textarea></div>
    <div class="form-actions">
      <button class="btn-save" data-saveid="${g.id}">Save changes</button>
      <button class="btn-cancel" data-cancelid="${g.id}">Cancel</button>
    </div>
  </div>`;
}

function getFormData(scope,tf){
  const f=k=>scope.querySelector(`[data-f="${k}"]`);
  const name=(f('name')?.value||'').trim();if(!name)return null;
  const type=f('type')?.value||'binary';
  const isScheduled=tf==='scheduled';
  return{
    name,type,
    goal:type==='count'?Math.max(1,parseInt(f('goal')?.value)||1):undefined,
    freq:isScheduled?1:Math.max(1,parseInt(f('freq')?.value)||1),
    period:isScheduled?'day':(f('period')?.value||'day'),
    scheduledDate:isScheduled?(f('scheduledDate')?.value||todayKey()):undefined,
    priority:f('priority')?.value||'none',
    reminder:f('reminder')?.value||'',
    notes:f('notes')?.value.trim()||'',
  };
}

// ── Add modal ─────────────────────────────────────────────────────────
function openAddModal(){
  const tf=TF[activeTab],isScheduled=activeTab==='scheduled';
  document.getElementById('modal-title').textContent=`Add ${tf.label} goal`;
  document.getElementById('modal-body').innerHTML=`
    <div class="form-row"><label class="form-label">Goal name</label>
      <input class="form-input" data-f="name" placeholder="e.g. Exercise" /></div>
    <div class="form-row-2">
      <div><label class="form-label">Type</label>
        <select class="form-input" data-f="type">
          <option value="binary">Done / not done</option>
          <option value="count">Count / quantity</option>
        </select></div>
      <div><label class="form-label">Target amount</label>
        <input class="form-input" data-f="goal" type="number" min="1" value="1" /></div>
    </div>
    ${isScheduled?`<div class="form-row"><label class="form-label">Scheduled date</label>
      <input class="form-input" data-f="scheduledDate" type="date" value="${todayKey()}" /></div>`:
    `<div class="form-row-2">
      <div><label class="form-label">Frequency</label><input class="form-input" data-f="freq" type="number" min="1" value="1" /></div>
      <div><label class="form-label">Per period</label><select class="form-input" data-f="period">${periodOptions('day',activeTab)}</select></div>
    </div>`}
    <div class="form-row"><label class="form-label">Priority</label>
      <div class="pri-selector">
        ${['high','medium','low','none'].map(v=>`<div class="pri-opt${v==='none'?' selected':''}" data-p="${v}">${{high:'🔴 High',medium:'🟡 Med',low:'🔵 Low',none:'— None'}[v]}</div>`).join('')}
      </div>
      <input type="hidden" data-f="priority" value="none" />
    </div>
    <div class="form-row"><label class="form-label">Reminder (optional)</label>
      <input class="form-input" data-f="reminder" type="time" /></div>
    <div class="form-row"><label class="form-label">Notes (optional)</label>
      <textarea class="form-input" data-f="notes" rows="2" placeholder="Any notes…"></textarea></div>
    <div class="form-actions">
      <button class="btn-save" id="modal-save">Add goal</button>
      <button class="btn-cancel" id="modal-cancel">Cancel</button>
    </div>`;
  // Wire priority selector in modal
  wirePriSelector(document.getElementById('modal-body'));
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(){document.getElementById('modal-overlay').classList.remove('open');}

function wirePriSelector(scope){
  scope.querySelectorAll('.pri-opt').forEach(btn=>{
    btn.addEventListener('click',()=>{
      scope.querySelectorAll('.pri-opt').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
      scope.querySelector('[data-f="priority"]').value=btn.dataset.p;
    });
  });
}

// ── Calendar / grid / chart ───────────────────────────────────────────
function renderCalendar(){
  const el=document.getElementById('cal-grid'),lbl=document.getElementById('cal-month-label');
  if(!el||!lbl)return;
  const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+calOffset);
  const year=base.getFullYear(),month=base.getMonth();
  lbl.textContent=base.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const startDow=(new Date(year,month,1).getDay()+6)%7,daysIn=new Date(year,month+1,0).getDate();
  const daily=state.goals.filter(g=>g.period==='day'&&!g.completedOn),tk=todayKey();
  const dows=['M','T','W','T','F','S','S'];
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<startDow;i++)html+=`<div></div>`;
  for(let d=1;d<=daysIn;d++){
    const dt=new Date(year,month,d),k=iso(dt),future=dt>new Date(new Date().setHours(23,59,59));
    let grade='';
    if(!future&&daily.length){const done=daily.filter(g=>valOn(g,k)>=targetPer(g)).length;const r=done/daily.length;grade=r>=1?'g4':r>=0.6?'g3':r>=0.3?'g2':r>0?'g1':'';}
    html+=`<div class="cal-day ${grade} ${k===tk?'today':''} ${future?'future':''}">${d}</div>`;
  }
  el.innerHTML=html;
}

function renderWeekGrid(){
  const el=document.getElementById('week-grid');if(!el)return;
  const goals=state.goals.filter(g=>(g.period==='day'||g.period==='week')&&!g.completedOn);
  const days=[6,5,4,3,2,1,0];
  let html=`<div class="wg-row"><div></div>${days.map(d=>{const dt=new Date(Date.now()-d*DAY);return`<div style="text-align:center;font-size:9px;color:var(--text3);">${dt.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</div>`;}).join('')}</div>`;
  if(!goals.length){el.innerHTML=`<div style="font-size:12px;color:var(--text3);padding:8px 0;">No daily/weekly goals.</div>`;return;}
  goals.forEach(g=>{
    const cells=days.map(d=>{const k=dayKeyFor(d);let done,partial;if(g.period==='day'){done=valOn(g,k)>=targetPer(g);partial=!done&&valOn(g,k)>0;}else{done=periodDone(g,d);partial=!done&&periodProgress(g,d).val>0;}return`<div class="wg-cell ${done?'done':partial?'partial':''}">${done?'✓':partial?'·':''}</div>`;}).join('');
    html+=`<div class="wg-row"><div class="wg-label" title="${g.name}">${g.name}</div>${cells}</div>`;
  });
  el.innerHTML=html;
}

function renderChart(){
  const el=document.getElementById('trend-chart');if(!el)return;
  const goals=state.goals.filter(g=>(g.period==='day'||g.period==='week')&&!g.completedOn);
  const isDark=(document.documentElement.getAttribute('data-theme')||'dark')==='dark';
  const labels=[],data=[];
  for(let d=6;d>=0;d--){
    const dt=new Date(Date.now()-d*DAY);labels.push(dt.toLocaleDateString(undefined,{weekday:'short'}));
    const done=goals.filter(g=>g.period==='day'?valOn(g,dayKeyFor(d))>=targetPer(g):periodDone(g,d)).length;
    data.push(goals.length?Math.round(100*done/goals.length):0);
  }
  if(trendChart)trendChart.destroy();
  const gc=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)',tc=isDark?'#5a5a70':'#9898aa';
  trendChart=new Chart(el,{type:'line',data:{labels,datasets:[{label:'%',data,borderColor:'#7c6dfa',backgroundColor:'rgba(124,109,250,0.1)',fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:'#7c6dfa',borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%',stepSize:25,color:tc,font:{size:11}},grid:{color:gc}},x:{grid:{display:false},ticks:{color:tc,font:{size:11}}}}}});
}

// ══════════════════════════════════════════════════════════════════════
// SUMMARY VIEW
// ══════════════════════════════════════════════════════════════════════
function renderSummaryView(){
  const el=document.getElementById('main-area');
  el.innerHTML=`
    <div class="summary-section">
      <div class="sum-header"><span class="sum-title">By date</span><span class="sum-sub" id="sum-date-sub"></span></div>
      <div class="date-nav">
        <button class="date-nav-btn" id="sum-prev">‹</button>
        <span class="date-nav-label" id="sum-date-label"></span>
        <button class="date-nav-btn" id="sum-next">›</button>
        <button class="date-nav-today" id="sum-today">Today</button>
      </div>
      <div id="sum-date-goals"></div>
    </div>
    <div class="section-sep"></div>
    <div class="summary-section">
      <div class="sum-header">
        <span class="sum-title">Monthly heatmap</span>
        <div class="cal-nav">
          <button class="cal-nav-btn" id="sum-cal-prev">‹</button>
          <span class="cal-month-label" id="sum-cal-label"></span>
          <button class="cal-nav-btn" id="sum-cal-next">›</button>
        </div>
      </div>
      <div class="cal-grid" id="sum-cal-grid"></div>
    </div>
    <div class="section-sep"></div>
    <div id="tf-summary-blocks"></div>`;
  renderDateSummary();renderSumCalendar();renderTFBlocks();
  document.getElementById('sum-prev').addEventListener('click',()=>setSelectedDate(addDays(selectedDate,-1)));
  document.getElementById('sum-next').addEventListener('click',()=>{if(selectedDate<todayKey())setSelectedDate(addDays(selectedDate,1));});
  document.getElementById('sum-today').addEventListener('click',()=>setSelectedDate(todayKey()));
  document.getElementById('sum-cal-prev').addEventListener('click',()=>{sumCalOffset--;renderSumCalendar();});
  document.getElementById('sum-cal-next').addEventListener('click',()=>{if(sumCalOffset<0){sumCalOffset++;renderSumCalendar();}});
}

function setSelectedDate(d){selectedDate=d;renderDateSummary();renderSumCalendar();}

function renderDateSummary(){
  const lbl=document.getElementById('sum-date-label'),sub=document.getElementById('sum-date-sub'),cont=document.getElementById('sum-date-goals');
  if(!lbl||!cont)return;
  const diff=Math.round((new Date(todayKey())-new Date(selectedDate))/DAY);
  lbl.textContent=diff===0?'Today':diff===1?'Yesterday':fmtDate(selectedDate);
  sub.textContent=selectedDate;
  const relevant=[];
  state.goals.filter(g=>g.period==='day'&&!g.completedOn).forEach(g=>{relevant.push({g,val:valOn(g,selectedDate),target:targetPer(g),type:'daily'});});
  state.goals.filter(g=>g.tf==='scheduled'&&(g.scheduledDate||todayKey())===selectedDate&&!g.completedOn).forEach(g=>{relevant.push({g,val:valOn(g,selectedDate),target:targetPer(g),type:'scheduled'});});
  const weekKey=periodKeyForDt('week',new Date(selectedDate+'T12:00:00'));
  state.goals.filter(g=>g.period==='week'&&!g.completedOn).forEach(g=>{const val=valOn(g,weekKey),target=g.freq>1?g.freq:targetPer(g);relevant.push({g,val,target,type:'weekly',note:`Week of ${weekKey.slice(1)}`});});
  if(!relevant.length){cont.innerHTML=`<div class="sum-empty">No goals for this date.</div>`;return;}
  const doneCount=relevant.filter(r=>r.val>=r.target).length,pctO=Math.round(100*doneCount/relevant.length);
  cont.innerHTML=`<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:10px;">
    <div style="flex:1;"><div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Completion</div><div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:${pctO>=100?'var(--green)':'var(--text)'};">${pctO}%</div></div>
    <div style="text-align:right;"><div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Done</div><div style="font-size:18px;font-weight:600;color:var(--green);">${doneCount}/${relevant.length}</div></div>
  </div>`+relevant.map(({g,val,target,type,note})=>{
    const done=val>=target,pct=Math.min(100,Math.round(100*val/target));
    const color=done?'var(--green)':type==='scheduled'?'var(--pink)':'var(--accent)';
    const priInfo=PRIORITY[g.priority]||PRIORITY.none;
    return`<div class="sum-goal-row">
      <div class="sum-goal-inner">
        <div class="sum-goal-dot" style="background:${color};"></div>
        ${g.priority&&g.priority!=='none'?`<span style="font-size:11px;">${priInfo.label.split(' ')[0]}</span>`:''}
        <span class="sum-goal-name">${g.name}</span>
        <span class="sum-goal-val" style="color:${color};">${val}/${target}</span>
        ${done?`<span style="font-size:11px;color:var(--green);">✓</span>`:''}
      </div>
      ${note?`<div style="font-size:10px;color:var(--text3);padding-left:16px;margin-top:2px;">${note}</div>`:''}
      <div class="sum-goal-bar"><div class="sum-goal-fill" style="width:${pct}%;background:${color};"></div></div>
    </div>`;
  }).join('');
}

function renderSumCalendar(){
  const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+sumCalOffset);
  const year=base.getFullYear(),month=base.getMonth();
  const lbl=document.getElementById('sum-cal-label');if(lbl)lbl.textContent=base.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const startDow=(new Date(year,month,1).getDay()+6)%7,daysIn=new Date(year,month+1,0).getDate();
  const daily=state.goals.filter(g=>g.period==='day'&&!g.completedOn),tk=todayKey();
  const dows=['M','T','W','T','F','S','S'];
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<startDow;i++)html+=`<div></div>`;
  for(let d=1;d<=daysIn;d++){
    const dt=new Date(year,month,d),k=iso(dt),future=dt>new Date(new Date().setHours(23,59,59));
    let grade='';
    if(!future&&daily.length){const done=daily.filter(g=>valOn(g,k)>=targetPer(g)).length;const r=done/daily.length;grade=r>=1?'g4':r>=0.6?'g3':r>=0.3?'g2':r>0?'g1':'';}
    html+=`<div class="cal-day ${grade} ${k===tk?'today':''} ${future?'future':''}${k===selectedDate?' selected':''}" data-caldate="${k}">${d}</div>`;
  }
  const grid=document.getElementById('sum-cal-grid');if(grid)grid.innerHTML=html;
}

function renderTFBlocks(){
  const cont=document.getElementById('tf-summary-blocks');if(!cont)return;
  const blocks=[
    {label:'Daily goals',tfs:['daily'],icon:'☀️'},
    {label:'Scheduled goals',tfs:['scheduled'],icon:'📌'},
    {label:'Weekly goals',tfs:['weekly'],icon:'📅'},
    {label:'Monthly goals',tfs:['monthly'],icon:'🗓'},
    {label:'Yearly goals',tfs:['yearly','5year','10year'],icon:'📆'},
    {label:'Life goals',tfs:['life'],icon:'♾️'},
  ];
  cont.innerHTML=blocks.map(({label,tfs,icon})=>{
    const goals=state.goals.filter(g=>tfs.includes(g.tf)&&!g.completedOn);if(!goals.length)return'';
    const results=goals.map(g=>{
      let val,target,done;
      if(g.tf==='scheduled'){const k=g.scheduledDate||todayKey();val=valOn(g,k);target=targetPer(g);done=val>=target;}
      else if(g.period==='lifetime'){val=valOn(g,'LIFETIME');target=targetPer(g);done=val>=target;}
      else{const r=periodProgress(g,0);val=r.val;target=r.target;done=periodDone(g,0);}
      return{g,val,target,done,pct:Math.min(100,Math.round(100*val/target)),s:streak(g)};
    });
    const doneCount=results.filter(r=>r.done).length,pct=Math.round(100*doneCount/results.length);
    const color=pct>=100?'var(--green)':pct>=60?'var(--accent)':'var(--amber)';
    return`<div class="tf-sum-block">
      <div class="tf-sum-header"><span class="tf-sum-title">${icon} ${label}</span><span class="tf-sum-pct" style="color:${color};">${pct}%</span></div>
      <div class="tf-sum-bar"><div class="tf-sum-fill" style="width:${pct}%;background:${color};"></div></div>
      ${results.map(({g,val,target,done,pct:p,s})=>{
        const c=done?'var(--green)':g.tf==='scheduled'?'var(--pink)':'var(--accent)';
        const pri=PRIORITY[g.priority]||PRIORITY.none;
        const priIcon=g.priority&&g.priority!=='none'?pri.label.split(' ')[0]:'';
        const freqLabel=g.tf==='scheduled'?`📅 ${fmtDate(g.scheduledDate||todayKey())}`:g.period==='lifetime'?'lifetime':g.freq>1?`${g.freq}×/${g.period}`:g.type==='count'?`${target}/${g.period}`:`/${g.period}`;
        return`<div style="margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
            <div style="width:6px;height:6px;border-radius:50%;background:${c};flex-shrink:0;"></div>
            ${priIcon?`<span style="font-size:11px;">${priIcon}</span>`:''}
            <span style="flex:1;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${g.name}</span>
            <span style="font-size:11px;color:var(--text3);">${freqLabel}</span>
            <span style="font-family:'Syne',sans-serif;font-size:13px;font-weight:600;color:${c};">${val}/${target}</span>
            ${s>0&&g.tf!=='scheduled'?`<span style="font-size:10px;color:var(--amber);">🔥${s}</span>`:''}
          </div>
          <div class="sum-goal-bar"><div class="sum-goal-fill" style="width:${p}%;background:${c};"></div></div>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

// ── PDF Export ─────────────────────────────────────────────────────────
function openPdfModal(){
  const today=todayKey(),weekAgo=dayKeyFor(6);
  // Get all unique scheduled dates for the date selector
  const scheduledDates=[...new Set(state.goals.filter(g=>g.tf==='scheduled').map(g=>g.scheduledDate||today))].sort();
  document.getElementById('pdf-body').innerHTML=`
    <div style="margin-bottom:14px;">
      <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;margin-bottom:10px;">Select goal types</div>
      <div class="pdf-option"><input type="checkbox" id="pdf-daily" checked /><label for="pdf-daily">Daily goals</label></div>
      <div id="date-range-wrap" class="date-range">
        <div><label>From</label><input type="date" id="pdf-from" value="${weekAgo}" max="${today}"/></div>
        <div><label>To</label><input type="date" id="pdf-to" value="${today}" max="${today}"/></div>
      </div>
      <div class="pdf-option"><input type="checkbox" id="pdf-scheduled" checked /><label for="pdf-scheduled">Scheduled goals</label></div>
      <div id="sched-date-wrap" style="padding:10px;background:var(--bg4);border-radius:10px;margin-bottom:8px;">
        <div style="font-size:11px;color:var(--text2);margin-bottom:8px;">Select scheduled date(s) to include:</div>
        ${scheduledDates.length?scheduledDates.map(d=>`
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;color:var(--text);">
            <input type="checkbox" class="sched-date-chk" value="${d}" checked style="accent-color:var(--accent);" />
            ${fmtDate(d)} <span style="font-size:11px;color:var(--text3);">(${state.goals.filter(g=>g.tf==='scheduled'&&(g.scheduledDate||today)===d).length} goals)</span>
          </label>`).join(''):
          '<div style="font-size:12px;color:var(--text3);">No scheduled goals yet.</div>'}
      </div>
      <div class="pdf-option"><input type="checkbox" id="pdf-weekly" checked /><label for="pdf-weekly">Weekly goals</label></div>
      <div class="pdf-option"><input type="checkbox" id="pdf-monthly" /><label for="pdf-monthly">Monthly goals</label></div>
      <div class="pdf-option"><input type="checkbox" id="pdf-yearly" checked /><label for="pdf-yearly">Yearly goals</label></div>
      <div class="pdf-option"><input type="checkbox" id="pdf-life" checked /><label for="pdf-life">Life goals</label></div>
      <div class="pdf-option"><input type="checkbox" id="pdf-completed" /><label for="pdf-completed">Completed goals</label></div>
      <div class="pdf-option"><input type="checkbox" id="pdf-all" /><label for="pdf-all">All goals</label></div>
    </div>
    <div class="form-actions">
      <button class="btn-save" id="pdf-generate">📄 Generate PDF</button>
      <button class="btn-cancel" id="pdf-cancel">Cancel</button>
    </div>`;
  document.getElementById('pdf-daily').addEventListener('change',e=>{document.getElementById('date-range-wrap').style.display=e.target.checked?'grid':'none';});
  document.getElementById('pdf-scheduled').addEventListener('change',e=>{document.getElementById('sched-date-wrap').style.display=e.target.checked?'block':'none';});
  document.getElementById('pdf-all').addEventListener('change',e=>{
    ['pdf-daily','pdf-scheduled','pdf-weekly','pdf-monthly','pdf-yearly','pdf-life','pdf-completed'].forEach(id=>document.getElementById(id).checked=e.target.checked);
    document.querySelectorAll('.sched-date-chk').forEach(c=>c.checked=e.target.checked);
    document.getElementById('date-range-wrap').style.display=e.target.checked?'grid':'none';
    document.getElementById('sched-date-wrap').style.display=e.target.checked?'block':'none';
  });
  document.getElementById('pdf-overlay').classList.add('open');
}
function closePdfModal(){document.getElementById('pdf-overlay').classList.remove('open');}

function generatePDF(){
  const{jsPDF}=window.jspdf;if(!jsPDF){toast('PDF library not loaded');return;}
  const today=todayKey();
  const allG=document.getElementById('pdf-all').checked;
  const incl={
    daily:allG||document.getElementById('pdf-daily').checked,
    scheduled:allG||document.getElementById('pdf-scheduled').checked,
    weekly:allG||document.getElementById('pdf-weekly').checked,
    monthly:allG||document.getElementById('pdf-monthly').checked,
    yearly:allG||document.getElementById('pdf-yearly').checked,
    life:allG||document.getElementById('pdf-life').checked,
    completed:allG||document.getElementById('pdf-completed').checked,
  };
  const fromDate=document.getElementById('pdf-from').value,toDate=document.getElementById('pdf-to').value;
  const selectedSchedDates=allG?null:[...document.querySelectorAll('.sched-date-chk:checked')].map(c=>c.value);

  const doc=new jsPDF({unit:'mm',format:'a4'});
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
  let y=20;const margin=18,col=W-margin*2;
  function checkPage(n=10){if(y+n>H-20){doc.addPage();y=20;}}
  doc.setFillColor(10,10,15);doc.rect(0,0,W,18,'F');
  doc.setTextColor(165,148,251);doc.setFontSize(16);doc.setFont('helvetica','bold');doc.text('IM-PROVE',margin,12);
  doc.setTextColor(150,150,170);doc.setFontSize(9);doc.setFont('helvetica','normal');
  doc.text('Goals Report — '+new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}),W-margin,12,{align:'right'});
  y=28;
  function sectionHeader(title,color=[92,77,232]){
    checkPage(14);doc.setFillColor(...color);doc.roundedRect(margin,y,col,9,2,2,'F');
    doc.setTextColor(255,255,255);doc.setFontSize(11);doc.setFont('helvetica','bold');doc.text(title,margin+4,y+6.2);y+=13;
  }
  function goalRow(g,showDateLog){
    checkPage(20);
    const done=periodDone(g,0);const{val,target}=periodProgress(g,0);const s=streak(g);
    const pct=Math.min(100,Math.round(100*val/target));
    const isLT=g.period==='lifetime',isSched=g.tf==='scheduled';
    const freqTxt=isSched?`Date: ${g.scheduledDate||today}`:isLT?`Lifetime: ${target}`:g.freq>1?`${g.freq}× per ${g.period}`:g.type==='count'?`${target} per ${g.period}`:`once per ${g.period}`;
    const priInfo=PRIORITY[g.priority]||PRIORITY.none;
    doc.setFillColor(245,245,250);doc.roundedRect(margin,y,col,16,2,2,'F');
    const dc=done?[34,201,142]:[124,109,250];
    doc.setFillColor(...dc);doc.circle(margin+5,y+5,2,'F');
    doc.setTextColor(10,10,15);doc.setFontSize(11);doc.setFont('helvetica','bold');doc.text(g.name.slice(0,40),margin+10,y+5.5);
    doc.setTextColor(100,100,120);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text(freqTxt,margin+10,y+10.5);
    if(g.priority&&g.priority!=='none'){doc.setTextColor(150,100,50);doc.text(priInfo.label.replace(/[🔴🟡🔵]/g,'').trim(),margin+80,y+10.5);}
    if(s>0){doc.setTextColor(200,130,0);doc.text(`streak: ${s}`,margin+110,y+5.5);}
    doc.setFillColor(220,220,230);doc.roundedRect(margin+10,y+13.5,col-20,2,1,1,'F');
    doc.setFillColor(...dc);doc.roundedRect(margin+10,y+13.5,Math.max(1,(col-20)*pct/100),2,1,1,'F');
    doc.setTextColor(...dc);doc.setFontSize(8);doc.text(`${val}/${target}${done?' ✓':''}`,W-margin-2,y+5.5,{align:'right'});
    y+=19;
    if(g.notes){checkPage(8);doc.setFillColor(235,235,245);doc.roundedRect(margin+6,y,col-6,8,1,1,'F');doc.setTextColor(80,80,100);doc.setFontSize(8);doc.text('Note: '+g.notes.slice(0,80),margin+10,y+5);y+=11;}
    if(showDateLog&&g.period==='day'&&fromDate&&toDate){
      const from=new Date(fromDate),to=new Date(toDate);const entries=[];
      for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)){const k=iso(new Date(d));entries.push({date:k,val:valOn(g,k),done:valOn(g,k)>=targetPer(g)});}
      if(entries.length){
        checkPage(10);doc.setFontSize(8);doc.setTextColor(100,100,120);doc.text(`Log (${fromDate} → ${toDate})`,margin+10,y+4);y+=7;
        entries.forEach(e=>{checkPage(7);doc.setFillColor(e.done?240:248,e.done?250:248,e.done?245:252);doc.roundedRect(margin+10,y,col-10,6,1,1,'F');doc.setTextColor(60,60,80);doc.setFontSize(8);doc.text(e.date,margin+14,y+4);doc.setTextColor(e.done?34:180,e.done?150:50,e.done?100:50);doc.text(e.done?'✓ Done':`${e.val}/${targetPer(g)}`,W-margin-4,y+4,{align:'right'});y+=8;});y+=3;
      }
    }
  }
  let hasContent=false;
  const groups=[
    {check:incl.daily,tfs:['daily'],label:'Daily Goals'},
    {check:incl.scheduled,tfs:['scheduled'],label:'Scheduled Goals',filterFn:g=>!selectedSchedDates||selectedSchedDates.includes(g.scheduledDate||today)},
    {check:incl.weekly,tfs:['weekly'],label:'Weekly Goals'},
    {check:incl.monthly,tfs:['monthly'],label:'Monthly Goals'},
    {check:incl.yearly,tfs:['yearly','5year','10year'],label:'Yearly & Multi-Year Goals'},
    {check:incl.life,tfs:['life'],label:'Life Goals'},
    {check:incl.completed,tfs:null,label:'Completed Goals',filterFn:g=>!!g.completedOn},
  ];
  groups.forEach(({check,tfs,label,filterFn})=>{
    if(!check)return;
    let gs=tfs?state.goals.filter(g=>tfs.includes(g.tf)&&!g.completedOn):state.goals;
    if(filterFn)gs=gs.filter(filterFn);
    if(!gs.length)return;
    hasContent=true;sectionHeader(label);
    gs.sort((a,b)=>(PRIORITY[a.priority]||PRIORITY.none).order-(PRIORITY[b.priority]||PRIORITY.none).order||a.order-b.order);
    gs.forEach(g=>goalRow(g,incl.daily&&g.period==='day'));y+=4;
  });
  if(!hasContent){doc.setTextColor(120,120,140);doc.setFontSize(12);doc.text('No goals selected.',W/2,H/2,{align:'center'});}
  const pc=doc.internal.getNumberOfPages();
  for(let i=1;i<=pc;i++){doc.setPage(i);doc.setFillColor(240,240,245);doc.rect(0,H-10,W,10,'F');doc.setTextColor(150,150,170);doc.setFontSize(8);doc.text('IM-PROVE — Personal Goals Tracker',margin,H-3.5);doc.text(`Page ${i} of ${pc}`,W-margin,H-3.5,{align:'right'});}
  doc.save(`improve-report-${today}.pdf`);closePdfModal();toast('PDF downloaded ✓');
}

// ── Event listeners ────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    activeView=btn.dataset.view;
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===activeView));
    editingId=null;render();
  });
});

document.getElementById('tabs').addEventListener('click',e=>{
  const b=e.target.closest('[data-tab]');if(!b)return;
  activeTab=b.dataset.tab;editingId=null;render();
});

document.getElementById('main-area').addEventListener('click',e=>{
  // Calendar date tap
  const calDay=e.target.closest('[data-caldate]');
  if(calDay&&!calDay.classList.contains('future')){setSelectedDate(calDay.dataset.caldate);return;}
  // Completed toggle
  if(e.target.closest('#completed-toggle')){completedOpen=!completedOpen;render();return;}
  // Restore completed
  const restoreBtn=e.target.closest('[data-restore]');
  if(restoreBtn){const g=state.goals.find(x=>x.id===restoreBtn.dataset.restore);if(g){g.completedOn=null;}saveState();render();toast('Goal restored ✓');return;}
  // Save edit
  const sv=e.target.closest('[data-saveid]');
  if(sv){
    const scope=sv.closest('[data-editid]');
    const g=state.goals.find(x=>x.id===sv.dataset.saveid);
    const data=getFormData(scope,g?.tf);if(!data){toast('Please enter a name');return;}
    if(g)Object.assign(g,data);
    editingId=null;saveState();render();toast('Saved ✓');return;
  }
  const can=e.target.closest('[data-cancelid]');if(can){editingId=null;render();return;}
  // Goal actions
  const btn=e.target.closest('[data-act]');if(!btn)return;
  const g=state.goals.find(x=>x.id===btn.dataset.id);if(!g)return;
  const act=btn.dataset.act;
  if(act==='edit'){editingId=g.id;render();wirePriSelector(document.querySelector(`[data-editid="${g.id}"]`)||document.getElementById('main-area'));return;}
  if(act==='note'){const b=document.getElementById(`notes-${g.id}`);if(b)b.style.display=b.style.display==='none'?'block':'none';return;}
  if(act==='del'){if(!confirm(`Delete "${g.name}"?`))return;state.goals=state.goals.filter(x=>x.id!==g.id);saveState();render();return;}
  if(act==='markdone'){g.completedOn=todayKey();saveState();render();toast(`"${g.name}" marked complete ✓`);return;}
  // Move up/down
  if(act==='moveup'||act==='movedn'){
    const ordered=getActiveOrder();
    const idx=ordered.findIndex(x=>x.id===g.id);if(idx<0)return;
    const swapIdx=act==='moveup'?idx-1:idx+1;
    if(swapIdx<0||swapIdx>=ordered.length)return;
    const tmp=ordered[idx].order;ordered[idx].order=ordered[swapIdx].order;ordered[swapIdx].order=tmp;
    saveState();render();return;
  }
  const k=getLogKey(g);
  if(act==='toggle')g.log[k]=valOn(g,k)>=1?0:1;
  else if(act==='inc')g.log[k]=valOn(g,k)+1;
  else if(act==='dec')g.log[k]=Math.max(0,valOn(g,k)-1);
  saveState();render();
});

document.getElementById('main-area').addEventListener('change',e=>{
  const ta=e.target.closest('[data-noteid]');if(!ta)return;
  const g=state.goals.find(x=>x.id===ta.dataset.noteid);if(!g)return;
  g.notes=ta.value.trim();saveState();
});

// Cal nav (goals view)
document.getElementById('main-area').addEventListener('click',e=>{
  if(e.target.id==='cal-prev'){calOffset--;renderCalendar();return;}
  if(e.target.id==='cal-next'){if(calOffset<0){calOffset++;renderCalendar();}return;}
});

document.getElementById('fab-add').addEventListener('click',openAddModal);
document.getElementById('theme-btn').addEventListener('click',toggleTheme);
document.getElementById('notif-btn').addEventListener('click',requestNotifications);
document.getElementById('export-btn').addEventListener('click',openPdfModal);

document.getElementById('modal-overlay').addEventListener('click',e=>{
  if(e.target===document.getElementById('modal-overlay')||e.target.id==='modal-cancel')closeModal();
  if(e.target.id==='modal-save'){
    const data=getFormData(document.getElementById('modal-body'),activeTab);
    if(!data){toast('Please enter a name');return;}
    const newGoal={id:'g'+Date.now(),tf:activeTab,log:{},completedOn:null,order:state.goals.filter(x=>x.tf===activeTab).length,...data};
    state.goals.push(newGoal);
    if(newGoal.tf==='daily'&&newGoal.period==='day')syncDailyToScheduled(newGoal);
    saveState();render();closeModal();toast('Goal added ✓');
  }
});

document.getElementById('pdf-overlay').addEventListener('click',e=>{
  if(e.target===document.getElementById('pdf-overlay')||e.target.id==='pdf-cancel')closePdfModal();
  if(e.target.id==='pdf-generate')generatePDF();
});

// Shift dialog
document.getElementById('shift-overlay').addEventListener('click',e=>{
  if(e.target===document.getElementById('shift-overlay')||e.target.id==='shift-close'){
    document.getElementById('shift-overlay').classList.remove('open');return;
  }
  const opt=e.target.closest('[data-shift]');if(!opt)return;
  const g=state.goals.find(x=>x.id===opt.dataset.id);if(!g)return;
  const action=opt.dataset.shift;
  if(action==='tomorrow'){
    const newDate=addDays(todayKey(),-1+1+1);// tomorrow
    if(g.tf==='scheduled'){g.scheduledDate=addDays(todayKey(),1);}
    else{// create a scheduled copy for tomorrow
      const copy={...g,id:'s'+Date.now()+Math.random(),tf:'scheduled',scheduledDate:addDays(todayKey(),1),sourceId:g.id,order:state.goals.filter(x=>x.tf==='scheduled').length,completedOn:null,log:{}};
      state.goals.push(copy);
    }
    toast('Moved to tomorrow ✓');
  }else if(action==='pick'){
    const dateInput=opt.querySelector('input[type="date"]');
    const pickedDate=dateInput?.value||addDays(todayKey(),1);
    if(g.tf==='scheduled'){g.scheduledDate=pickedDate;}
    else{const copy={...g,id:'s'+Date.now()+Math.random(),tf:'scheduled',scheduledDate:pickedDate,sourceId:g.id,order:state.goals.filter(x=>x.tf==='scheduled').length,completedOn:null,log:{}};state.goals.push(copy);}
    toast(`Moved to ${fmtDate(pickedDate)} ✓`);
  }else if(action==='skip'){toast('Dismissed');}
  // Remove this card from shift dialog
  opt.closest('.shift-card')?.remove();
  saveState();render();
  if(!document.querySelectorAll('.shift-card').length)document.getElementById('shift-overlay').classList.remove('open');
});

// Service worker + reminders
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
setInterval(checkReminders,60000);

// On load: sync daily→scheduled, check incomplete yesterday
loadTheme();
loadState();
syncAllDailyToScheduled();
saveState();
render();
// Check for incomplete goals from yesterday after a short delay
setTimeout(checkIncompleteAndShift,1500);
})();
