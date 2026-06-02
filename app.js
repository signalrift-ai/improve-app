(() => {
  'use strict';
  const KEY       = 'improve:v2';
  const THEME_KEY = 'improve:theme';
  const DAY       = 86400000;

  const TIMEFRAMES = [
    { id:'daily',    label:'Daily',    icon:'☀️'  },
    { id:'scheduled',label:'Scheduled',icon:'📌'  },
    { id:'weekly',   label:'Weekly',   icon:'📅'  },
    { id:'monthly',  label:'Monthly',  icon:'🗓'  },
    { id:'yearly',   label:'Yearly',   icon:'📆'  },
    { id:'5year',    label:'5 Year',   icon:'🚩'  },
    { id:'10year',   label:'10 Year',  icon:'🏁'  },
    { id:'life',     label:'Life',     icon:'♾️'  },
  ];
  const TF = Object.fromEntries(TIMEFRAMES.map(t=>[t.id,t]));

  // ── Date helpers ──────────────────────────────────────────────────────
  const iso       = dt => dt.toISOString().slice(0,10);
  const todayKey  = ()  => iso(new Date());
  const dayKeyFor = d   => iso(new Date(Date.now()-d*DAY));
  const fmtDate   = k   => { if(!k)return''; const [y,m,d]=k.split('-'); const dt=new Date(+y,+m-1,+d); return dt.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}); };

  function periodKeyForDt(period,dt){
    if(period==='day')      return iso(dt);
    if(period==='week')     { const off=(dt.getDay()+6)%7; return 'W'+iso(new Date(dt-off*DAY)); }
    if(period==='month')    return dt.toISOString().slice(0,7);
    if(period==='lifetime') return 'LIFETIME';
    return dt.toISOString().slice(0,4);
  }
  const periodKey=(period,offset=0)=>periodKeyForDt(period,new Date(Date.now()-offset*DAY));

  const valOn     =(g,k)=>g.log[k]||0;
  const targetPer = g   => g.type==='count'?(g.goal||1):1;

  // For scheduled goals, logKey is the specific scheduled date
  function getLogKey(g){
    if(g.tf==='scheduled') return g.scheduledDate || todayKey();
    return periodKey(g.period,0);
  }

  function periodDone(g,offset=0){
    if(g.tf==='scheduled'){
      const k=g.scheduledDate||todayKey();
      return valOn(g,k)>=targetPer(g);
    }
    const k=periodKey(g.period,offset);
    if(g.period==='lifetime') return valOn(g,k)>=targetPer(g);
    return (g.period==='day'||g.freq<=1)?valOn(g,k)>=targetPer(g):valOn(g,k)>=g.freq;
  }
  function periodProgress(g,offset=0){
    if(g.tf==='scheduled'){
      const k=g.scheduledDate||todayKey();
      const target=targetPer(g);
      return {val:valOn(g,k),target,key:k};
    }
    const k=periodKey(g.period,offset);
    const target=g.period==='lifetime'?targetPer(g):(g.period==='day'||g.freq<=1)?targetPer(g):g.freq;
    return {val:valOn(g,k),target,key:k};
  }
  function streak(g){
    if(g.tf==='scheduled'||g.period==='lifetime') return periodDone(g,0)?1:0;
    let s=0;
    if(g.period==='day'){
      for(let d=0;d<400;d++){if(periodDone(g,d))s++;else{if(d===0)continue;break;}}
    }else{
      const seen=new Set();let off=0,guard=0;
      while(guard++<2000){
        const k=periodKey(g.period,off);
        if(!seen.has(k)){seen.add(k);if(periodDone(g,off))s++;else if(off!==0)break;}
        off++;
        if(g.period==='week'&&off>(s+2)*7+14)break;
        if(g.period==='month'&&off>(s+2)*31+40)break;
        if(g.period==='year'&&off>(s+2)*366+400)break;
      }
    }
    return s;
  }

  // ── State ─────────────────────────────────────────────────────────────
  let state      = {goals:[]};
  let activeTab  = 'daily';
  let activeView = 'goals';   // 'goals' | 'summary'
  let calOffset  = 0;
  let sumCalOffset = 0;
  let editingId  = null;
  let trendChart = null;
  let selectedDate = todayKey();

  function defaultState(){return{goals:[
    {id:'g1',tf:'daily',   name:'Drink water',       type:'count', goal:8,  freq:1,period:'day',      reminder:'09:00',notes:'Refill bottle every morning',log:{}},
    {id:'g2',tf:'daily',   name:'Exercise',           type:'binary',freq:4, period:'week',             reminder:'07:00',notes:'4x a week target',log:{}},
    {id:'g3',tf:'scheduled',name:'Doctor appointment',type:'binary',freq:1, period:'day',scheduledDate:todayKey(),reminder:'',notes:'Annual checkup',log:{}},
    {id:'g4',tf:'yearly',  name:'Read 24 books',      type:'count', goal:24,freq:1,period:'year',      reminder:'',notes:'2 per month',log:{}},
    {id:'g5',tf:'life',    name:'Visit 30 countries', type:'count', goal:30,freq:1,period:'lifetime',  reminder:'',notes:'Bucket list',log:{}},
  ]};}

  function loadState(){
    try{const s=localStorage.getItem(KEY);if(s)state=JSON.parse(s);else state=defaultState();}
    catch{state=defaultState();}
    state.goals=state.goals.map(g=>({freq:1,period:'day',reminder:'',notes:'',log:{},...g}));
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
  function toast(msg){
    const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);
  }

  // ── Notifications ─────────────────────────────────────────────────────
  async function requestNotifications(){
    if(!('Notification'in window)){toast('Not supported');return;}
    const p=await Notification.requestPermission();
    toast(p==='granted'?'Reminders enabled ✓':'Permission denied');
  }
  function checkReminders(){
    if(Notification.permission!=='granted')return;
    const now=new Date(),hh=now.getHours(),mm=now.getMinutes();
    state.goals.forEach(g=>{
      if(!g.reminder)return;
      const[rh,rm]=g.reminder.split(':').map(Number);
      if(rh===hh&&Math.abs(rm-mm)<=1)new Notification('IM-PROVE',{body:`Time to: ${g.name}`,icon:'icons/icon-192.png'});
    });
  }

  // ── Period options ────────────────────────────────────────────────────
  function periodOptions(selected,tf){
    const opts=[{v:'day',l:'per day'},{v:'week',l:'per week'},{v:'month',l:'per month'},{v:'year',l:'per year'}];
    if(tf==='life')opts.push({v:'lifetime',l:'in lifetime'});
    return opts.map(o=>`<option value="${o.v}"${selected===o.v?' selected':''}>${o.l}</option>`).join('');
  }

  // ── Scheduled goal status helpers ────────────────────────────────────
  function scheduledStatus(g){
    const tk=todayKey();
    const sd=g.scheduledDate||tk;
    if(sd>tk) return 'upcoming';
    if(sd<tk) return periodDone(g,0)?'done':'overdue';
    return periodDone(g,0)?'done':'today';
  }

  // ── Main render dispatcher ────────────────────────────────────────────
  function render(){
    renderTabs();
    if(activeView==='goals') renderGoalsView();
    else renderSummaryView();
  }

  function renderTabs(){
    const tabsEl=document.getElementById('tabs');
    tabsEl.style.display=activeView==='goals'?'flex':'none';
    tabsEl.innerHTML=TIMEFRAMES.map(tf=>{
      const n=state.goals.filter(g=>g.tf===tf.id).length,on=activeTab===tf.id;
      return `<button class="tab-btn ${on?'active':''}" data-tab="${tf.id}">${tf.label}${n?`<span class="tab-count">${n}</span>`:''}</button>`;
    }).join('');
    document.getElementById('fab-add').style.display=activeView==='goals'?'flex':'none';
  }

  // ══════════════════════════════════════════════════════════════════════
  // GOALS VIEW
  // ══════════════════════════════════════════════════════════════════════
  function renderGoalsView(){
    const el=document.getElementById('main-area');
    const goals=state.goals.filter(g=>g.tf===activeTab);

    // Sort scheduled by date
    if(activeTab==='scheduled') goals.sort((a,b)=>(a.scheduledDate||'').localeCompare(b.scheduledDate||''));

    const daily=state.goals.filter(g=>g.period==='day');
    const doneToday=daily.filter(g=>periodDone(g,0)).length;
    const best=state.goals.reduce((a,g)=>Math.max(a,streak(g)),0);
    const reminders=state.goals.filter(g=>g.reminder).length;

    let metricsHtml=`<div class="metrics">${[
      ['Total',state.goals.length,''],
      ['Today',`${doneToday}/${daily.length}`,'green'],
      ['Best streak',best,'accent'],
      ['Reminders',reminders,''],
    ].map(([l,v,c])=>`<div class="metric-card"><div class="metric-label">${l}</div><div class="metric-value ${c}">${v}</div></div>`).join('')}</div>`;

    let listHtml='';
    if(!goals.length){
      listHtml=`<div class="empty"><div class="empty-icon">🎯</div>No ${TF[activeTab].label.toLowerCase()} goals yet.<br>Tap + to add one.</div>`;
    }else{
      listHtml=goals.map(g=>{
        if(editingId===g.id)return renderEditForm(g);
        const done=periodDone(g,0);
        const {val,target}=periodProgress(g,0);
        const s=streak(g);
        const pct=Math.min(100,Math.round(100*val/target));
        const isLT=g.period==='lifetime';
        const isScheduled=g.tf==='scheduled';
        const status=isScheduled?scheduledStatus(g):null;

        const freqTxt=isScheduled?`📅 ${fmtDate(g.scheduledDate||todayKey())}`:
                      isLT?`Lifetime target: ${target}`:
                      g.freq>1?`${g.freq}× per ${g.period}`:
                      g.type==='count'?`${target} per ${g.period}`:`once per ${g.period}`;

        const statusBadge=isScheduled?(
          status==='upcoming'?`<span class="badge badge-upcoming">⏳ upcoming</span>`:
          status==='overdue'?`<span class="badge" style="background:var(--red-bg);color:var(--red)">⚠️ overdue</span>`:
          status==='done'?`<span class="badge badge-done">✓ done</span>`:
          `<span class="badge badge-date">📌 today</span>`
        ):'';

        const cardClass=isScheduled&&status==='upcoming'?'goal-card upcoming':
                        isScheduled?'goal-card scheduled':'goal-card';

        let ctrl;
        if(g.type==='binary'&&g.freq<=1){
          ctrl=`<button class="ctrl-btn ${done?'done':''}" data-act="toggle" data-id="${g.id}">${done?'✓':'○'}</button>`;
        }else{
          ctrl=`<div class="goal-controls">
            <button class="ctrl-btn" data-act="dec" data-id="${g.id}">−</button>
            <span class="ctrl-val">${val}/${target}</span>
            <button class="ctrl-btn ${done?'done':''}" data-act="inc" data-id="${g.id}">+</button>
          </div>`;
        }

        return `<div class="${cardClass} ${done&&!isScheduled?'done':''}" data-gid="${g.id}">
          <div class="goal-card-header">
            <div class="goal-type-dot ${isScheduled?'dot-scheduled':g.type==='binary'?'dot-binary':'dot-count'}"></div>
            <div class="goal-info">
              <div class="goal-name">${g.name}</div>
              <div class="goal-meta">
                <span class="badge badge-freq">${freqTxt}</span>
                ${s>0&&!isScheduled?`<span class="badge badge-streak">🔥 ${s}</span>`:''}
                ${g.reminder?`<span class="badge badge-remind">🔔 ${g.reminder}</span>`:''}
                ${statusBadge}
              </div>
            </div>
            <div class="goal-controls">
              ${g.type==='binary'&&g.freq<=1?ctrl:''}
              <button class="ctrl-btn" data-act="edit" data-id="${g.id}">✎</button>
              <button class="ctrl-btn" data-act="note" data-id="${g.id}" style="color:${g.notes?'var(--blue)':''}">📝</button>
              <button class="ctrl-btn" data-act="del"  data-id="${g.id}" style="color:var(--red)">✕</button>
            </div>
          </div>
          ${(g.type!=='binary'||g.freq>1)?`<div class="goal-card-header" style="margin-top:8px;gap:0;">${ctrl}</div>`:''}
          <div class="progress-bar"><div class="progress-fill ${done?'done-fill':''}" style="width:${pct}%"></div></div>
          <div class="notes-box" id="notes-${g.id}">
            <textarea rows="2" data-noteid="${g.id}" placeholder="Add a note…">${(g.notes||'').replace(/</g,'&lt;')}</textarea>
          </div>
        </div>`;
      }).join('');
    }

    // Calendar + week grid + chart only for non-scheduled tabs
    let lowerHtml='';
    if(activeTab!=='scheduled'){
      lowerHtml=`<div class="section-sep"></div>
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
        <div class="sum-header">
          <span class="sum-title">Last 7 days</span>
          <span class="sum-sub">daily &amp; weekly</span>
        </div>
        <div class="week-grid"><div class="wg-table" id="week-grid"></div></div>
      </div>
      <div>
        <div class="sum-header"><span class="sum-title">Completion trend</span></div>
        <div class="chart-wrap"><canvas id="trend-chart" role="img" aria-label="Completion trend"></canvas></div>
      </div>`;
    }

    el.innerHTML=metricsHtml+listHtml+lowerHtml;

    if(activeTab!=='scheduled'){
      renderCalendar();renderWeekGrid();renderChart();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY VIEW
  // ══════════════════════════════════════════════════════════════════════
  function renderSummaryView(){
    const el=document.getElementById('main-area');
    el.innerHTML=`
      <!-- Date navigator -->
      <div class="summary-section">
        <div class="sum-header">
          <span class="sum-title">By date</span>
          <span class="sum-sub" id="sum-date-sub"></span>
        </div>
        <div class="date-nav">
          <button class="date-nav-btn" id="sum-prev">‹</button>
          <span class="date-nav-label" id="sum-date-label"></span>
          <button class="date-nav-btn" id="sum-next">›</button>
          <button class="date-nav-today" id="sum-today">Today</button>
        </div>
        <div id="sum-date-goals"></div>
      </div>

      <div class="section-sep"></div>

      <!-- Calendar heatmap -->
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

      <!-- Timeframe blocks -->
      <div id="tf-summary-blocks"></div>
    `;

    renderDateSummary();
    renderSumCalendar();
    renderTFBlocks();

    // Wire date nav
    document.getElementById('sum-prev').addEventListener('click',()=>{selectedDate=dayKeyFor(1-dayOffset()+1);setSelectedDate(dayKeyFor(dayOffset()+1));});
    document.getElementById('sum-next').addEventListener('click',()=>{const d=dayOffset(); if(d>0)setSelectedDate(dayKeyFor(d-1));});
    document.getElementById('sum-today').addEventListener('click',()=>setSelectedDate(todayKey()));
    document.getElementById('sum-cal-prev').addEventListener('click',()=>{sumCalOffset--;renderSumCalendar();});
    document.getElementById('sum-cal-next').addEventListener('click',()=>{if(sumCalOffset<0){sumCalOffset++;renderSumCalendar();}});
  }

  function dayOffset(){
    const diff=new Date(todayKey())-new Date(selectedDate);
    return Math.round(diff/DAY);
  }
  function setSelectedDate(d){selectedDate=d;renderDateSummary();renderSumCalendar();}

  function renderDateSummary(){
    const label=document.getElementById('sum-date-label');
    const sub=document.getElementById('sum-date-sub');
    const container=document.getElementById('sum-date-goals');
    if(!label||!container)return;

    const offset=dayOffset();
    const displayLabel=offset===0?'Today':offset===1?'Yesterday':`${fmtDate(selectedDate)}`;
    label.textContent=displayLabel;
    sub.textContent=selectedDate;

    // Goals relevant to this date
    const relevant=[];

    // Daily goals
    state.goals.filter(g=>g.period==='day').forEach(g=>{
      const val=valOn(g,selectedDate);
      const target=targetPer(g);
      const done=val>=target;
      relevant.push({g,val,target,done,type:'daily'});
    });

    // Scheduled goals on this date
    state.goals.filter(g=>g.tf==='scheduled'&&(g.scheduledDate||todayKey())===selectedDate).forEach(g=>{
      const val=valOn(g,selectedDate);
      const target=targetPer(g);
      const done=val>=target;
      relevant.push({g,val,target,done,type:'scheduled'});
    });

    // Weekly goals — show if selected date is in current week
    const weekKey=periodKeyForDt('week',new Date(selectedDate+'T12:00:00'));
    state.goals.filter(g=>g.period==='week').forEach(g=>{
      const val=valOn(g,weekKey);
      const target=g.freq>1?g.freq:targetPer(g);
      const done=val>=target;
      relevant.push({g,val,target,done,type:'weekly',note:`Week of ${weekKey.slice(1)}`});
    });

    if(!relevant.length){
      container.innerHTML=`<div class="sum-empty">No goals for this date.</div>`;
      return;
    }

    const doneCount=relevant.filter(r=>r.done).length;
    const pctOverall=Math.round(100*doneCount/relevant.length);

    container.innerHTML=`
      <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:10px;">
        <div style="flex:1;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Completion</div>
          <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:700;color:${pctOverall>=100?'var(--green)':'var(--text)'};">${pctOverall}%</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px;color:var(--text3);margin-bottom:2px;">Done</div>
          <div style="font-size:18px;font-weight:600;color:var(--green);">${doneCount}/${relevant.length}</div>
        </div>
      </div>
      ${relevant.map(({g,val,target,done,type,note})=>{
        const pct=Math.min(100,Math.round(100*val/target));
        const color=done?'var(--green)':type==='scheduled'?'var(--pink)':'var(--accent)';
        return `<div class="sum-goal-row" style="flex-direction:column;align-items:stretch;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="sum-goal-dot" style="background:${color};"></div>
            <span class="sum-goal-name">${g.name}</span>
            <span class="sum-goal-val" style="color:${color};">${val}/${target}</span>
            ${done?`<span style="font-size:11px;color:var(--green);">✓</span>`:''}
          </div>
          ${note?`<div style="font-size:10px;color:var(--text3);padding-left:16px;margin-top:2px;">${note}</div>`:''}
          <div class="sum-goal-bar" style="margin-top:6px;"><div class="sum-goal-fill" style="width:${pct}%;background:${color};"></div></div>
        </div>`;
      }).join('')}
    `;
  }

  function renderSumCalendar(){
    const base=new Date(); base.setDate(1); base.setMonth(base.getMonth()+sumCalOffset);
    const year=base.getFullYear(),month=base.getMonth();
    const label=document.getElementById('sum-cal-label');
    if(label)label.textContent=base.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const startDow=(new Date(year,month,1).getDay()+6)%7;
    const daysIn=new Date(year,month+1,0).getDate();
    const daily=state.goals.filter(g=>g.period==='day');
    const tk=todayKey();
    const dows=['M','T','W','T','F','S','S'];
    let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    for(let i=0;i<startDow;i++)html+=`<div></div>`;
    for(let d=1;d<=daysIn;d++){
      const dt=new Date(year,month,d),k=iso(dt);
      const future=dt>new Date(new Date().setHours(23,59,59));
      let grade='';
      if(!future&&daily.length){
        const done=daily.filter(g=>valOn(g,k)>=targetPer(g)).length;
        const r=done/daily.length;
        grade=r>=1?'g4':r>=0.6?'g3':r>=0.3?'g2':r>0?'g1':'';
      }
      const sel=k===selectedDate?' selected':'';
      html+=`<div class="cal-day ${grade} ${k===tk?'today':''} ${future?'future':''}${sel}" data-caldate="${k}">${d}</div>`;
    }
    const grid=document.getElementById('sum-cal-grid');
    if(grid)grid.innerHTML=html;
  }

  function renderTFBlocks(){
    const container=document.getElementById('tf-summary-blocks');
    if(!container)return;

    const blocks=[
      {label:'Daily goals',     tfs:['daily'],                    period:'day',   icon:'☀️'},
      {label:'Scheduled goals', tfs:['scheduled'],                period:null,    icon:'📌'},
      {label:'Weekly goals',    tfs:['weekly'],                   period:'week',  icon:'📅'},
      {label:'Monthly goals',   tfs:['monthly'],                  period:'month', icon:'🗓'},
      {label:'Yearly goals',    tfs:['yearly','5year','10year'],   period:'year',  icon:'📆'},
      {label:'Life goals',      tfs:['life'],                     period:null,    icon:'♾️'},
    ];

    container.innerHTML=blocks.map(({label,tfs,period,icon})=>{
      const goals=state.goals.filter(g=>tfs.includes(g.tf));
      if(!goals.length)return'';

      const results=goals.map(g=>{
        let val,target,done;
        if(g.tf==='scheduled'){
          const k=g.scheduledDate||todayKey();
          val=valOn(g,k);target=targetPer(g);done=val>=target;
        }else if(g.period==='lifetime'){
          const k='LIFETIME';val=valOn(g,k);target=targetPer(g);done=val>=target;
        }else{
          const r=periodProgress(g,0);val=r.val;target=r.target;done=periodDone(g,0);
        }
        const pct=Math.min(100,Math.round(100*val/target));
        const s=streak(g);
        return{g,val,target,done,pct,s};
      });

      const doneCount=results.filter(r=>r.done).length;
      const pct=Math.round(100*doneCount/results.length);
      const color=pct>=100?'var(--green)':pct>=60?'var(--accent)':'var(--amber)';

      return `<div class="tf-sum-block">
        <div class="tf-sum-header">
          <span class="tf-sum-title">${icon} ${label}</span>
          <span class="tf-sum-pct" style="color:${color};">${pct}%</span>
        </div>
        <div class="tf-sum-bar"><div class="tf-sum-fill" style="width:${pct}%;background:${color};"></div></div>
        ${results.map(({g,val,target,done,pct:p,s})=>{
          const c=done?'var(--green)':g.tf==='scheduled'?'var(--pink)':'var(--accent)';
          const freqLabel=g.tf==='scheduled'?`📅 ${fmtDate(g.scheduledDate||todayKey())}`:
                          g.period==='lifetime'?`lifetime`:
                          g.freq>1?`${g.freq}×/${g.period}`:
                          g.type==='count'?`${target}/${g.period}`:`/${g.period}`;
          return`<div style="margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <div style="width:6px;height:6px;border-radius:50%;background:${c};flex-shrink:0;"></div>
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

  // ── Goals view calendar / grid / chart ────────────────────────────────
  function renderCalendar(){
    const el=document.getElementById('cal-grid');
    const lbl=document.getElementById('cal-month-label');
    if(!el||!lbl)return;
    const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+calOffset);
    const year=base.getFullYear(),month=base.getMonth();
    lbl.textContent=base.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const startDow=(new Date(year,month,1).getDay()+6)%7;
    const daysIn=new Date(year,month+1,0).getDate();
    const daily=state.goals.filter(g=>g.period==='day');
    const tk=todayKey();
    const dows=['M','T','W','T','F','S','S'];
    let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    for(let i=0;i<startDow;i++)html+=`<div></div>`;
    for(let d=1;d<=daysIn;d++){
      const dt=new Date(year,month,d),k=iso(dt);
      const future=dt>new Date(new Date().setHours(23,59,59));
      let grade='';
      if(!future&&daily.length){const done=daily.filter(g=>valOn(g,k)>=targetPer(g)).length;const r=done/daily.length;grade=r>=1?'g4':r>=0.6?'g3':r>=0.3?'g2':r>0?'g1':'';}
      html+=`<div class="cal-day ${grade} ${k===tk?'today':''} ${future?'future':''}">${d}</div>`;
    }
    el.innerHTML=html;
  }

  function renderWeekGrid(){
    const el=document.getElementById('week-grid');if(!el)return;
    const goals=state.goals.filter(g=>g.period==='day'||g.period==='week');
    const days=[6,5,4,3,2,1,0];
    let html=`<div class="wg-row"><div></div>${days.map(d=>{const dt=new Date(Date.now()-d*DAY);return`<div style="text-align:center;font-size:9px;color:var(--text3);">${dt.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</div>`;}).join('')}</div>`;
    if(!goals.length){el.innerHTML=`<div style="font-size:12px;color:var(--text3);padding:8px 0;">No daily/weekly goals.</div>`;return;}
    goals.forEach(g=>{
      const cells=days.map(d=>{
        const k=dayKeyFor(d);
        let done,partial;
        if(g.period==='day'){done=valOn(g,k)>=targetPer(g);partial=!done&&valOn(g,k)>0;}
        else{done=periodDone(g,d);partial=!done&&periodProgress(g,d).val>0;}
        return`<div class="wg-cell ${done?'done':partial?'partial':''}">${done?'✓':partial?'·':''}</div>`;
      }).join('');
      html+=`<div class="wg-row"><div class="wg-label" title="${g.name}">${g.name}</div>${cells}</div>`;
    });
    el.innerHTML=html;
  }

  function renderChart(){
    const el=document.getElementById('trend-chart');if(!el)return;
    const goals=state.goals.filter(g=>g.period==='day'||g.period==='week');
    const isDark=(document.documentElement.getAttribute('data-theme')||'dark')==='dark';
    const labels=[],data=[];
    for(let d=6;d>=0;d--){
      const dt=new Date(Date.now()-d*DAY);
      labels.push(dt.toLocaleDateString(undefined,{weekday:'short'}));
      const done=goals.filter(g=>g.period==='day'?valOn(g,dayKeyFor(d))>=targetPer(g):periodDone(g,d)).length;
      data.push(goals.length?Math.round(100*done/goals.length):0);
    }
    if(trendChart)trendChart.destroy();
    const gc=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)';
    const tc=isDark?'#5a5a70':'#9898aa';
    trendChart=new Chart(el,{type:'line',data:{labels,datasets:[{label:'%',data,borderColor:'#7c6dfa',backgroundColor:'rgba(124,109,250,0.1)',fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:'#7c6dfa',borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%',stepSize:25,color:tc,font:{size:11}},grid:{color:gc}},x:{grid:{display:false},ticks:{color:tc,font:{size:11}}}}}});
  }

  // ── Edit form ─────────────────────────────────────────────────────────
  function renderEditForm(g){
    const isScheduled=g.tf==='scheduled';
    return`<div class="edit-form" data-editid="${g.id}">
      <div class="form-row"><label class="form-label">Goal name</label>
        <input class="form-input" data-f="name" value="${(g.name||'').replace(/"/g,'&quot;')}" /></div>
      <div class="form-row-2">
        <div><label class="form-label">Type</label>
          <select class="form-input" data-f="type">
            <option value="binary"${g.type==='binary'?' selected':''}>Done / not done</option>
            <option value="count" ${g.type==='count' ?' selected':''}>Count / quantity</option>
          </select></div>
        <div><label class="form-label">Target amount</label>
          <input class="form-input" data-f="goal" type="number" min="1" value="${g.goal||1}" /></div>
      </div>
      ${isScheduled?`
        <div class="form-row"><label class="form-label">Scheduled date</label>
          <input class="form-input" data-f="scheduledDate" type="date" value="${g.scheduledDate||todayKey()}" /></div>
      `:`
        <div class="form-row-2">
          <div><label class="form-label">Frequency (times)</label>
            <input class="form-input" data-f="freq" type="number" min="1" value="${g.freq||1}" /></div>
          <div><label class="form-label">Per period</label>
            <select class="form-input" data-f="period">${periodOptions(g.period,g.tf)}</select></div>
        </div>
      `}
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
      reminder:f('reminder')?.value||'',
      notes:f('notes')?.value.trim()||'',
    };
  }

  // ── Add modal ─────────────────────────────────────────────────────────
  function openAddModal(){
    const tf=TF[activeTab];
    const isScheduled=activeTab==='scheduled';
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
      ${isScheduled?`
        <div class="form-row"><label class="form-label">Scheduled date</label>
          <input class="form-input" data-f="scheduledDate" type="date" value="${todayKey()}" /></div>
      `:`
        <div class="form-row-2">
          <div><label class="form-label">Frequency (times)</label>
            <input class="form-input" data-f="freq" type="number" min="1" value="1" /></div>
          <div><label class="form-label">Per period</label>
            <select class="form-input" data-f="period">${periodOptions('day',activeTab)}</select></div>
        </div>
      `}
      <div class="form-row"><label class="form-label">Reminder (optional)</label>
        <input class="form-input" data-f="reminder" type="time" /></div>
      <div class="form-row"><label class="form-label">Notes (optional)</label>
        <textarea class="form-input" data-f="notes" rows="2" placeholder="Any notes…"></textarea></div>
      <div class="form-actions">
        <button class="btn-save" id="modal-save">Add goal</button>
        <button class="btn-cancel" id="modal-cancel">Cancel</button>
      </div>`;
    document.getElementById('modal-overlay').classList.add('open');
  }
  function closeModal(){document.getElementById('modal-overlay').classList.remove('open');}

  // ── PDF Export ─────────────────────────────────────────────────────────
  function openPdfModal(){
    const today=todayKey(),weekAgo=dayKeyFor(6);
    document.getElementById('pdf-body').innerHTML=`
      <div style="margin-bottom:14px;">
        <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;font-weight:500;margin-bottom:10px;">Select goal types</div>
        <div class="pdf-option"><input type="checkbox" id="pdf-daily" checked /><label for="pdf-daily">Daily goals</label></div>
        <div id="date-range-wrap" class="date-range">
          <div><label>From</label><input type="date" id="pdf-from" value="${weekAgo}" max="${today}" /></div>
          <div><label>To</label><input type="date" id="pdf-to" value="${today}" max="${today}" /></div>
        </div>
        <div class="pdf-option"><input type="checkbox" id="pdf-scheduled" checked /><label for="pdf-scheduled">Scheduled goals</label></div>
        <div class="pdf-option"><input type="checkbox" id="pdf-weekly" checked /><label for="pdf-weekly">Weekly goals</label></div>
        <div class="pdf-option"><input type="checkbox" id="pdf-monthly" /><label for="pdf-monthly">Monthly goals</label></div>
        <div class="pdf-option"><input type="checkbox" id="pdf-yearly" checked /><label for="pdf-yearly">Yearly goals</label></div>
        <div class="pdf-option"><input type="checkbox" id="pdf-life" checked /><label for="pdf-life">Life goals</label></div>
        <div class="pdf-option"><input type="checkbox" id="pdf-all" /><label for="pdf-all">All goals</label></div>
      </div>
      <div class="form-actions">
        <button class="btn-save" id="pdf-generate">📄 Generate PDF</button>
        <button class="btn-cancel" id="pdf-cancel">Cancel</button>
      </div>`;
    document.getElementById('pdf-daily').addEventListener('change',e=>{
      document.getElementById('date-range-wrap').style.display=e.target.checked?'grid':'none';
    });
    document.getElementById('pdf-all').addEventListener('change',e=>{
      ['pdf-daily','pdf-scheduled','pdf-weekly','pdf-monthly','pdf-yearly','pdf-life'].forEach(id=>{
        document.getElementById(id).checked=e.target.checked;
      });
      document.getElementById('date-range-wrap').style.display=e.target.checked?'grid':'none';
    });
    document.getElementById('pdf-overlay').classList.add('open');
  }
  function closePdfModal(){document.getElementById('pdf-overlay').classList.remove('open');}

  function generatePDF(){
    const{jsPDF}=window.jspdf;
    if(!jsPDF){toast('PDF library not loaded');return;}
    const allG=document.getElementById('pdf-all').checked;
    const incl={
      daily:    allG||document.getElementById('pdf-daily').checked,
      scheduled:allG||document.getElementById('pdf-scheduled').checked,
      weekly:   allG||document.getElementById('pdf-weekly').checked,
      monthly:  allG||document.getElementById('pdf-monthly').checked,
      yearly:   allG||document.getElementById('pdf-yearly').checked,
      life:     allG||document.getElementById('pdf-life').checked,
    };
    const fromDate=document.getElementById('pdf-from').value;
    const toDate=document.getElementById('pdf-to').value;
    const doc=new jsPDF({unit:'mm',format:'a4'});
    const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
    let y=20;const margin=18,col=W-margin*2;
    function checkPage(n=10){if(y+n>H-20){doc.addPage();y=20;}}
    doc.setFillColor(10,10,15);doc.rect(0,0,W,18,'F');
    doc.setTextColor(165,148,251);doc.setFontSize(16);doc.setFont('helvetica','bold');
    doc.text('IM-PROVE',margin,12);
    doc.setTextColor(150,150,170);doc.setFontSize(9);doc.setFont('helvetica','normal');
    doc.text('Goals Report — '+new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}),W-margin,12,{align:'right'});
    y=28;
    function sectionHeader(title){
      checkPage(14);
      doc.setFillColor(92,77,232);doc.roundedRect(margin,y,col,9,2,2,'F');
      doc.setTextColor(255,255,255);doc.setFontSize(11);doc.setFont('helvetica','bold');
      doc.text(title,margin+4,y+6.2);y+=13;
    }
    function goalRow(g,showDateLog){
      checkPage(20);
      const done=periodDone(g,0);
      const{val,target}=periodProgress(g,0);
      const s=streak(g);
      const pct=Math.min(100,Math.round(100*val/target));
      const isLT=g.period==='lifetime',isSched=g.tf==='scheduled';
      const freqTxt=isSched?`Date: ${g.scheduledDate||todayKey()}`:
                    isLT?`Lifetime target: ${target}`:
                    g.freq>1?`${g.freq}× per ${g.period}`:
                    g.type==='count'?`${target} per ${g.period}`:`once per ${g.period}`;
      doc.setFillColor(245,245,250);doc.roundedRect(margin,y,col,16,2,2,'F');
      const dc=done?[34,201,142]:[124,109,250];
      doc.setFillColor(...dc);doc.circle(margin+5,y+5,2,'F');
      doc.setTextColor(10,10,15);doc.setFontSize(11);doc.setFont('helvetica','bold');
      doc.text(g.name,margin+10,y+5.5);
      doc.setTextColor(100,100,120);doc.setFontSize(8);doc.setFont('helvetica','normal');
      doc.text(freqTxt,margin+10,y+10.5);
      if(s>0){doc.setTextColor(200,130,0);doc.text(`🔥 ${s}`,margin+80,y+5.5);}
      doc.setFillColor(220,220,230);doc.roundedRect(margin+10,y+13.5,col-20,2,1,1,'F');
      doc.setFillColor(...dc);doc.roundedRect(margin+10,y+13.5,Math.max(1,(col-20)*pct/100),2,1,1,'F');
      doc.setTextColor(...dc);doc.setFontSize(8);
      doc.text(`${val}/${target}${done?' ✓':''}`,W-margin-2,y+5.5,{align:'right'});
      y+=19;
      if(g.notes){checkPage(8);doc.setFillColor(235,235,245);doc.roundedRect(margin+6,y,col-6,8,1,1,'F');doc.setTextColor(80,80,100);doc.setFontSize(8);doc.text('Note: '+g.notes.slice(0,80),margin+10,y+5);y+=11;}
      if(showDateLog&&g.period==='day'&&fromDate&&toDate){
        const from=new Date(fromDate),to=new Date(toDate);
        const entries=[];
        for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)){
          const k=iso(new Date(d));entries.push({date:k,val:valOn(g,k),done:valOn(g,k)>=targetPer(g)});
        }
        if(entries.length){
          checkPage(10);doc.setFontSize(8);doc.setTextColor(100,100,120);
          doc.text(`Daily log (${fromDate} → ${toDate})`,margin+10,y+4);y+=7;
          entries.forEach(e=>{
            checkPage(7);
            doc.setFillColor(e.done?240:248,e.done?250:248,e.done?245:252);
            doc.roundedRect(margin+10,y,col-10,6,1,1,'F');
            doc.setTextColor(60,60,80);doc.setFontSize(8);doc.text(e.date,margin+14,y+4);
            doc.setTextColor(e.done?34:180,e.done?150:50,e.done?100:50);
            doc.text(e.done?'✓ Done':`${e.val}/${targetPer(g)}`,W-margin-4,y+4,{align:'right'});
            y+=8;
          });y+=3;
        }
      }
    }
    const groups=[
      {check:incl.daily,    tfs:['daily'],              label:'Daily Goals'},
      {check:incl.scheduled,tfs:['scheduled'],           label:'Scheduled Goals'},
      {check:incl.weekly,   tfs:['weekly'],              label:'Weekly Goals'},
      {check:incl.monthly,  tfs:['monthly'],             label:'Monthly Goals'},
      {check:incl.yearly,   tfs:['yearly','5year','10year'],label:'Yearly & Multi-Year Goals'},
      {check:incl.life,     tfs:['life'],                label:'Life Goals'},
    ];
    let hasContent=false;
    groups.forEach(({check,tfs,label})=>{
      if(!check)return;
      const gs=state.goals.filter(g=>tfs.includes(g.tf));
      if(!gs.length)return;
      hasContent=true;sectionHeader(label);
      gs.forEach(g=>goalRow(g,incl.daily&&g.period==='day'));y+=4;
    });
    if(!hasContent){doc.setTextColor(120,120,140);doc.setFontSize(12);doc.text('No goals selected.',W/2,H/2,{align:'center'});}
    const pc=doc.internal.getNumberOfPages();
    for(let i=1;i<=pc;i++){doc.setPage(i);doc.setFillColor(240,240,245);doc.rect(0,H-10,W,10,'F');doc.setTextColor(150,150,170);doc.setFontSize(8);doc.text('IM-PROVE — Personal Goals Tracker',margin,H-3.5);doc.text(`Page ${i} of ${pc}`,W-margin,H-3.5,{align:'right'});}
    doc.save(`improve-report-${todayKey()}.pdf`);
    closePdfModal();toast('PDF downloaded ✓');
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
    // Calendar date click in summary
    const calDay=e.target.closest('[data-caldate]');
    if(calDay&&!calDay.classList.contains('future')){
      setSelectedDate(calDay.dataset.caldate);return;
    }
    const sv=e.target.closest('[data-saveid]');
    if(sv){
      const scope=sv.closest('[data-editid]');
      const g=state.goals.find(x=>x.id===sv.dataset.saveid);
      const data=getFormData(scope,g?.tf);
      if(!data){toast('Please enter a name');return;}
      if(g)Object.assign(g,data);
      editingId=null;saveState();render();toast('Saved ✓');return;
    }
    const can=e.target.closest('[data-cancelid]');
    if(can){editingId=null;render();return;}
    const btn=e.target.closest('[data-act]');if(!btn)return;
    const g=state.goals.find(x=>x.id===btn.dataset.id);if(!g)return;
    const act=btn.dataset.act;
    if(act==='edit'){editingId=g.id;render();return;}
    if(act==='note'){const b=document.getElementById(`notes-${g.id}`);if(b)b.style.display=b.style.display==='none'?'block':'none';return;}
    if(act==='del'){if(!confirm(`Delete "${g.name}"?`))return;state.goals=state.goals.filter(x=>x.id!==g.id);saveState();render();return;}
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

  // Cal nav in goals view (delegated)
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
      state.goals.push({id:'g'+Date.now(),tf:activeTab,log:{},...data});
      saveState();render();closeModal();toast('Goal added ✓');
    }
  });

  document.getElementById('pdf-overlay').addEventListener('click',e=>{
    if(e.target===document.getElementById('pdf-overlay')||e.target.id==='pdf-cancel')closePdfModal();
    if(e.target.id==='pdf-generate')generatePDF();
  });

  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  setInterval(checkReminders,60000);

  loadTheme();
  loadState();
  render();
})();
