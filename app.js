(() => {
  'use strict';

  const KEY       = 'improve:v2';
  const THEME_KEY = 'improve:theme';
  const DAY       = 86400000;

  const TIMEFRAMES = [
    { id:'daily',   label:'Daily',   icon:'☀️'  },
    { id:'weekly',  label:'Weekly',  icon:'📅'  },
    { id:'monthly', label:'Monthly', icon:'🗓'  },
    { id:'yearly',  label:'Yearly',  icon:'📆'  },
    { id:'5year',   label:'5 Year',  icon:'🚩'  },
    { id:'10year',  label:'10 Year', icon:'🏁'  },
    { id:'life',    label:'Life',    icon:'♾️'  },
  ];
  const TF = Object.fromEntries(TIMEFRAMES.map(t => [t.id, t]));

  // ── Date helpers ─────────────────────────────────────────────────────
  const iso        = dt  => dt.toISOString().slice(0,10);
  const todayKey   = ()  => iso(new Date());
  const dayKeyFor  = d   => iso(new Date(Date.now() - d * DAY));

  function periodKeyForDt(period, dt) {
    if (period === 'day')      return iso(dt);
    if (period === 'week')     { const off = (dt.getDay()+6)%7; return 'W'+iso(new Date(dt - off*DAY)); }
    if (period === 'month')    return dt.toISOString().slice(0,7);
    if (period === 'lifetime') return 'LIFETIME';
    return dt.toISOString().slice(0,4);
  }
  const periodKey = (period, offset=0) => periodKeyForDt(period, new Date(Date.now() - offset*DAY));

  const valOn      = (g,k) => g.log[k] || 0;
  const targetPer  = g    => g.type === 'count' ? (g.goal||1) : 1;

  function periodDone(g, offset=0) {
    const k = periodKey(g.period, offset);
    if (g.period === 'lifetime') return valOn(g,k) >= targetPer(g);
    return (g.period==='day' || g.freq<=1) ? valOn(g,k) >= targetPer(g) : valOn(g,k) >= g.freq;
  }
  function periodProgress(g, offset=0) {
    const k      = periodKey(g.period, offset);
    const target = g.period==='lifetime' ? targetPer(g) :
                   (g.period==='day' || g.freq<=1) ? targetPer(g) : g.freq;
    return { val: valOn(g,k), target, key: k };
  }
  function streak(g) {
    if (g.period === 'lifetime') return periodDone(g,0) ? 1 : 0;
    let s = 0;
    if (g.period === 'day') {
      for (let d=0; d<400; d++) { if (periodDone(g,d)) s++; else { if(d===0) continue; break; } }
    } else {
      const seen=new Set(); let off=0, guard=0;
      while (guard++<2000) {
        const k=periodKey(g.period,off);
        if (!seen.has(k)) { seen.add(k); if (periodDone(g,off)) s++; else if(off!==0) break; }
        off++;
        if (g.period==='week'  && off>(s+2)*7+14)   break;
        if (g.period==='month' && off>(s+2)*31+40)   break;
        if (g.period==='year'  && off>(s+2)*366+400) break;
      }
    }
    return s;
  }

  // ── State ─────────────────────────────────────────────────────────────
  let state      = { goals:[] };
  let activeTab  = 'daily';
  let calOffset  = 0;
  let editingId  = null;
  let trendChart = null;

  function defaultState() {
    return { goals:[
      { id:'g1', tf:'daily',  name:'Drink water',      type:'count',  goal:8,  freq:1, period:'day',      reminder:'09:00', notes:'Refill bottle every morning', log:{} },
      { id:'g2', tf:'daily',  name:'Exercise',          type:'binary', freq:4,  period:'week',     reminder:'07:00', notes:'4x a week target', log:{} },
      { id:'g3', tf:'yearly', name:'Read 24 books',     type:'count',  goal:24, freq:1, period:'year',     reminder:'', notes:'2 per month', log:{} },
      { id:'g4', tf:'life',   name:'Visit 30 countries',type:'count',  goal:30, freq:1, period:'lifetime', reminder:'', notes:'Bucket list', log:{} },
    ]};
  }

  function loadState() {
    try { const s=localStorage.getItem(KEY); if(s) state=JSON.parse(s); else state=defaultState(); }
    catch { state=defaultState(); }
    // Migration: ensure all goals have required fields
    state.goals = state.goals.map(g => ({
      freq:1, period:'day', reminder:'', notes:'', log:{}, ...g
    }));
  }
  function saveState() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

  // ── Theme ─────────────────────────────────────────────────────────────
  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved, false);
  }
  function applyTheme(theme, save=true) {
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('theme-btn').textContent = theme==='dark' ? '☀️' : '🌙';
    document.getElementById('theme-meta').setAttribute('content', theme==='dark' ? '#0a0a0f' : '#f5f5f7');
    if (save) localStorage.setItem(THEME_KEY, theme);
    if (trendChart) renderChart();
  }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur==='dark' ? 'light' : 'dark');
  }

  // ── Toast ─────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg) {
    const el=document.getElementById('toast');
    el.textContent=msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>el.classList.remove('show'), 2200);
  }

  // ── Notifications ─────────────────────────────────────────────────────
  async function requestNotifications() {
    if (!('Notification' in window)) { toast('Notifications not supported'); return; }
    const p = await Notification.requestPermission();
    if (p==='granted') { toast('Reminders enabled ✓'); } else toast('Permission denied');
  }
  function checkReminders() {
    if (Notification.permission !== 'granted') return;
    const now=new Date(), hh=now.getHours(), mm=now.getMinutes();
    state.goals.forEach(g => {
      if (!g.reminder) return;
      const [rh,rm]=g.reminder.split(':').map(Number);
      if (rh===hh && Math.abs(rm-mm)<=1)
        new Notification('IM-PROVE', { body:`Time to: ${g.name}`, icon:'icons/icon-192.png' });
    });
  }

  // ── Period options helper ─────────────────────────────────────────────
  function periodOptions(selected, tf) {
    const opts = [
      { v:'day',      l:'per day'      },
      { v:'week',     l:'per week'     },
      { v:'month',    l:'per month'    },
      { v:'year',     l:'per year'     },
    ];
    if (tf === 'life') opts.push({ v:'lifetime', l:'in lifetime' });
    return opts.map(o=>`<option value="${o.v}" ${selected===o.v?'selected':''}>${o.l}</option>`).join('');
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function render() {
    renderTabs(); renderMetrics(); renderGoalList();
    renderCalendar(); renderWeekGrid(); renderChart();
  }

  function renderTabs() {
    document.getElementById('tabs').innerHTML = TIMEFRAMES.map(tf => {
      const n=state.goals.filter(g=>g.tf===tf.id).length, on=activeTab===tf.id;
      return `<button class="tab-btn ${on?'active':''}" data-tab="${tf.id}">
        ${tf.label}${n?`<span class="tab-count">${n}</span>`:''}
      </button>`;
    }).join('');
  }

  function renderMetrics() {
    const daily=state.goals.filter(g=>g.period==='day');
    const doneToday=daily.filter(g=>periodDone(g,0)).length;
    const best=state.goals.reduce((a,g)=>Math.max(a,streak(g)),0);
    const reminders=state.goals.filter(g=>g.reminder).length;
    document.getElementById('metrics').innerHTML=[
      ['Total', state.goals.length, ''],
      ['Today', `${doneToday}/${daily.length}`, 'green'],
      ['Best streak', best, 'accent'],
      ['Reminders', reminders, ''],
    ].map(([l,v,c])=>`<div class="metric-card">
      <div class="metric-label">${l}</div>
      <div class="metric-value ${c}">${v}</div>
    </div>`).join('');
  }

  function renderGoalList() {
    const goals=state.goals.filter(g=>g.tf===activeTab);
    const el=document.getElementById('goal-list');
    if (!goals.length) {
      el.innerHTML=`<div class="empty"><div class="empty-icon">🎯</div>No ${TF[activeTab].label.toLowerCase()} goals yet.<br>Tap + to add one.</div>`;
      return;
    }
    el.innerHTML=goals.map(g=>{
      if (editingId===g.id) return renderEditForm(g);
      const done=periodDone(g,0);
      const {val,target}=periodProgress(g,0);
      const s=streak(g);
      const pct=Math.min(100,Math.round(100*val/target));
      const isLifetime = g.period==='lifetime';
      const freqTxt = isLifetime ? `lifetime target: ${target}` :
                      g.freq>1 ? `${g.freq}× per ${g.period}` :
                      g.type==='count' ? `${target} per ${g.period}` : `once per ${g.period}`;
      let ctrl;
      if (g.type==='binary' && g.freq<=1) {
        ctrl=`<button class="ctrl-btn ${done?'done':''}" data-act="toggle" data-id="${g.id}">${done?'✓':'○'}</button>`;
      } else {
        ctrl=`<div class="goal-controls">
          <button class="ctrl-btn" data-act="dec" data-id="${g.id}">−</button>
          <span class="ctrl-val">${val}/${target}</span>
          <button class="ctrl-btn ${done?'done':''}" data-act="inc" data-id="${g.id}">+</button>
        </div>`;
      }
      return `<div class="goal-card ${done?'done':''}" data-gid="${g.id}">
        <div class="goal-card-header">
          <div class="goal-type-dot ${g.type==='binary'?'dot-binary':'dot-count'}"></div>
          <div class="goal-info">
            <div class="goal-name">${g.name}</div>
            <div class="goal-meta">
              <span class="badge badge-freq">${freqTxt}</span>
              ${s>0?`<span class="badge badge-streak">🔥 ${s}</span>`:''}
              ${g.reminder?`<span class="badge badge-remind">🔔 ${g.reminder}</span>`:''}
              ${done?`<span class="badge badge-done">✓ done</span>`:''}
            </div>
          </div>
          <div class="goal-controls">
            ${g.type==='binary'&&g.freq<=1?ctrl:''}
            <button class="ctrl-btn" data-act="edit" data-id="${g.id}">✎</button>
            <button class="ctrl-btn" data-act="note" data-id="${g.id}" style="color:${g.notes?'var(--blue)':''}">📝</button>
            <button class="ctrl-btn" data-act="del" data-id="${g.id}" style="color:var(--red)">✕</button>
          </div>
        </div>
        ${(g.type!=='binary'||g.freq>1)?`<div class="goal-card-header" style="margin-top:10px;gap:0;">${ctrl}</div>`:''}
        <div class="progress-bar"><div class="progress-fill ${done?'done-fill':''}" style="width:${pct}%"></div></div>
        <div class="notes-box" id="notes-${g.id}">
          <textarea rows="2" data-noteid="${g.id}" placeholder="Add a note…">${(g.notes||'').replace(/</g,'&lt;')}</textarea>
        </div>
      </div>`;
    }).join('');
  }

  function renderEditForm(g) {
    return `<div class="edit-form" data-editid="${g.id}">
      <div class="form-row"><div class="form-label">Goal name</div>
        <input class="form-input" data-f="name" value="${(g.name||'').replace(/"/g,'&quot;')}" /></div>
      <div class="form-row-2">
        <div><div class="form-label">Type</div>
          <select class="form-input" data-f="type">
            <option value="binary" ${g.type==='binary'?'selected':''}>Done / not done</option>
            <option value="count"  ${g.type==='count' ?'selected':''}>Count / quantity</option>
          </select></div>
        <div><div class="form-label">Target amount</div>
          <input class="form-input" data-f="goal" type="number" min="1" value="${g.goal||1}" /></div>
      </div>
      <div class="form-row-2">
        <div><div class="form-label">Frequency (times)</div>
          <input class="form-input" data-f="freq" type="number" min="1" value="${g.freq||1}" /></div>
        <div><div class="form-label">Per period</div>
          <select class="form-input" data-f="period">${periodOptions(g.period, g.tf)}</select></div>
      </div>
      <div class="form-row"><div class="form-label">Reminder</div>
        <input class="form-input" data-f="reminder" type="time" value="${g.reminder||''}" /></div>
      <div class="form-row"><div class="form-label">Notes</div>
        <textarea class="form-input" data-f="notes" rows="2">${(g.notes||'').replace(/</g,'&lt;')}</textarea></div>
      <div class="form-actions">
        <button class="btn-save" data-saveid="${g.id}">Save changes</button>
        <button class="btn-cancel" data-cancelid="${g.id}">Cancel</button>
      </div>
    </div>`;
  }

  function getFormData(scope, tf) {
    const f = k => scope.querySelector(`[data-f="${k}"]`);
    const name = f('name').value.trim(); if (!name) return null;
    const type = f('type').value;
    return {
      name, type,
      goal:     type==='count' ? Math.max(1,parseInt(f('goal').value)||1) : undefined,
      freq:     Math.max(1,parseInt(f('freq').value)||1),
      period:   f('period').value,
      reminder: f('reminder').value,
      notes:    f('notes').value.trim(),
    };
  }

  // ── Calendar ──────────────────────────────────────────────────────────
  function renderCalendar() {
    const base=new Date(); base.setDate(1); base.setMonth(base.getMonth()+calOffset);
    const year=base.getFullYear(), month=base.getMonth();
    document.getElementById('cal-month-label').textContent=
      base.toLocaleDateString(undefined,{month:'long',year:'numeric'});
    const startDow=(new Date(year,month,1).getDay()+6)%7;
    const daysIn=new Date(year,month+1,0).getDate();
    const daily=state.goals.filter(g=>g.period==='day');
    const tk=todayKey();
    const dows=['M','T','W','T','F','S','S'];
    let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
    for(let i=0;i<startDow;i++) html+=`<div></div>`;
    for(let d=1;d<=daysIn;d++){
      const dt=new Date(year,month,d), k=iso(dt);
      const future=dt>new Date(new Date().setHours(23,59,59));
      let grade='';
      if(!future&&daily.length){
        const done=daily.filter(g=>valOn(g,k)>=targetPer(g)).length;
        const r=done/daily.length;
        grade=r>=1?'g4':r>=0.6?'g3':r>=0.3?'g2':r>0?'g1':'';
      }
      html+=`<div class="cal-day ${grade} ${k===tk?'today':''} ${future?'future':''}">${d}</div>`;
    }
    document.getElementById('cal-grid').innerHTML=html;
  }

  // ── Week grid ──────────────────────────────────────────────────────────
  function renderWeekGrid() {
    const goals=state.goals.filter(g=>g.period==='day'||g.period==='week');
    const days=[6,5,4,3,2,1,0];
    let html=`<div class="wg-row"><div></div>${days.map(d=>{
      const dt=new Date(Date.now()-d*DAY);
      return `<div style="text-align:center;font-size:10px;color:var(--text3);">${dt.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</div>`;
    }).join('')}</div>`;
    if(!goals.length){document.getElementById('week-grid').innerHTML=`<div style="font-size:13px;color:var(--text3);padding:8px 0;">No daily/weekly goals yet.</div>`;return;}
    goals.forEach(g=>{
      const cells=days.map(d=>{
        const k=dayKeyFor(d);
        let done,partial;
        if(g.period==='day'){done=valOn(g,k)>=targetPer(g);partial=!done&&valOn(g,k)>0;}
        else{done=periodDone(g,d);partial=!done&&periodProgress(g,d).val>0;}
        return `<div class="wg-cell ${done?'done':partial?'partial':''}">${done?'✓':partial?'·':''}</div>`;
      }).join('');
      html+=`<div class="wg-row"><div class="wg-label" title="${g.name}">${g.name}</div>${cells}</div>`;
    });
    document.getElementById('week-grid').innerHTML=html;
  }

  // ── Chart ──────────────────────────────────────────────────────────────
  function renderChart() {
    const goals=state.goals.filter(g=>g.period==='day'||g.period==='week');
    const isDark=(document.documentElement.getAttribute('data-theme')||'dark')==='dark';
    const labels=[],data=[];
    for(let d=6;d>=0;d--){
      const dt=new Date(Date.now()-d*DAY);
      labels.push(dt.toLocaleDateString(undefined,{weekday:'short'}));
      const done=goals.filter(g=>g.period==='day'?valOn(g,dayKeyFor(d))>=targetPer(g):periodDone(g,d)).length;
      data.push(goals.length?Math.round(100*done/goals.length):0);
    }
    const ctx=document.getElementById('trend-chart');
    if(trendChart) trendChart.destroy();
    const gridColor=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)';
    const tickColor=isDark?'#5a5a70':'#9898aa';
    trendChart=new Chart(ctx,{
      type:'line',
      data:{labels,datasets:[{label:'%',data,borderColor:'#7c6dfa',backgroundColor:'rgba(124,109,250,0.1)',fill:true,tension:0.4,pointRadius:4,pointBackgroundColor:'#7c6dfa',borderWidth:2}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
        scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%',stepSize:25,color:tickColor,font:{size:11}},grid:{color:gridColor}},
                x:{grid:{display:false},ticks:{color:tickColor,font:{size:11}}}}}
    });
  }

  // ── Add Modal ──────────────────────────────────────────────────────────
  function openAddModal() {
    const tf=TF[activeTab];
    document.getElementById('modal-title').textContent=`Add ${tf.label} goal`;
    document.getElementById('modal-body').innerHTML=`
      <div class="form-row"><div class="form-label">Goal name</div>
        <input class="form-input" data-f="name" placeholder="e.g. Exercise" /></div>
      <div class="form-row-2">
        <div><div class="form-label">Type</div>
          <select class="form-input" data-f="type">
            <option value="binary">Done / not done</option>
            <option value="count">Count / quantity</option>
          </select></div>
        <div><div class="form-label">Target amount</div>
          <input class="form-input" data-f="goal" type="number" min="1" value="1" /></div>
      </div>
      <div class="form-row-2">
        <div><div class="form-label">Frequency (times)</div>
          <input class="form-input" data-f="freq" type="number" min="1" value="1" /></div>
        <div><div class="form-label">Per period</div>
          <select class="form-input" data-f="period">${periodOptions('day', activeTab)}</select></div>
      </div>
      <div class="form-row"><div class="form-label">Reminder (optional)</div>
        <input class="form-input" data-f="reminder" type="time" /></div>
      <div class="form-row"><div class="form-label">Notes (optional)</div>
        <textarea class="form-input" data-f="notes" rows="2" placeholder="Any notes…"></textarea></div>
      <div class="form-actions">
        <button class="btn-save" id="modal-save">Add goal</button>
        <button class="btn-cancel" id="modal-cancel">Cancel</button>
      </div>`;
    document.getElementById('modal-overlay').classList.add('open');
  }
  function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

  // ── PDF Export ─────────────────────────────────────────────────────────
  function openPdfModal() {
    const today=todayKey();
    const weekAgo=dayKeyFor(6);
    document.getElementById('pdf-body').innerHTML=`
      <div class="pdf-section">
        <div class="pdf-section-title">Select goal types to include</div>
        <div class="pdf-option">
          <input type="checkbox" id="pdf-daily" checked />
          <label for="pdf-daily">Daily goals</label>
        </div>
        <div id="date-range-wrap" class="date-range">
          <div><label>From</label><input type="date" id="pdf-from" value="${weekAgo}" max="${today}" /></div>
          <div><label>To</label><input type="date" id="pdf-to" value="${today}" max="${today}" /></div>
        </div>
        <div class="pdf-option">
          <input type="checkbox" id="pdf-weekly" checked />
          <label for="pdf-weekly">Weekly goals</label>
        </div>
        <div class="pdf-option">
          <input type="checkbox" id="pdf-monthly" />
          <label for="pdf-monthly">Monthly goals</label>
        </div>
        <div class="pdf-option">
          <input type="checkbox" id="pdf-yearly" checked />
          <label for="pdf-yearly">Yearly goals</label>
        </div>
        <div class="pdf-option">
          <input type="checkbox" id="pdf-life" checked />
          <label for="pdf-life">Life goals</label>
        </div>
        <div class="pdf-option">
          <input type="checkbox" id="pdf-all" />
          <label for="pdf-all">All goals (overrides above)</label>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn-save" id="pdf-generate">📄 Generate PDF</button>
        <button class="btn-cancel" id="pdf-cancel">Cancel</button>
      </div>`;

    // Toggle date range visibility
    document.getElementById('pdf-daily').addEventListener('change', e => {
      document.getElementById('date-range-wrap').style.display = e.target.checked ? 'grid' : 'none';
    });
    // "All goals" toggles others
    document.getElementById('pdf-all').addEventListener('change', e => {
      ['pdf-daily','pdf-weekly','pdf-monthly','pdf-yearly','pdf-life'].forEach(id => {
        document.getElementById(id).checked = e.target.checked;
      });
      document.getElementById('date-range-wrap').style.display = e.target.checked ? 'grid' : 'none';
    });

    document.getElementById('pdf-overlay').classList.add('open');
  }
  function closePdfModal() { document.getElementById('pdf-overlay').classList.remove('open'); }

  function generatePDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { toast('PDF library not loaded'); return; }

    const allGoals   = document.getElementById('pdf-all').checked;
    const inclDaily  = allGoals || document.getElementById('pdf-daily').checked;
    const inclWeekly = allGoals || document.getElementById('pdf-weekly').checked;
    const inclMonthly= allGoals || document.getElementById('pdf-monthly').checked;
    const inclYearly = allGoals || document.getElementById('pdf-yearly').checked;
    const inclLife   = allGoals || document.getElementById('pdf-life').checked;
    const fromDate   = document.getElementById('pdf-from').value;
    const toDate     = document.getElementById('pdf-to').value;

    const doc   = new jsPDF({ unit:'mm', format:'a4' });
    const W     = doc.internal.pageSize.getWidth();
    const H     = doc.internal.pageSize.getHeight();
    let   y     = 20;
    const margin= 18;
    const col   = W - margin*2;

    function checkPage(needed=10) {
      if (y + needed > H - 20) { doc.addPage(); y = 20; }
    }

    // Header
    doc.setFillColor(10,10,15);
    doc.rect(0,0,W,18,'F');
    doc.setTextColor(165,148,251);
    doc.setFontSize(16); doc.setFont('helvetica','bold');
    doc.text('IM-PROVE', margin, 12);
    doc.setTextColor(150,150,170);
    doc.setFontSize(9); doc.setFont('helvetica','normal');
    doc.text('Goals Report — '+new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'}), W-margin, 12, {align:'right'});
    y = 28;

    function sectionHeader(title, color=[92,77,232]) {
      checkPage(14);
      doc.setFillColor(...color);
      doc.roundedRect(margin, y, col, 9, 2, 2, 'F');
      doc.setTextColor(255,255,255);
      doc.setFontSize(11); doc.setFont('helvetica','bold');
      doc.text(title, margin+4, y+6.2);
      y += 13;
    }

    function goalRow(g, dateRange) {
      checkPage(20);
      const done    = periodDone(g,0);
      const {val,target} = periodProgress(g,0);
      const s       = streak(g);
      const pct     = Math.min(100, Math.round(100*val/target));
      const isLT    = g.period==='lifetime';
      const freqTxt = isLT ? `Lifetime target: ${target}` :
                      g.freq>1 ? `${g.freq}× per ${g.period}` :
                      g.type==='count' ? `${target} per ${g.period}` : `once per ${g.period}`;

      // Card bg
      doc.setFillColor(245,245,250);
      doc.roundedRect(margin, y, col, 16, 2, 2, 'F');

      // Status dot
      const dotColor = done ? [34,201,142] : [124,109,250];
      doc.setFillColor(...dotColor);
      doc.circle(margin+5, y+5, 2, 'F');

      // Goal name
      doc.setTextColor(10,10,15);
      doc.setFontSize(11); doc.setFont('helvetica','bold');
      doc.text(g.name, margin+10, y+5.5);

      // Freq badge
      doc.setTextColor(100,100,120);
      doc.setFontSize(8); doc.setFont('helvetica','normal');
      doc.text(freqTxt, margin+10, y+10.5);

      // Streak
      if (s>0) {
        doc.setTextColor(200,130,0);
        doc.text(`🔥 ${s} streak`, margin+80, y+5.5);
      }

      // Progress bar
      const barX=margin+10, barY=y+13.5, barW=col-20, barH=2;
      doc.setFillColor(220,220,230);
      doc.roundedRect(barX, barY, barW, barH, 1,1,'F');
      doc.setFillColor(...dotColor);
      doc.roundedRect(barX, barY, Math.max(1,barW*pct/100), barH, 1,1,'F');

      // Progress text
      doc.setTextColor(done?34:124, done?150:109, done?100:250);
      doc.setFontSize(8);
      doc.text(`${val}/${target}${done?' ✓':''}`, W-margin-2, y+5.5, {align:'right'});

      y += 19;

      // Notes
      if (g.notes) {
        checkPage(8);
        doc.setFillColor(235,235,245);
        doc.roundedRect(margin+6, y, col-6, 8, 1,1,'F');
        doc.setTextColor(80,80,100);
        doc.setFontSize(8);
        const lines=doc.splitTextToSize('Note: '+g.notes, col-14);
        doc.text(lines[0], margin+10, y+5);
        y += 11;
      }

      // Daily log table if date range requested
      if (dateRange && g.period==='day' && fromDate && toDate) {
        const from=new Date(fromDate), to=new Date(toDate);
        const entries=[];
        for(let d=new Date(from);d<=to;d.setDate(d.getDate()+1)){
          const k=iso(new Date(d));
          const v=valOn(g,k);
          if(v>0||true) entries.push({date:k,val:v,done:v>=targetPer(g)});
        }
        if(entries.length){
          checkPage(10);
          doc.setFontSize(8); doc.setTextColor(100,100,120);
          doc.text('Daily log ('+fromDate+' → '+toDate+')', margin+10, y+4);
          y+=7;
          entries.forEach(e=>{
            checkPage(7);
            doc.setFillColor(e.done?240:248, e.done?250:248, e.done?245:252);
            doc.roundedRect(margin+10, y, col-10, 6, 1,1,'F');
            doc.setTextColor(60,60,80);
            doc.setFontSize(8);
            doc.text(e.date, margin+14, y+4);
            doc.setTextColor(e.done?34:180, e.done?150:50, e.done?100:50);
            doc.text(e.done?'✓ Done':`${e.val}/${targetPer(g)}`, W-margin-4, y+4, {align:'right'});
            y+=8;
          });
          y+=3;
        }
      }
    }

    // Determine which TF groups to render
    const groups = [
      { check: inclDaily||inclWeekly,  tfs:['daily','weekly'],              label:'Daily & Weekly Goals' },
      { check: inclMonthly,            tfs:['monthly'],                     label:'Monthly Goals' },
      { check: inclYearly,             tfs:['yearly','5year','10year'],      label:'Yearly & Multi-Year Goals' },
      { check: inclLife,               tfs:['life'],                        label:'Life Goals' },
    ];

    let hasContent=false;
    groups.forEach(({check,tfs,label})=>{
      if(!check) return;
      // Filter to only checked individual TFs
      const goalsForGroup=state.goals.filter(g=>{
        if(g.tf==='daily'   && !inclDaily)   return false;
        if(g.tf==='weekly'  && !inclWeekly)  return false;
        if(g.tf==='monthly' && !inclMonthly) return false;
        if((g.tf==='yearly'||g.tf==='5year'||g.tf==='10year') && !inclYearly) return false;
        if(g.tf==='life'    && !inclLife)    return false;
        return tfs.includes(g.tf);
      });
      if(!goalsForGroup.length) return;
      hasContent=true;
      sectionHeader(label);
      goalsForGroup.forEach(g=>goalRow(g, inclDaily&&g.period==='day'));
      y+=4;
    });

    if(!hasContent){
      doc.setTextColor(120,120,140);
      doc.setFontSize(12);
      doc.text('No goals selected or no goals added yet.', W/2, H/2, {align:'center'});
    }

    // Footer on each page
    const pageCount=doc.internal.getNumberOfPages();
    for(let i=1;i<=pageCount;i++){
      doc.setPage(i);
      doc.setFillColor(240,240,245);
      doc.rect(0,H-10,W,10,'F');
      doc.setTextColor(150,150,170);
      doc.setFontSize(8);
      doc.text('IM-PROVE — Personal Goals Tracker', margin, H-3.5);
      doc.text(`Page ${i} of ${pageCount}`, W-margin, H-3.5, {align:'right'});
    }

    doc.save(`improve-report-${todayKey()}.pdf`);
    closePdfModal();
    toast('PDF downloaded ✓');
  }

  // ── Event listeners ────────────────────────────────────────────────────
  document.getElementById('tabs').addEventListener('click', e=>{
    const b=e.target.closest('[data-tab]'); if(!b) return;
    activeTab=b.dataset.tab; editingId=null; render();
  });

  document.getElementById('goal-list').addEventListener('click', e=>{
    const sv=e.target.closest('[data-saveid]');
    if(sv){
      const scope=sv.closest('[data-editid]');
      const data=getFormData(scope, state.goals.find(x=>x.id===sv.dataset.saveid)?.tf);
      if(!data){toast('Please enter a name');return;}
      const g=state.goals.find(x=>x.id===sv.dataset.saveid);
      if(g) Object.assign(g,data);
      editingId=null; saveState(); render(); toast('Saved ✓'); return;
    }
    const can=e.target.closest('[data-cancelid]');
    if(can){editingId=null;render();return;}
    const btn=e.target.closest('[data-act]'); if(!btn) return;
    const g=state.goals.find(x=>x.id===btn.dataset.id); if(!g) return;
    const act=btn.dataset.act;
    if(act==='edit'){editingId=g.id;render();return;}
    if(act==='note'){const b=document.getElementById(`notes-${g.id}`);if(b)b.style.display=b.style.display==='none'?'block':'none';return;}
    if(act==='del'){if(!confirm(`Delete "${g.name}"?`))return;state.goals=state.goals.filter(x=>x.id!==g.id);saveState();render();return;}
    const k=periodKey(g.period,0);
    if(act==='toggle') g.log[k]=valOn(g,k)>=1?0:1;
    else if(act==='inc') g.log[k]=valOn(g,k)+1;
    else if(act==='dec') g.log[k]=Math.max(0,valOn(g,k)-1);
    saveState(); render();
  });

  document.getElementById('goal-list').addEventListener('change', e=>{
    const ta=e.target.closest('[data-noteid]'); if(!ta) return;
    const g=state.goals.find(x=>x.id===ta.dataset.noteid); if(!g) return;
    g.notes=ta.value.trim(); saveState();
  });

  document.getElementById('fab-add').addEventListener('click', openAddModal);
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('notif-btn').addEventListener('click', requestNotifications);
  document.getElementById('export-btn').addEventListener('click', openPdfModal);

  // Add modal events
  document.getElementById('modal-overlay').addEventListener('click', e=>{
    if(e.target===document.getElementById('modal-overlay')||e.target.id==='modal-cancel') closeModal();
    if(e.target.id==='modal-save'){
      const data=getFormData(document.getElementById('modal-body'), activeTab);
      if(!data){toast('Please enter a name');return;}
      state.goals.push({id:'g'+Date.now(),tf:activeTab,log:{},...data});
      saveState();render();closeModal();toast('Goal added ✓');
    }
  });

  // PDF modal events
  document.getElementById('pdf-overlay').addEventListener('click', e=>{
    if(e.target===document.getElementById('pdf-overlay')||e.target.id==='pdf-cancel') closePdfModal();
    if(e.target.id==='pdf-generate') generatePDF();
  });

  document.getElementById('cal-prev').addEventListener('click',()=>{calOffset--;renderCalendar();});
  document.getElementById('cal-next').addEventListener('click',()=>{if(calOffset<0){calOffset++;renderCalendar();}});

  // Service worker
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  setInterval(checkReminders, 60000);

  // Init
  loadTheme();
  loadState();
  render();
})();
