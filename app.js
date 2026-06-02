(() => {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────
  const KEY = 'improve:v2';
  const DAY = 86400000;
  const TIMEFRAMES = [
    { id: 'daily',   label: 'Daily',   icon: '☀️' },
    { id: 'weekly',  label: 'Weekly',  icon: '📅' },
    { id: 'monthly', label: 'Monthly', icon: '🗓' },
    { id: 'yearly',  label: 'Yearly',  icon: '📆' },
    { id: '5year',   label: '5 Year',  icon: '🚩' },
    { id: '10year',  label: '10 Year', icon: '🏁' },
    { id: 'life',    label: 'Life',    icon: '♾️' },
  ];
  const TF = Object.fromEntries(TIMEFRAMES.map(t => [t.id, t]));

  // ── Helpers ────────────────────────────────────────────────────────────
  const iso = dt => dt.toISOString().slice(0, 10);
  const todayKey = () => iso(new Date());
  const dayKeyFor = d => iso(new Date(Date.now() - d * DAY));

  function periodKeyForDt(period, dt) {
    if (period === 'day')   return iso(dt);
    if (period === 'week')  { const off = (dt.getDay() + 6) % 7; return 'W' + iso(new Date(dt - off * DAY)); }
    if (period === 'month') return dt.toISOString().slice(0, 7);
    return dt.toISOString().slice(0, 4);
  }
  const periodKey = (period, offset = 0) => periodKeyForDt(period, new Date(Date.now() - offset * DAY));

  const valOn = (g, k) => g.log[k] || 0;
  const targetPer = g => g.type === 'count' ? (g.goal || 1) : 1;

  function periodDone(g, offset = 0) {
    const k = periodKey(g.period, offset);
    return (g.period === 'day' || g.freq <= 1)
      ? valOn(g, k) >= targetPer(g)
      : valOn(g, k) >= g.freq;
  }
  function periodProgress(g, offset = 0) {
    const k = periodKey(g.period, offset);
    const target = (g.period === 'day' || g.freq <= 1) ? targetPer(g) : g.freq;
    return { val: valOn(g, k), target };
  }
  function streak(g) {
    let s = 0;
    if (g.period === 'day') {
      for (let d = 0; d < 400; d++) { if (periodDone(g, d)) s++; else { if (d === 0) continue; break; } }
    } else {
      const seen = new Set(); let off = 0, guard = 0;
      while (guard++ < 2000) {
        const k = periodKey(g.period, off);
        if (!seen.has(k)) { seen.add(k); if (periodDone(g, off)) s++; else if (off !== 0) break; }
        off++;
        if (g.period === 'week'  && off > (s + 2) * 7  + 14) break;
        if (g.period === 'month' && off > (s + 2) * 31 + 40) break;
        if (g.period === 'year'  && off > (s + 2) * 366 + 400) break;
      }
    }
    return s;
  }

  // ── State ──────────────────────────────────────────────────────────────
  let state = { goals: [] };
  let activeTab = 'daily';
  let calOffset = 0;
  let editingId = null;
  let trendChart = null;

  function defaultState() {
    return { goals: [
      { id: 'g1', tf: 'daily',  name: 'Drink water', type: 'count', goal: 8, freq: 1, period: 'day',  reminder: '09:00', notes: 'Refill bottle every morning', log: {} },
      { id: 'g2', tf: 'daily',  name: 'Exercise',    type: 'binary', freq: 4, period: 'week', reminder: '07:00', notes: '4x a week target', log: {} },
      { id: 'g3', tf: 'yearly', name: 'Read 24 books', type: 'count', goal: 24, freq: 1, period: 'year', reminder: '', notes: '2 per month', log: {} },
      { id: 'g4', tf: 'life',   name: 'Visit 30 countries', type: 'count', goal: 30, freq: 1, period: 'year', reminder: '', notes: 'Bucket list', log: {} },
    ]};
  }

  function loadState() {
    try { const s = localStorage.getItem(KEY); if (s) state = JSON.parse(s); else state = defaultState(); }
    catch { state = defaultState(); }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
  }

  // ── Toast ──────────────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ── Notifications ──────────────────────────────────────────────────────
  async function requestNotifications() {
    if (!('Notification' in window)) { toast('Notifications not supported'); return; }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') { toast('Reminders enabled ✓'); scheduleReminders(); }
    else toast('Permission denied');
  }
  function scheduleReminders() {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    const now = new Date(), hh = now.getHours(), mm = now.getMinutes();
    state.goals.forEach(g => {
      if (!g.reminder) return;
      const [rh, rm] = g.reminder.split(':').map(Number);
      if (rh === hh && Math.abs(rm - mm) <= 1) {
        new Notification('IM-PROVE Reminder', { body: `Time to: ${g.name}`, icon: 'icons/icon-192.png' });
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function render() {
    renderTabs();
    renderMetrics();
    renderGoalList();
    renderCalendar();
    renderWeekGrid();
    renderChart();
  }

  function renderTabs() {
    const el = document.getElementById('tabs');
    el.innerHTML = TIMEFRAMES.map(tf => {
      const n = state.goals.filter(g => g.tf === tf.id).length;
      const on = activeTab === tf.id;
      return `<button class="tab-btn ${on ? 'active' : ''}" data-tab="${tf.id}">
        ${tf.label}${n ? `<span class="tab-count">${n}</span>` : ''}
      </button>`;
    }).join('');
  }

  function renderMetrics() {
    const daily = state.goals.filter(g => g.period === 'day');
    const doneToday = daily.filter(g => periodDone(g, 0)).length;
    const best = state.goals.reduce((a, g) => Math.max(a, streak(g)), 0);
    const reminders = state.goals.filter(g => g.reminder).length;
    document.getElementById('metrics').innerHTML = [
      ['Total', state.goals.length, ''],
      ['Today', `${doneToday}/${daily.length}`, 'green'],
      ['Best streak', best, 'accent'],
      ['Reminders', reminders, ''],
    ].map(([l, v, cls]) => `<div class="metric-card">
      <div class="metric-label">${l}</div>
      <div class="metric-value ${cls}">${v}</div>
    </div>`).join('');
  }

  function renderGoalList() {
    const goals = state.goals.filter(g => g.tf === activeTab);
    const el = document.getElementById('goal-list');
    if (!goals.length) {
      el.innerHTML = `<div class="empty"><div class="empty-icon">🎯</div>No ${TF[activeTab].label.toLowerCase()} goals yet.<br>Tap + to add one.</div>`;
      return;
    }
    el.innerHTML = goals.map(g => {
      if (editingId === g.id) return renderEditForm(g);
      const done = periodDone(g, 0);
      const { val, target } = periodProgress(g, 0);
      const s = streak(g);
      const pct = Math.min(100, Math.round(100 * val / target));
      const freqTxt = g.freq > 1 ? `${g.freq}× per ${g.period}` : (g.type === 'count' ? `${target}/${g.period}` : `once/${g.period}`);

      let ctrl;
      if (g.type === 'binary' && g.freq <= 1) {
        ctrl = `<button class="ctrl-btn ${done ? 'done' : ''}" data-act="toggle" data-id="${g.id}" aria-label="Toggle">
          ${done ? '✓' : '○'}
        </button>`;
      } else {
        ctrl = `<div class="goal-controls">
          <button class="ctrl-btn" data-act="dec" data-id="${g.id}" aria-label="Decrease">−</button>
          <span class="ctrl-val">${val}/${target}</span>
          <button class="ctrl-btn ${done ? 'done' : ''}" data-act="inc" data-id="${g.id}" aria-label="Increase">+</button>
        </div>`;
      }

      return `<div class="goal-card ${done ? 'done' : ''}" data-gid="${g.id}">
        <div class="goal-card-header">
          <div class="goal-type-dot ${g.type === 'binary' ? 'dot-binary' : 'dot-count'}"></div>
          <div class="goal-info">
            <div class="goal-name">${g.name}</div>
            <div class="goal-meta">
              <span class="badge badge-freq">${freqTxt}</span>
              ${s > 0 ? `<span class="badge badge-streak">🔥 ${s}</span>` : ''}
              ${g.reminder ? `<span class="badge badge-remind">🔔 ${g.reminder}</span>` : ''}
              ${done ? `<span class="badge badge-done">✓ done</span>` : ''}
            </div>
          </div>
          <div class="goal-controls">
            ${g.type === 'binary' && g.freq <= 1 ? ctrl : ''}
            <button class="ctrl-btn" data-act="edit" data-id="${g.id}" aria-label="Edit">✎</button>
            <button class="ctrl-btn" data-act="note" data-id="${g.id}" aria-label="Notes" style="color:${g.notes ? '#4a9eff' : ''}">📝</button>
            <button class="ctrl-btn" data-act="del" data-id="${g.id}" aria-label="Delete" style="color:var(--red)">✕</button>
          </div>
        </div>
        ${g.type !== 'binary' || g.freq > 1 ? `<div class="goal-card-header" style="margin-top:10px;gap:0;">${ctrl}</div>` : ''}
        <div class="progress-bar"><div class="progress-fill ${done ? 'done-fill' : ''}" style="width:${pct}%"></div></div>
        <div class="notes-box" id="notes-${g.id}">
          <textarea rows="2" data-noteid="${g.id}" placeholder="Add a note…">${(g.notes || '').replace(/</g, '&lt;')}</textarea>
        </div>
      </div>`;
    }).join('');

    if (g => g.type !== 'binary') {} // no-op
  }

  function renderEditForm(g) {
    return `<div class="edit-form" data-editid="${g.id}">
      <div class="form-row">
        <div class="form-label">Goal name</div>
        <input class="form-input" data-f="name" value="${(g.name || '').replace(/"/g, '&quot;')}" placeholder="Goal name" />
      </div>
      <div class="form-row-2">
        <div>
          <div class="form-label">Type</div>
          <select class="form-input" data-f="type">
            <option value="binary" ${g.type === 'binary' ? 'selected' : ''}>Done / not done</option>
            <option value="count"  ${g.type === 'count'  ? 'selected' : ''}>Count / quantity</option>
          </select>
        </div>
        <div>
          <div class="form-label">Target amount</div>
          <input class="form-input" data-f="goal" type="number" min="1" value="${g.goal || 1}" />
        </div>
      </div>
      <div class="form-row-2">
        <div>
          <div class="form-label">Frequency (times)</div>
          <input class="form-input" data-f="freq" type="number" min="1" value="${g.freq || 1}" />
        </div>
        <div>
          <div class="form-label">Per period</div>
          <select class="form-input" data-f="period">
            ${['day','week','month','year'].map(p => `<option value="${p}" ${g.period === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-label">Reminder time</div>
        <input class="form-input" data-f="reminder" type="time" value="${g.reminder || ''}" />
      </div>
      <div class="form-row">
        <div class="form-label">Notes</div>
        <textarea class="form-input" data-f="notes" rows="2">${(g.notes || '').replace(/</g, '&lt;')}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn-save" data-saveid="${g.id}">Save changes</button>
        <button class="btn-cancel" data-cancelid="${g.id}">Cancel</button>
      </div>
    </div>`;
  }

  function getFormData(scope) {
    const f = k => scope.querySelector(`[data-f="${k}"]`);
    const name = f('name').value.trim(); if (!name) return null;
    const type = f('type').value;
    return {
      name, type,
      goal: type === 'count' ? Math.max(1, parseInt(f('goal').value) || 1) : undefined,
      freq: Math.max(1, parseInt(f('freq').value) || 1),
      period: f('period').value,
      reminder: f('reminder').value,
      notes: f('notes').value.trim(),
    };
  }

  function renderCalendar() {
    const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calOffset);
    const year = base.getFullYear(), month = base.getMonth();
    document.getElementById('cal-month-label').textContent =
      base.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const startDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysIn = new Date(year, month + 1, 0).getDate();
    const dailyGoals = state.goals.filter(g => g.period === 'day');
    const tk = todayKey();

    const dows = ['M','T','W','T','F','S','S'];
    let html = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < startDow; i++) html += `<div></div>`;
    for (let d = 1; d <= daysIn; d++) {
      const dt = new Date(year, month, d);
      const k = iso(dt);
      const future = dt > new Date(new Date().setHours(23,59,59));
      let grade = 'g0';
      if (!future && dailyGoals.length) {
        const done = dailyGoals.filter(g => valOn(g, k) >= targetPer(g)).length;
        const r = done / dailyGoals.length;
        grade = r >= 1 ? 'g4' : r >= 0.6 ? 'g3' : r >= 0.3 ? 'g2' : r > 0 ? 'g1' : 'g0';
      }
      html += `<div class="cal-day ${grade} ${k === tk ? 'today' : ''} ${future ? 'future' : ''}">${d}</div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
  }

  function renderWeekGrid() {
    const goals = state.goals.filter(g => g.period === 'day' || g.period === 'week');
    const days = [6,5,4,3,2,1,0];
    let html = `<div class="wg-row"><div></div>${days.map(d => {
      const dt = new Date(Date.now() - d * DAY);
      return `<div style="text-align:center;font-size:10px;color:var(--text3);">${dt.toLocaleDateString(undefined,{weekday:'short'}).slice(0,2)}</div>`;
    }).join('')}</div>`;
    if (!goals.length) { document.getElementById('week-grid').innerHTML = `<div style="font-size:13px;color:var(--text3);padding:8px 0;">No daily/weekly goals yet.</div>`; return; }
    goals.forEach(g => {
      const cells = days.map(d => {
        let done, partial;
        const k = dayKeyFor(d);
        if (g.period === 'day') { done = valOn(g,k) >= targetPer(g); partial = !done && valOn(g,k) > 0; }
        else { done = periodDone(g, d); partial = !done && periodProgress(g, d).val > 0; }
        return `<div class="wg-cell ${done ? 'done' : partial ? 'partial' : ''}">${done ? '✓' : partial ? '·' : ''}</div>`;
      }).join('');
      html += `<div class="wg-row"><div class="wg-label" title="${g.name}">${g.name}</div>${cells}</div>`;
    });
    document.getElementById('week-grid').innerHTML = html;
  }

  function renderChart() {
    const goals = state.goals.filter(g => g.period === 'day' || g.period === 'week');
    const labels = [], data = [];
    for (let d = 6; d >= 0; d--) {
      const dt = new Date(Date.now() - d * DAY);
      labels.push(dt.toLocaleDateString(undefined, { weekday: 'short' }));
      const done = goals.filter(g => {
        if (g.period === 'day') return valOn(g, dayKeyFor(d)) >= targetPer(g);
        return periodDone(g, d);
      }).length;
      data.push(goals.length ? Math.round(100 * done / goals.length) : 0);
    }
    const ctx = document.getElementById('trend-chart');
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ label: '%', data, borderColor: '#7c6dfa', backgroundColor: 'rgba(124,109,250,0.12)', fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#7c6dfa', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { min:0, max:100, ticks: { callback: v => v+'%', stepSize: 25, color:'#5a5a70', font:{size:11} }, grid: { color:'rgba(255,255,255,0.05)' } },
          x: { grid: { display: false }, ticks: { color:'#5a5a70', font:{size:11} } } } }
    });
  }

  // ── Add Modal ──────────────────────────────────────────────────────────
  function openAddModal() {
    const tf = TF[activeTab];
    document.getElementById('modal-title').textContent = `Add ${tf.label} goal`;
    document.getElementById('modal-body').innerHTML = `
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
          <select class="form-input" data-f="period">
            ${['day','week','month','year'].map(p => `<option value="${p}" ${p === (tf.id === 'daily' ? 'day' : tf.id === 'weekly' ? 'week' : tf.id === 'monthly' ? 'month' : 'year') ? 'selected' : ''}>${p}</option>`).join('')}
          </select></div>
      </div>
      <div class="form-row"><div class="form-label">Reminder time (optional)</div>
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

  // ── Export ─────────────────────────────────────────────────────────────
  function exportSummary() {
    const now = new Date();
    let out = `IM-PROVE — Goals Summary\n${now.toLocaleString()}\n${'='.repeat(44)}\n\n`;
    const daily = state.goals.filter(g => g.period === 'day');
    out += `Total goals: ${state.goals.length}\n`;
    out += `Daily goals done today: ${daily.filter(g => periodDone(g,0)).length}/${daily.length}\n`;
    out += `Best streak: ${state.goals.reduce((a,g) => Math.max(a,streak(g)),0)}\n\n`;
    TIMEFRAMES.forEach(tf => {
      const gs = state.goals.filter(g => g.tf === tf.id);
      if (!gs.length) return;
      out += `${tf.label.toUpperCase()} GOALS\n${'─'.repeat(30)}\n`;
      gs.forEach(g => {
        const { val, target } = periodProgress(g, 0);
        const s = streak(g);
        const freqTxt = g.freq > 1 ? `${g.freq}× per ${g.period}` : (g.type === 'count' ? `${target} per ${g.period}` : `once per ${g.period}`);
        out += `• ${g.name}\n`;
        out += `    Target:  ${freqTxt}\n`;
        out += `    Progress: ${val}/${target}${periodDone(g,0) ? ' ✓' : ''}\n`;
        out += `    Streak:  ${s} ${g.period}(s)\n`;
        if (g.reminder) out += `    Reminder: ${g.reminder}\n`;
        if (g.notes)    out += `    Notes:    ${g.notes}\n`;
        out += '\n';
      });
    });
    out += `${'='.repeat(44)}\nGenerated by IM-PROVE`;
    const blob = new Blob([out], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `improve-${todayKey()}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Summary exported ✓');
  }

  // ── Event Delegation ───────────────────────────────────────────────────
  document.getElementById('tabs').addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]'); if (!btn) return;
    activeTab = btn.dataset.tab; editingId = null; render();
  });

  document.getElementById('goal-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const { act, id } = btn.dataset;
      const g = state.goals.find(x => x.id === id); if (!g) return;
      if (act === 'edit') { editingId = g.id; render(); return; }
      if (act === 'note') { const b = document.getElementById(`notes-${g.id}`); if (b) b.style.display = b.style.display === 'none' ? 'block' : 'none'; return; }
      if (act === 'del') { if (!confirm(`Delete "${g.name}"?`)) return; state.goals = state.goals.filter(x => x.id !== g.id); saveState(); render(); return; }
      const k = periodKey(g.period, 0);
      if (act === 'toggle') g.log[k] = valOn(g,k) >= 1 ? 0 : 1;
      else if (act === 'inc') g.log[k] = valOn(g,k) + 1;
      else if (act === 'dec') g.log[k] = Math.max(0, valOn(g,k) - 1);
      saveState(); render(); return;
    }
    const saveBtn = e.target.closest('[data-saveid]');
    if (saveBtn) {
      const scope = saveBtn.closest('[data-editid]');
      const data = getFormData(scope); if (!data) { toast('Please enter a name'); return; }
      const g = state.goals.find(x => x.id === saveBtn.dataset.saveid);
      if (g) Object.assign(g, data);
      editingId = null; saveState(); render(); toast('Saved ✓'); return;
    }
    const cancelBtn = e.target.closest('[data-cancelid]');
    if (cancelBtn) { editingId = null; render(); }
  });

  document.getElementById('goal-list').addEventListener('change', e => {
    const ta = e.target.closest('[data-noteid]'); if (!ta) return;
    const g = state.goals.find(x => x.id === ta.dataset.noteid); if (!g) return;
    g.notes = ta.value.trim(); saveState();
  });

  document.getElementById('fab-add').addEventListener('click', openAddModal);
  document.getElementById('export-btn').addEventListener('click', exportSummary);
  document.getElementById('notif-btn').addEventListener('click', requestNotifications);

  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
    if (e.target.id === 'modal-cancel') closeModal();
    if (e.target.id === 'modal-save') {
      const scope = document.getElementById('modal-body');
      const data = getFormData(scope); if (!data) { toast('Please enter a name'); return; }
      state.goals.push({ id: 'g' + Date.now(), tf: activeTab, log: {}, ...data });
      saveState(); render(); closeModal(); toast('Goal added ✓');
    }
  });

  document.getElementById('cal-prev').addEventListener('click', () => { calOffset--; renderCalendar(); });
  document.getElementById('cal-next').addEventListener('click', () => { if (calOffset < 0) { calOffset++; renderCalendar(); } });

  // ── Service Worker ─────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Check reminders every minute
  setInterval(scheduleReminders, 60000);

  // ── Init ───────────────────────────────────────────────────────────────
  loadState();
  render();
})();
