/* Contingency: rendering. Everything is re-rendered from state with template strings; clicks are delegated through data-act attributes. */
(function () {
  const PI = (globalThis.PI = globalThis.PI || {});
  const D = PI.DATA, F = PI.Firm, C = PI.Cases, R = PI.rng;
  const U = (PI.UI = {});
  const h = PI.escapeHtml;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const M = PI.money;

  U.state = null;
  U.tab = 'dashboard';
  U.caseFilter = 'attention';
  U.openCaseId = null;
  U.modal = null; // { type, ...}
  U.logFilter = 'all';
  U.toastTimer = null;

  // ---------- Small helpers ----------
  const SEV_LABEL = ['', 'Minor', 'Moderate', 'Serious', 'Severe', 'Catastrophic'];
  const stagePill = (c) => `<span class="stage-pill stage-${c.stage}">${h(C.STAGE_NAMES[c.stage])}${c.stage === 'litigation' && c.litigation ? ` · ${h(C.litStage(c).name)}` : ''}</span>`;
  const attName = (s, id) => { const a = F.staffById(s, id); return a ? a.name : 'Unassigned'; };
  const chip = (text, kind) => `<span class="chip ${kind || ''}">${h(text)}</span>`;
  const meter = (v, kind) => `<div class="meter ${kind || ''}"><span style="width:${PI.clamp(v, 0, 100)}%"></span></div>`;
  const moodKind = (m) => (m < 35 ? 'danger' : m < 60 ? 'warn' : '');
  const date = (d) => PI.fmtDate(d);
  const btn = (act, label, opts) => { opts = opts || {}; return `<button class="btn ${opts.cls || ''}" data-act="${act}" ${opts.arg != null ? `data-arg="${h(opts.arg)}"` : ''} ${opts.arg2 != null ? `data-arg2="${h(opts.arg2)}"` : ''} ${opts.disabled ? 'disabled' : ''} ${opts.title ? `title="${h(opts.title)}"` : ''}>${label}${opts.cost ? ` <span class="cost">${M(opts.cost)}</span>` : ''}</button>`; };
  const skillDots = (n) => `<span class="dots">${Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  const flagChips = (c, all) => { const ids = all ? c.flags : c.known.flags; return ids.map((f) => { const r = D.RED_FLAGS.find((x) => x.id === f); const g = D.GREEN_FLAGS.find((x) => x.id === f); const def = r || g; if (!def) return ''; return `<span class="chip ${r ? 'danger' : 'good'}" title="${h(def.desc)}">${h(def.name)}</span>`; }).join(''); };
  const solChip = (s, c) => { if (c.litigation && c.litigation.filed) return chip('Suit filed', 'info'); const days = c.solDay - s.day; return `<span class="chip ${days < 90 ? 'danger' : days < 240 ? 'warn' : ''}" title="Statute of limitations">SOL ${PI.daysToText(days)}</span>`; };
  const pendingLabel = { demand: 'Demand figure needed', offer: 'Offer on the table', liens: 'Liens to resolve' };

  U.toast = function (text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(U.toastTimer);
    U.toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  };

  // Decisions that need the player's hand.
  U.pendingCases = (s) => s.cases.filter((c) => C.isOpen(c) && c.pending && !c.delegated);
  U.attention = function (s) {
    const items = [];
    for (const ev of s.events) items.push({ kind: 'event', text: `Event: ${ev.title}`, act: 'show-event', arg: ev.uid, level: 'warn' });
    for (const c of U.pendingCases(s)) items.push({ kind: 'decision', text: `${c.clientName}: ${pendingLabel[c.pending.type]}`, act: 'open-case', arg: c.id, level: 'warn' });
    for (const c of s.cases) {
      if (!C.isOpen(c) || (c.litigation && c.litigation.filed) || c.stage === 'disbursement') continue;
      const days = c.solDay - s.day;
      if (days < 120) items.push({ kind: 'sol', text: `${c.clientName}: statute of limitations in ${PI.daysToText(days)} and no suit on file`, act: 'open-case', arg: c.id, level: 'danger' });
      if (c.noticeDay && !c.noticeServed && c.noticeDay - s.day < 60) items.push({ kind: 'notice', text: `${c.clientName}: notice of claim due in ${PI.daysToText(c.noticeDay - s.day)}`, act: 'open-case', arg: c.id, level: 'danger' });
    }
    for (const c of s.cases) if (C.isOpen(c) && c.client.mood < 30) items.push({ kind: 'mood', text: `${c.clientName} is unhappy (${Math.round(c.client.mood)}/100) and may fire the firm`, act: 'open-case', arg: c.id, level: 'warn' });
    for (const a of F.attorneys(s)) { const ld = s.loads && s.loads[a.id]; if (ld && ld.speed < 0.7) items.push({ kind: 'load', text: `${a.name} is overloaded (${Math.round(ld.need)} work units against a capacity of ${Math.round(ld.cap)}). Files are moving at ${Math.round(ld.speed * 100)}% speed.`, act: 'tab', arg: 'staff', level: 'warn' }); }
    const expiring = s.leads.filter((l) => l.expiresDay - s.day <= 3).length;
    if (expiring) items.push({ kind: 'leads', text: `${expiring} lead${expiring > 1 ? 's' : ''} will call another firm within days`, act: 'tab', arg: 'intake', level: 'warn' });
    if (s.cash < 0) items.push({ kind: 'cash', text: `Cash is negative. ${s.debt < s.creditLimit ? 'The line of credit is covering payroll.' : 'The line of credit is maxed out.'}`, act: 'tab', arg: 'finance', level: 'danger' });
    if (s.staff.length >= F.officeCap(s)) items.push({ kind: 'office', text: 'The office is full. No room to hire.', act: 'tab', arg: 'office', level: 'info' });
    const f = F.founder(s);
    if (f && f.age >= 60 && !s.successorId) items.push({ kind: 'succession', text: `${f.name} is ${f.age}. Name a successor before retirement.`, act: 'tab', arg: 'firm', level: 'warn' });
    return items;
  };

  // ---------- Top bar ----------
  U.renderTopbar = function () {
    const s = U.state;
    const el = $('#topbar');
    if (!s) { el.innerHTML = ''; return; }
    const o = F.monthlyOverhead(s);
    el.innerHTML = `
      <div class="brand"><div class="firm">${h(s.firmName)}</div><div class="tier">${h(D.TIERS[s.tier].name)} · ${h(s.city.name)}</div></div>
      <div class="stat"><span class="label">Date</span><span class="value">${h(date(s.day))}</span></div>
      <div class="stat"><span class="label">Cash</span><span class="value ${s.cash < 0 ? 'danger' : ''}">${M(s.cash, { short: true })}</span>${s.debt ? `<span class="small muted mono">debt ${M(s.debt, { short: true })}</span>` : `<span class="small muted mono">burn ${M(o.total, { short: true })}/mo</span>`}</div>
      <div class="stat" title="Online reviews from closed cases. Callers read them before they dial. Paid marketing is running at ${Math.round(F.marketingEffect(s) * 100)}% effectiveness."><span class="label">Reviews</span><span class="value brass">${(s.reviews && s.reviews.n >= 3) ? F.stars(s).toFixed(1) + '★' : '—'}</span><span class="small muted mono">${s.reviews ? s.reviews.n : 0} review${s.reviews && s.reviews.n === 1 ? '' : 's'}</span></div>
      <div class="stat" title="Street reputation: what clients and referral sources think. Drives referrals and lead quality."><span class="label">Street rep</span><span class="value">${Math.round(s.reputation)}</span><div class="repbar"><span style="width:${s.reputation}%"></span></div></div>
      <div class="stat" title="Carrier reputation: how adjusters reserve against your letterhead. Rises when you file and try cases; falls when you take early lowballs."><span class="label">Carrier rep</span><span class="value">${Math.round(s.carrierRep == null ? 30 : s.carrierRep)}</span><div class="repbar"><span style="width:${s.carrierRep == null ? 30 : s.carrierRep}%;background:var(--info)"></span></div></div>
      <div class="controls">
        ${btn('advance', 'Advance week', { cls: 'primary' })}
        ${btn('toggle-play', PI.Main.playing ? 'Pause' : 'Play')}
        <span class="speed row" style="gap:2px">${[1, 2, 4].map((x) => `<button class="btn sm ${PI.Main.speed === x ? 'on' : ''}" data-act="speed" data-arg="${x}">${x}x</button>`).join('')}</span>
        ${btn('menu', 'Menu')}
      </div>`;
  };

  U.renderRail = function () {
    const s = U.state;
    const el = $('#rail');
    const pend = U.pendingCases(s).length + s.events.length;
    const tabs = [
      ['dashboard', 'Dashboard', U.attention(s).length],
      ['intake', 'Intake', s.leads.length],
      ['cases', 'Cases', pend],
      ['staff', 'Staff', 0],
      ['marketing', 'Marketing', 0],
      ['office', 'Office', 0],
      ['finance', 'Finance', 0],
      ['firm', 'Firm', 0],
      ['log', 'Log', 0]
    ];
    el.innerHTML = tabs.map(([id, name, badge]) => `<button class="${U.tab === id ? 'active' : ''}" data-act="tab" data-arg="${id}"><span>${name}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`).join('');
  };

  // ---------- Tabs ----------
  U.renderTab = function () {
    const s = U.state;
    const el = $('#content');
    const fn = { dashboard: U.tabDashboard, intake: U.tabIntake, cases: U.tabCases, staff: U.tabStaff, marketing: U.tabMarketing, office: U.tabOffice, finance: U.tabFinance, firm: U.tabFirm, log: U.tabLog }[U.tab] || U.tabDashboard;
    el.innerHTML = `<section>${fn(s)}</section>`;
    if (U.tab === 'finance') U.drawCashChart(s);
    if (U.tab === 'dashboard') U.drawCashChart(s, 'dash-chart');
  };

  U.tabDashboard = function (s) {
    const open = F.openCases(s);
    const items = U.attention(s);
    const hist = s.history[s.history.length - 1] || {};
    const pend = U.pendingCases(s).length;
    const stages = ['investigation', 'treatment', 'records', 'demand', 'negotiation', 'litigation', 'disbursement'];
    const counts = stages.map((st) => open.filter((c) => c.stage === st).length);
    const estPipeline = open.reduce((a, c) => a + C.estimate(s, c).mid * c.feePct, 0);
    return `
      <div class="page-head"><h1>Dashboard</h1><p>${h(date(s.day, true))}. Week ${s.week} of the firm. ${open.length} open file${open.length === 1 ? '' : 's'}.</p></div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Cash</div><div class="kpi-value ${s.cash < 0 ? 'danger' : ''}">${M(s.cash)}</div><div class="kpi-sub">${s.debt ? `${M(s.debt)} drawn of ${M(s.creditLimit)} credit` : `${M(s.creditLimit)} credit available`}</div></div>
        <div class="kpi"><div class="kpi-label">Fees, last 4 weeks</div><div class="kpi-value">${M(hist.fees4 || 0)}</div><div class="kpi-sub">Lifetime ${M(s.stats.feesEarned, { short: true })}</div></div>
        <div class="kpi"><div class="kpi-label">Pipeline fee value</div><div class="kpi-value">${M(estPipeline, { short: true })}</div><div class="kpi-sub">Estimated fees on ${open.length} open files</div></div>
        <div class="kpi ${pend ? 'alert' : ''}"><div class="kpi-label">Decisions waiting</div><div class="kpi-value">${pend}</div><div class="kpi-sub">${s.events.length} event${s.events.length === 1 ? '' : 's'} pending</div></div>
        <div class="kpi"><div class="kpi-label">Leads waiting</div><div class="kpi-value">${s.leads.length}</div><div class="kpi-sub">${s.lastWeekLeads || 0} new this week · intake capacity ${Math.floor(F.intakeCapacity(s))}</div></div>
        <div class="kpi"><div class="kpi-label">Team</div><div class="kpi-value">${s.staff.length}</div><div class="kpi-sub">${F.attorneys(s).length} attorney${F.attorneys(s).length === 1 ? '' : 's'} · ${h(D.OFFICES[s.office].name)}</div></div>
      </div>
      <div class="grid cols-2">
        <div class="panel"><h3>Needs attention</h3>
          ${items.length ? `<div class="list">${items.slice(0, 14).map((it) => `<div class="row between card ${it.level === 'danger' ? 'urgent' : 'attention'}" style="padding:8px 10px"><span>${h(it.text)}</span>${btn(it.act, it.kind === 'event' ? 'Review' : 'Open', { arg: it.arg, cls: 'sm' })}</div>`).join('')}${items.length > 14 ? `<p class="muted small">${items.length - 14} more…</p>` : ''}</div>` : `<div class="empty">Nothing urgent. Advance the week.</div>`}
        </div>
        <div class="stack">
          <div class="panel"><h3>Case pipeline</h3>
            <div class="table-wrap"><table>${stages.map((st, i) => `<tr class="clickable" data-act="cases-filter" data-arg="${st}"><td>${stagePill({ stage: st })}</td><td class="num">${counts[i]}</td><td style="width:50%">${meter(open.length ? counts[i] / open.length * 100 : 0)}</td></tr>`).join('')}</table></div>
          </div>
          <div class="panel"><h3>Cash, last year</h3><canvas class="chart" id="dash-chart" width="600" height="160" aria-label="Cash history chart"></canvas></div>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="panel"><h3>Recent activity</h3><div class="timeline">${s.log.slice(0, 12).map((l) => `<div class="entry ${l.kind}"><span class="when">${h(date(l.day))}</span><span class="what">${h(l.text)}</span></div>`).join('')}</div></div>
        <div class="panel"><h3>In the news</h3>${s.news.length ? `<div class="timeline">${s.news.slice(0, 8).map((n) => `<div class="entry"><span class="when">${h(date(n.day))}</span><span class="what">${h(n.text)}</span></div>`).join('')}</div>` : '<div class="empty">No press yet. Win something big.</div>'}</div>
      </div>`;
  };

  // ---------- Intake ----------
  U.leadCard = function (s, l) {
    const T = D.CASE_TYPES[l.type];
    const days = l.expiresDay - s.day;
    const est = C.estimate(s, l);
    const atts = F.attorneys(s);
    const liab = l.known.liability ? { clear: chip('Liability looks clear', 'good'), disputed: chip('Liability disputed', 'warn'), weak: chip('Liability weak', 'danger') }[l.liability.bucket] : chip('Liability unverified');
    const ins = l.known.uninsured ? chip('Defendant uninsured', 'danger') : l.known.insurer ? chip(D.INSURERS.find((i) => i.id === l.defendant.insurer).name, 'info') : chip('Carrier unknown');
    const limits = l.known.limits ? chip(`Limits ${M(l.defendant.limits, { short: true })}`, 'info') : '';
    const um = l.known.um ? chip(l.client.umLimit ? `UM/UIM ${M(l.client.umLimit, { short: true })}` : 'No UM coverage', l.client.umLimit ? 'good' : 'warn') : '';
    const health = l.known.health ? chip({ none: 'Uninsured (LOP treatment)', private: 'Private health plan', erisa: 'ERISA plan', medicare: 'Medicare', medicaid: 'Medicaid' }[l.client.health]) : '';
    return `<div class="card lead-card ${days <= 3 ? 'urgent' : ''}">
      <div class="row between"><div><h3>${h(l.clientName)} <span class="muted small">· ${l.clientAge}, ${h(l.occupation)}</span></h3><div class="small muted">${h(T.name)} · ${h(SEV_LABEL[l.severity])} injury · via ${h(D.CHANNELS[l.channel].name.toLowerCase())}</div></div>
        <div class="row"><span class="chip ${days <= 3 ? 'danger' : ''}">${days <= 0 ? 'Leaving today' : `Decides in ${days} day${days === 1 ? '' : 's'}`}</span>${solChip(s, l)}</div></div>
      <p class="narrative">${h(l.clientName.split(' ')[0])} was ${h(l.narrative)} on ${h(date(l.incidentDay))}. Reports ${h(l.injury)}.${l.flags.includes('comp') && l.known.flags.includes('comp') ? ' Was on the job at the time.' : ''}</p>
      <div class="flags">${liab}${ins}${limits}${um}${health}${flagChips(l)}</div>
      ${(() => { const att = F.leastLoaded(s); const ld = s.loads && s.loads[att.id]; const fee = est.mid * 0.333; const costs = 150 + l.severity * 250 + (T.expertRequired ? 25000 : 0); const hours = 12 + l.severity * 14 + (l.liability.bucket === 'weak' ? 20 : 0); const loadPct = ld ? Math.round(ld.need / ld.cap * 100) : 0; return `<div class="small muted">Economics: fee around <span class="mono">${M(fee, { short: true })}</span> if it settles at value · costs to advance ~<span class="mono">${M(costs, { short: true })}</span> · roughly ${hours} attorney-hours · ${h(att.name)} is at <span class="${loadPct > 100 ? 'danger' : loadPct > 80 ? 'warn' : ''}">${loadPct}% load</span>${l.liability.bucket === 'weak' && l.known.liability ? ' · <span class="danger">weak liability cases rarely settle without suit</span>' : ''}${l.known.limits && l.defendant.limits < est.mid ? ' · <span class="warn">value exceeds policy limits</span>' : ''}</div>`; })()}
      <div class="row between">
        <span class="small muted">Rough value <span class="mono">${M(est.lo, { short: true })} to ${M(est.hi, { short: true })}</span> · ${l.investigated ? 'investigated' : 'based on the intake call only'}</span>
        <div class="actions">
          ${atts.length > 1 ? `<select data-role="assign-${l.id}" aria-label="Assign attorney">${atts.map((a) => `<option value="${a.id}">${h(a.name)}${a.isFounder ? ' (you)' : ''}</option>`).join('')}</select>` : ''}
          ${btn('sign-lead', 'Sign', { arg: l.id, cls: 'primary sm' })}
          ${l.investigated ? '' : btn('investigate-lead', 'Investigate', { arg: l.id, cls: 'sm', cost: 150, title: 'Pull the crash report, run the carrier and check the client\'s history before signing.' })}
          ${btn('refer-lead', 'Refer out', { arg: l.id, cls: 'sm', title: 'Send to another firm for a 25% referral fee when it resolves.' })}
          ${btn('decline-lead', 'Decline', { arg: l.id, cls: 'sm ghost' })}
        </div></div>
    </div>`;
  };
  U.tabIntake = function (s) {
    const leads = s.leads.slice().sort((a, b) => a.expiresDay - b.expiresDay);
    return `
      <div class="page-head"><h1>Intake</h1><p>Every caller is a potential client and a potential disaster. Screen for liability, damages and coverage. Capacity ${Math.floor(F.intakeCapacity(s))} at a time; ${s.stats.leadsLost} callers lost to voicemail so far.</p></div>
      <div class="row between"><div class="row"><label class="row small"><input type="checkbox" data-act="policy" data-arg="autoIntake" ${s.policy.autoIntake ? 'checked' : ''}> Let intake staff sign and decline automatically</label></div><span class="small muted">Signed ${s.stats.signed} · Declined ${s.stats.declined}</span></div>
      ${leads.length ? `<div class="list">${leads.map((l) => U.leadCard(s, l)).join('')}</div>` : `<div class="empty">No leads waiting. Marketing brings callers; reputation and happy clients bring the good ones.</div>`}`;
  };

  // ---------- Cases ----------
  U.tabCases = function (s) {
    const f = U.caseFilter;
    const filters = [['attention', 'Needs decision', U.pendingCases(s).length], ['open', 'All open', F.openCases(s).length], ...['investigation', 'treatment', 'records', 'demand', 'negotiation', 'litigation', 'disbursement'].map((st) => [st, C.STAGE_NAMES[st], s.cases.filter((c) => c.stage === st).length]), ['closed', 'Closed', s.cases.filter((c) => c.stage === 'closed').length], ['ended', 'Lost or dropped', s.cases.filter((c) => ['lost', 'dropped'].includes(c.stage)).length]];
    let rows = s.cases.filter((c) => f === 'attention' ? (c.pending && !c.delegated && C.isOpen(c)) : f === 'open' ? C.isOpen(c) : f === 'ended' ? ['lost', 'dropped'].includes(c.stage) : c.stage === f);
    rows = rows.slice().sort((a, b) => (b.pending && !b.delegated ? 1 : 0) - (a.pending && !a.delegated ? 1 : 0) || a.solDay - b.solDay);
    return `
      <div class="page-head"><h1>Cases</h1><p>Click a file to open it. Delegated files are run by their assigned attorney; hands-on files wait for you.</p></div>
      <div class="row">${filters.map(([id, name, n]) => `<button class="btn sm ${f === id ? 'primary' : ''}" data-act="cases-filter" data-arg="${id}">${name} <span class="cost">${n}</span></button>`).join('')}</div>
      ${rows.length ? `<div class="panel flush table-wrap"><table>
        <thead><tr><th>Client</th><th>Matter</th><th>Stage</th><th>Treatment</th><th>Attorney</th><th class="num">Est. value</th><th class="num">Offer</th><th>Client</th><th>Deadline</th><th>Status</th></tr></thead>
        <tbody>${rows.map((c) => { const est = C.estimate(s, c); const closed = !C.isOpen(c); return `<tr class="clickable" data-act="open-case" data-arg="${c.id}">
          <td><strong>${h(c.clientName)}</strong><div class="small muted">${h(SEV_LABEL[c.severity])} · ${closed ? `closed ${h(date(c.closedDay || c.createdDay))}` : `${Math.round((s.day - (c.signedDay || c.createdDay)) / 7)} wks open`}</div></td>
          <td>${h(D.CASE_TYPES[c.type].short)}<div class="small muted">${h(c.injury)}</div></td>
          <td>${stagePill(c)}</td>
          <td style="min-width:120px">${closed ? `<span class="small muted">${c.settlement && c.settlement.early ? 'Settled pre-MMI' : 'MMI'}</span>` : (() => { const ts = C.treatmentStatus(c); return `<div class="small ${ts.kind}">${h(ts.label)}</div>${meter(ts.pct, ts.kind)}<div class="small muted mono">${M(C.specials(c), { short: true })} billed</div>`; })()}</td>
          <td>${h(attName(s, c.attorneyId))}${c.delegated ? `<div class="small muted">delegated</div>` : ''}</td>
          <td class="num">${closed && c.settlement ? M(c.settlement.gross) : `${M(est.lo, { short: true })}–${M(est.hi, { short: true })}`}</td>
          <td class="num">${c.negotiation && c.negotiation.currentOffer ? M(c.negotiation.currentOffer) : '—'}</td>
          <td style="min-width:90px">${closed ? (c.satisfaction != null ? `${c.satisfaction}/100` : '—') : meter(c.client.mood, moodKind(c.client.mood))}</td>
          <td>${closed ? '—' : solChip(s, c)}</td>
          <td>${c.pending && !c.delegated ? `<span class="chip stamp">${h(pendingLabel[c.pending.type])}</span>` : c.pending ? chip('Attorney deciding') : c.negotiation && c.negotiation.awaiting ? chip('Awaiting carrier') : ''}</td>
        </tr>`; }).join('')}</tbody></table></div>` : `<div class="empty">No files here.</div>`}`;
  };

  // ---------- Case file drawer ----------
  U.renderDrawer = function () {
    const s = U.state;
    const root = $('#drawer-root');
    const c = s && s.cases.find((x) => x.id === U.openCaseId);
    if (!c) { root.hidden = true; root.innerHTML = ''; return; }
    root.hidden = false;
    const T = D.CASE_TYPES[c.type];
    const est = C.estimate(s, c);
    const atts = F.attorneys(s);
    const open = C.isOpen(c);
    const stages = ['investigation', 'treatment', 'records', 'demand', 'negotiation', 'litigation', 'disbursement'];
    const idx = stages.indexOf(c.stage);
    const skipLit = c.stage === 'disbursement' && !(c.litigation && c.litigation.filed);
    const pipeline = stages.map((st, i) => `<div class="step ${c.stage === st ? 'now' : (i < idx && !(st === 'litigation' && skipLit)) ? 'done' : ''}">${h(C.STAGE_NAMES[st])}</div>`).join('');
    const actions = C.actions(s, c);
    const primary = actions.filter((a) => a.primary);
    const regular = actions.filter((a) => !a.primary && !a.group);
    const experts = actions.filter((a) => a.group === 'experts');
    const manage = actions.filter((a) => a.group === 'manage');
    const actBtn = (a) => btn('case-act', h(a.name), { arg: a.id, cls: `${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''} ${a.urgent ? 'urgent' : ''}`, cost: a.cost, disabled: a.disabled || (a.cost > s.cash + (s.creditLimit - s.debt)), title: a.desc });
    const ins = D.INSURERS.find((i) => i.id === c.defendant.insurer);
    const adjStyle = c.defendant.adjusterStyle ? D.ADJUSTER_STYLES.find((x) => x.id === c.defendant.adjusterStyle) : null;
    const ev = c.liability.evidence;
    const evidence = [['policeReport', 'Police report'], ['photos', 'Photographs'], ['witnesses', 'Witness statements'], ['video', 'Video footage'], ['scene', 'Scene inspection'], ['blackbox', 'Event data recorder']].filter(([k]) => ev[k]).map(([, n]) => chip(n, 'good')).join('') || '<span class="muted small">None gathered yet</span>';
    const liabText = c.liability.determination ? { accepted: 'Carrier accepted liability', disputed: `Carrier disputes liability${c.liability.cf ? ` and asserts ${Math.round(c.liability.cf * 100)}% comparative fault` : ''}`, denied: 'Carrier denied liability' }[c.liability.determination] : 'Awaiting carrier position';
    const strength = C.effectiveLiability(c);
    const specials = C.specials(c);
    const lit = c.litigation;
    const n = c.negotiation;
    const st = c.settlement;
    const statement = st ? C.statement(s, c) : null;
    const feeOnEst = Math.round(est.mid * c.feePct);
    root.innerHTML = `<div class="overlay" data-act="close-drawer-bg"><div class="drawer" role="dialog" aria-label="Case file">
      <div class="drawer-head">
        <div class="title"><div class="row"><h2>${h(c.clientName)}</h2>${stagePill(c)}${c.delegated ? chip('Delegated', 'info') : ''}${c.pending && !c.delegated ? `<span class="chip stamp">${h(pendingLabel[c.pending.type])}</span>` : ''}</div>
          <div class="muted">${h(T.name)} · ${h(SEV_LABEL[c.severity])}: ${h(c.injury)} · Incident ${h(date(c.incidentDay))}${c.signedDay != null ? ` · Signed ${h(date(c.signedDay))}` : ''}</div></div>
        <div class="row">${open ? `<label class="small muted">Attorney <select data-act="assign-case" data-arg="${c.id}">${atts.map((a) => `<option value="${a.id}" ${a.id === c.attorneyId ? 'selected' : ''}>${h(a.name)}</option>`).join('')}</select></label>` : ''}${btn('close-drawer', 'Close')}</div>
      </div>
      <div class="pipeline">${pipeline}</div>
      ${primary.length ? `<div class="panel" style="border-color:var(--accent)"><div class="row between"><div><h3>Your decision</h3><p class="muted small">${h(primary[0].desc)}</p></div><div class="actions">${primary.map(actBtn).join('')}</div></div></div>` : ''}
      <div class="grid cols-3">
        <div class="panel"><h3>Value</h3>
          <dl class="kv"><dt>Estimate</dt><dd class="mono">${M(est.lo)} – ${M(est.hi)}</dd><dt>Fee at midpoint</dt><dd class="mono">${M(feeOnEst)} (${Math.round(c.feePct * 100)}%)</dd>${!c.treatment.mmi && C.isOpen(c) ? `<dt>Worked up fully</dt><dd class="mono" title="A rough read on what the case is worth once treatment is complete">${M(Math.round(C.potentialValue(s, c) * 0.8 / 1000) * 1000, { short: true })} – ${M(Math.round(C.potentialValue(s, c) * 1.2 / 1000) * 1000, { short: true })}</dd>` : ''}<dt>Billed medicals</dt><dd class="mono">${M(specials)}${c.treatment.mmi ? '' : ' so far'}</dd><dt>Wage loss</dt><dd class="mono">${M(c.wage)}</dd>${c.futureMeds ? `<dt>Future medicals</dt><dd class="mono">${M(c.futureMeds)}</dd>` : ''}<dt>Costs advanced</dt><dd class="mono">${M(c.costs)}</dd><dt>Collectible</dt><dd class="mono">${c.known.limits ? `${M(c.defendant.limits)}${c.defendant.umbrella ? ` + ${M(c.defendant.umbrella)} umbrella` : ''}` : c.known.uninsured ? 'Uninsured defendant' : 'Limits unknown'}${c.uim ? `<br>UIM claim open (${M(c.client.umLimit)})` : ''}</dd></dl>
        </div>
        <div class="panel"><h3>Liability</h3>
          <dl class="kv"><dt>Position</dt><dd>${h(liabText)}</dd><dt>Strength</dt><dd>${meter(strength * 100, strength < 0.5 ? 'danger' : strength < 0.75 ? 'warn' : '')}<span class="small muted">${strength > 0.85 ? 'Strong' : strength > 0.65 ? 'Good' : strength > 0.45 ? 'Contested' : 'Weak'}${c.liability.cf && c.known.liability ? ` · ${Math.round(c.liability.cf * 100)}% comparative fault alleged` : ''}</span></dd><dt>Evidence</dt><dd><div class="flags">${evidence}</div></dd><dt>Facts</dt><dd><div class="flags">${flagChips(c) || '<span class="muted small">Nothing notable yet</span>'}</div></dd></dl>
        </div>
        <div class="panel"><h3>Insurance</h3>
          <dl class="kv"><dt>Defendant</dt><dd>${h(c.defendant.name)}</dd><dt>Carrier</dt><dd>${c.known.uninsured ? '<span class="danger">None (uninsured)</span>' : c.known.insurer ? `${h(ins.name)}<div class="small muted">${h(ins.desc)}</div>` : 'Not yet confirmed'}</dd>${c.defendant.adjuster ? `<dt>Adjuster</dt><dd>${h(c.defendant.adjuster)}${adjStyle ? ` <span class="chip">${h(adjStyle.name)}</span><div class="small muted">${h(adjStyle.desc)}</div>` : ''}</dd>` : ''}<dt>Policy limits</dt><dd>${c.known.limits ? `<span class="mono">${M(c.defendant.limits)}</span>` : 'Not disclosed'}</dd><dt>Client's UM/UIM</dt><dd>${c.known.um ? (c.client.umLimit ? `<span class="mono">${M(c.client.umLimit)}</span>` : 'None') : 'Not reviewed'}${c.known.um && c.client.medpay ? ` · med-pay ${M(c.client.medpay)}${c.medpayUsed ? ' (used)' : ''}` : ''}</dd><dt>Health coverage</dt><dd>${c.known.health ? h({ none: 'None: treating on letters of protection', private: 'Private insurance (subrogation lien expected)', erisa: 'Self-funded ERISA plan', medicare: 'Medicare', medicaid: 'Medicaid' }[c.client.health]) : 'Not identified'}</dd></dl>
        </div>
      </div>
      <div class="grid cols-3">
        <div class="panel"><h3>Client</h3>
          <dl class="kv"><dt>Who</dt><dd>${h(c.clientName)}, ${c.clientAge}, ${h(c.occupation)}</dd><dt>Mood</dt><dd>${meter(c.client.mood, moodKind(c.client.mood))}<span class="small muted">${Math.round(c.client.mood)}/100 · last contact ${s.week - c.client.lastContactWeek} wk ago</span></dd><dt>Expectations</dt><dd>${c.client.expectations > 1.2 ? 'Unrealistic' : 'Reasonable'}</dd>${c.satisfaction != null ? `<dt>Satisfaction</dt><dd>${c.satisfaction}/100</dd>` : ''}</dl>
        </div>
        <div class="panel"><h3>Treatment</h3>
          ${(() => { const ts = C.treatmentStatus(c); return `<div class="row between small"><span class="${ts.kind}">${h(ts.label)}</span><span class="muted mono">${ts.pct}%</span></div>${meter(ts.pct, ts.kind)}`; })()}
          <div class="small muted" style="margin:6px 0">${c.treatment.mmi ? 'Reached maximum medical improvement.' : c.treatment.inGap ? '<span class="warn">Client is not currently treating (gap in care).</span>' : `Active treatment, about ${PI.weeksToText(Math.max(0, Math.round(c.treatment.weeksLeft)))} remaining.`}${c.treatment.gaps ? ` ${c.treatment.gaps} gap${c.treatment.gaps > 1 ? 's' : ''} in care.` : ''}${c.treatment.surgeryIndicated && !c.treatment.surgeryDone && !c.treatment.surgeryDeclined ? ' <span class="brass">Surgery recommended.</span>' : ''}</div>
          <table class="small">${c.treatment.plan.map((p) => `<tr><td>${h(p.name)}</td><td class="num">${p.billed ? M(p.billed) : '—'}</td><td class="small muted">${p.recordsReceived ? 'records in' : p.recordsRequested ? 'records requested' : p.done ? 'complete' : 'treating'}</td></tr>`).join('')}</table>
        </div>
        <div class="panel"><h3>Deadlines</h3>
          <dl class="kv"><dt>Statute</dt><dd>${h(date(c.solDay))} <div>${solChip(s, c)}</div></dd>${c.noticeDay ? `<dt>Notice of claim</dt><dd>${c.noticeServed ? chip('Served', 'good') : `${h(date(c.noticeDay))} ${chip('Not served', 'danger')}`}</dd>` : ''}${c.demand && c.demand.sent ? `<dt>Demand</dt><dd>${M(c.demand.amount)} on ${h(date(c.demand.sentDay))}${c.demand.timeLimited ? `<div class="small">Time-limited, deadline ${h(date(c.demand.deadlineDay))}${c.demand.blown ? ' <span class="good">(missed by carrier)</span>' : ''}</div>` : ''}</dd>` : ''}${lit && lit.filed ? `<dt>Suit filed</dt><dd>${h(date(lit.filedDay))}</dd>` : ''}</dl>
        </div>
      </div>
      ${lit && lit.filed ? `<div class="panel"><h3>Litigation</h3>
        <dl class="kv"><dt>Court</dt><dd>${h(lit.court)}, ${h(lit.judge)}</dd><dt>Defense</dt><dd>${h(lit.defenseFirm || 'Not yet appeared')}</dd><dt>Phase</dt><dd>${h(C.litStage(c).name)} ${meter(Math.min(100, lit.stageWeeks / Math.max(1, lit.stageNeed) * 100))}<span class="small muted">about ${PI.weeksToText(Math.max(0, Math.round((lit.stageNeed - lit.stageWeeks) / Math.max(0.2, c.speedLast))))} remaining at current pace</span></dd><dt>Experts</dt><dd>${lit.experts.length ? lit.experts.map((e) => chip(D.EXPERTS[e].name)).join(' ') : '<span class="muted">None retained</span>'}</dd>${lit.badFaith ? `<dt>Bad faith</dt><dd class="good">Carrier blew a policy-limits demand. Excess exposure is on the table.</dd>` : ''}${lit.ime ? `<dt>Defense IME</dt><dd class="warn">Defense examiner disputes causation</dd>` : ''}${lit.verdict ? `<dt>Verdict</dt><dd class="mono good">${M(lit.verdict)}</dd>` : ''}</dl></div>` : ''}
      ${n && n.offers && n.offers.length ? `<div class="panel"><h3>Negotiation</h3><div class="table-wrap"><table class="offer-table"><thead><tr><th>Date</th><th>From</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>${n.offers.slice().reverse().map((o) => `<tr><td>${h(date(o.day))}</td><td>${o.from === 'firm' ? 'Firm' : o.from === 'defense' ? 'Defense counsel' : h(c.defendant.adjuster || 'Adjuster')}</td><td class="num ${o.from === 'firm' ? '' : 'brass'}">${o.amount ? M(o.amount) : 'No offer'}</td><td class="small muted">${h(o.note || '')}</td></tr>`).join('')}</tbody></table></div>${n.awaiting ? '<p class="small muted" style="margin-top:6px">Waiting on the carrier\'s response.</p>' : ''}</div>` : ''}
      ${c.liens.length ? `<div class="panel"><h3>Liens and reimbursement claims</h3><div class="table-wrap"><table><thead><tr><th>Holder</th><th>Type</th><th class="num">Asserted</th><th class="num">After reduction</th></tr></thead><tbody>${c.liens.map((l) => `<tr><td>${h(l.holder)}</td><td class="small" title="${h(D.LIEN_TYPES[l.type].desc)}">${h(D.LIEN_TYPES[l.type].name)}</td><td class="num">${M(l.amount)}</td><td class="num">${l.reduction != null ? M(l.amount - l.reduction) : '—'}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${statement ? `<div class="panel"><h3>Settlement statement</h3><div class="table-wrap"><table><tr><td>Gross recovery</td><td class="num">${M(statement.gross)}</td></tr><tr><td>Attorney fee (${Math.round(c.feePct * 100)}%)${statement.feeCut ? ` <span class="small muted">reduced by ${M(statement.feeCut)}</span>` : ''}</td><td class="num">-${M(statement.feeNet)}</td></tr><tr><td>Case costs reimbursed</td><td class="num">-${M(statement.costs)}</td></tr><tr><td>Liens paid</td><td class="num">-${M(statement.liens)}</td></tr>${statement.referral ? `<tr><td>Referral fee to referring attorney</td><td class="num">-${M(statement.referral)}</td></tr>` : ''}<tr><th>Net to client</th><th class="num">${M(statement.net)}</th></tr></table></div><p class="small muted" style="margin-top:6px">${st.disbursed ? 'Funds disbursed.' : st.negotiating ? 'Lien negotiations in progress.' : `Settlement funds expected in about ${PI.weeksToText(Math.max(0, st.weeksToCheck))}.`}</p></div>` : ''}
      ${open ? `<div class="panel"><h3>Actions</h3><div class="actions">${regular.map(actBtn).join('')}</div>${actions.filter((a) => a.group === 'strategy').length ? `<div class="actions" style="margin-top:10px">${actions.filter((a) => a.group === 'strategy').map(actBtn).join('')}<span class="small muted">${h(actions.find((a) => a.group === 'strategy').desc)}</span></div>` : ''}${experts.length ? `<details style="margin-top:10px"><summary class="small">Experts (${experts.length} available)</summary><div class="actions" style="margin-top:8px">${experts.map(actBtn).join('')}</div></details>` : ''}<div class="actions" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">${manage.map(actBtn).join('')}</div></div>` : ''}
      <div class="grid cols-2">
        <div class="panel"><h3>File history</h3><div class="timeline">${c.timeline.slice().reverse().map((t) => `<div class="entry ${t.kind}"><span class="when">${h(date(t.day))}</span><span class="what">${h(t.text)}</span></div>`).join('')}</div></div>
        <div class="panel"><h3>Documents</h3>${c.docs.length ? `<div class="timeline">${c.docs.slice().reverse().map((d) => `<div class="entry"><span class="when">${h(date(d.day))}</span><span class="what">${h(d.name)}</span></div>`).join('')}</div>` : '<div class="empty">Nothing in the file yet.</div>'}${c.costLog.length ? `<h4 style="margin-top:12px">Costs advanced</h4><div class="timeline">${c.costLog.slice().reverse().map((x) => `<div class="entry"><span class="when">${h(date(x.day))}</span><span class="what">${h(x.label)} <span class="mono muted">${M(x.amount)}</span></span></div>`).join('')}</div>` : ''}</div>
      </div>
    </div></div>`;
  };

  // ---------- Staff ----------
  U.staffCard = function (s, st) {
    const def = D.ROLES[st.role];
    const isAtt = st.role === 'attorney' || st.role === 'trial';
    const load = s.loads && s.loads[st.id];
    const cases = isAtt ? F.caseload(s, st.id).length : 0;
    const skills = Object.keys(st.skills).filter((k) => def.skills.includes(k) || (isAtt && ['negotiation', 'litigation', 'client'].includes(k)));
    return `<div class="card">
      <div class="row between"><div><h3>${h(st.name)} ${st.isFounder ? chip('You', 'info') : ''}${st.isPartner && !st.isFounder ? chip('Partner', 'good') : ''}${s.successorId === st.id ? chip('Successor', 'good') : ''}</h3><div class="small muted">${h(st.title)} · age ${st.age}${st.isFounder ? '' : ` · ${M(st.salary)}/yr`}${st.suspendedUntil && s.day < st.suspendedUntil ? ' · <span class="danger">suspended</span>' : ''}</div></div>
        ${isAtt ? `<div class="small muted" style="text-align:right">${cases} case${cases === 1 ? '' : 's'}${load ? `<br>load ${Math.round(load.need)}/${Math.round(load.cap)}` : ''}</div>` : ''}</div>
      ${isAtt && load ? meter(load.need / load.cap * 100, load.speed < 0.7 ? 'danger' : load.speed < 0.9 ? 'warn' : '') : ''}
      ${!st.isFounder ? `<div class="skill"><span>Morale</span>${meter(st.morale, st.morale < 35 ? 'danger' : st.morale < 60 ? 'warn' : '')}<span></span></div>` : ''}
      <div class="stack" style="gap:3px">${skills.map((k) => `<div class="skill"><span>${k[0].toUpperCase() + k.slice(1)}</span>${skillDots(st.skills[k])}<span class="mono">${st.skills[k]}</span></div>`).join('')}</div>
      ${st.resolved ? `<div class="small muted">${st.resolved} resolved · ${M(st.feesGenerated, { short: true })} in fees</div>` : ''}
      <div class="actions">
        ${btn('train', 'Train', { arg: st.id, cls: 'sm', cost: 2500 + st.trained * 1500 })}
        ${!st.isFounder ? btn('raise', 'Raise 10%', { arg: st.id, cls: 'sm' }) + btn('bonus', 'Bonus', { arg: st.id, cls: 'sm', cost: 2500 }) : ''}
        ${isAtt && !st.isPartner ? btn('promote', 'Make partner', { arg: st.id, cls: 'sm', title: 'Salary +35%, morale to 100, eligible to be named successor.' }) : ''}
        ${st.isPartner && !st.isFounder && s.successorId !== st.id ? btn('successor', 'Name successor', { arg: st.id, cls: 'sm' }) : ''}
        ${!st.isFounder ? btn('fire', 'Let go', { arg: st.id, cls: 'sm ghost danger' }) : ''}
      </div></div>`;
  };
  U.tabStaff = function (s) {
    const cap = F.officeCap(s);
    const roles = {};
    for (const st of s.staff) (roles[st.role] = roles[st.role] || []).push(st);
    const order = ['attorney', 'trial', 'paralegal', 'casemgr', 'intake', 'investigator', 'lien', 'marketing', 'office', 'cfo'];
    return `
      <div class="page-head"><h1>Staff</h1><p>${s.staff.length} of ${cap} seats filled in ${h(D.OFFICES[s.office].name.toLowerCase())}. Payroll ${M(F.monthlyOverhead(s).payroll)} a month including benefits.</p></div>
      ${order.filter((r) => roles[r]).map((r) => `<h2>${h(D.ROLES[r].plural)}</h2><div class="grid auto">${roles[r].map((st) => U.staffCard(s, st)).join('')}</div>`).join('')}
      <h2>Candidates <span class="muted small">(pool refreshes monthly)</span></h2>
      <div class="grid auto">${s.candidates.map((cd) => { const def = D.ROLES[cd.role]; return `<div class="card"><div><h3>${h(cd.name)}</h3><div class="small muted">${h(def.name)} · age ${cd.age} · asks ${M(cd.salary)}/yr</div></div><p class="small muted">${h(def.desc)}</p><div class="stack" style="gap:3px">${def.skills.map((k) => `<div class="skill"><span>${k[0].toUpperCase() + k.slice(1)}</span>${skillDots(cd.skills[k])}<span class="mono">${cd.skills[k]}</span></div>`).join('')}</div><div class="actions">${btn('hire', 'Hire', { arg: cd.id, cls: 'primary sm', disabled: s.staff.length >= cap, title: s.staff.length >= cap ? 'Office is full' : '' })}</div></div>`; }).join('')}</div>`;
  };

  // ---------- Marketing ----------
  U.tabMarketing = function (s) {
    const o = F.monthlyOverhead(s);
    return `
      <div class="page-head"><h1>Marketing</h1><p>Spending ${M(o.marketing)} a month. Last week brought ${s.lastWeekLeads || 0} new leads; ${s.referralCredits || 0} happy clients are talking about you. Lead quality decides how many of those calls are worth signing.</p></div>
      ${(() => { const eff = F.marketingEffect(s); const st = F.stars(s); const n = s.reviews ? s.reviews.n : 0; return `<div class="panel ${eff < 0.6 ? 'card urgent' : ''}"><div class="row between"><div><h3>Reviews: ${n >= 3 ? `${st.toFixed(1)} stars from ${n} reviews` : `${n} review${n === 1 ? '' : 's'} so far (callers assume about four stars)`}</h3><p class="small muted">Every caller reads the reviews before dialing. Your paid channels are producing <strong class="${eff < 0.6 ? 'danger' : eff < 0.9 ? 'warn' : 'good'}">${Math.round(eff * 100)}%</strong> of the calls the same spend would bring a four-star firm${eff < 0.6 ? `. You are burning about ${M(o.marketing * (1 - eff), { short: true })} a month on ads nobody answers.` : '.'} Good callers also decide faster when the reviews are bad.</p></div>${s.reviews && s.reviews.recent && s.reviews.recent.length ? `<div class="stack small" style="min-width:240px">${s.reviews.recent.slice(0, 4).map((r) => `<div><span class="brass">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span> ${h(r.who.split(' ')[0])}: "${h(r.why)}"</div>`).join('')}</div>` : ''}</div></div>`; })()}
      <div class="list">${Object.entries(D.CHANNELS).map(([id, ch]) => {
        const lvl = s.marketing[id] || 0;
        const locked = ch.unlockTier && s.tier < ch.unlockTier;
        const perMonth = ch.passive ? (0.2 + s.reputation / 100 * 0.8 + Math.min(1, s.stats.resolved * 0.002)) * 4.33 : F.channelLeadsPerWeek(s, id) * 4.33;
        return `<div class="card"><div class="row between"><div style="min-width:0"><h3>${h(ch.name)} ${locked ? chip(`Unlocks at ${D.TIERS[ch.unlockTier].name}`, 'warn') : ''}${ch.risk ? chip('Ethics risk', 'danger') : ''}${ch.rep ? chip('Builds reputation', 'good') : ''}${ch.fee ? chip('25% referral fee', 'warn') : ''}</h3><p class="small muted">${h(ch.desc)}</p></div>
          <div class="row" style="flex-shrink:0">
            <div class="stack small" style="text-align:right;gap:0"><span class="mono">${lvl ? M(ch.cost * lvl) : '$0'}/mo</span><span class="muted">~${perMonth.toFixed(1)} leads/mo</span><span class="muted">quality ${ch.quality >= 1.2 ? 'excellent' : ch.quality >= 1 ? 'good' : ch.quality >= 0.85 ? 'mixed' : 'low'}</span></div>
            ${ch.passive ? '' : `<div class="row" style="gap:4px">${btn('channel', '−', { arg: id, arg2: lvl - 1, cls: 'sm', disabled: lvl <= 0 })}<span class="mono" style="min-width:3ch;text-align:center">${lvl}/${ch.maxLevel}</span>${btn('channel', '+', { arg: id, arg2: lvl + 1, cls: 'sm', disabled: locked || lvl >= ch.maxLevel })}</div>`}
          </div></div></div>`; }).join('')}</div>`;
  };

  // ---------- Office ----------
  U.tabOffice = function (s) {
    return `
      <div class="page-head"><h1>Office</h1><p>Headquarters in ${h(s.city.name)}: ${h(s.city.desc)}</p></div>
      <div class="grid auto">${D.OFFICES.map((o) => { const cur = o.id === s.office; const cost = o.id > s.office ? Math.round(o.rent * 3 * s.city.costOfLiving) : Math.round(D.OFFICES[s.office].rent * 1.5); return `<div class="card ${cur ? 'attention' : ''}"><div><h3>${h(o.name)} ${cur ? chip('Current', 'info') : ''}</h3><div class="small muted mono">${M(o.rent * s.city.costOfLiving)}/mo · ${o.cap} seats${o.rep ? ` · reputation +${o.rep}` : ''}</div></div><p class="small muted">${h(o.desc)}</p>${cur ? '' : `<div class="actions">${btn('office', o.id > s.office ? 'Move in' : 'Downsize', { arg: o.id, cls: 'sm', cost, disabled: o.id === 5 && s.tier < 4, title: o.id === 5 && s.tier < 4 ? 'Requires a statewide brand' : '' })}</div>`}</div>`; }).join('')}</div>
      <h2>Satellite offices <span class="muted small">${s.tier < 2 ? '(unlock at Established firm)' : `($60,000 to open, $9,000/mo, +12 seats, +45% leads each)`}</span></h2>
      <div class="grid auto">${D.CITIES.filter((c) => c.id !== s.cityId).map((c) => { const has = s.offices.find((o) => o.cityId === c.id); return `<div class="card ${has ? 'attention' : ''}"><div><h3>${h(c.name)} ${has ? chip('Open', 'good') : ''}</h3><div class="small muted">${h(c.pop)} · juries ${c.venue > 1.1 ? 'generous' : c.venue < 0.9 ? 'conservative' : 'average'} · trial backlog ${PI.weeksToText(c.backlog)}</div></div><p class="small muted">${h(c.desc)}</p>${has ? '' : `<div class="actions">${btn('open-office', 'Open office', { arg: c.id, cls: 'sm', cost: 60000, disabled: s.tier < 2 })}</div>`}</div>`; }).join('')}</div>`;
  };

  // ---------- Finance ----------
  U.tabFinance = function (s) {
    const o = F.monthlyOverhead(s);
    const fees30 = s.ledger.filter((l) => l.cat === 'fees' && l.day > s.day - 30).reduce((a, l) => a + l.amount, 0);
    const fees365 = s.ledger.filter((l) => l.cat === 'fees' && l.day > s.day - 365).reduce((a, l) => a + l.amount, 0);
    const spend365 = -s.ledger.filter((l) => l.amount < 0 && l.day > s.day - 365 && l.cat !== 'loan').reduce((a, l) => a + l.amount, 0);
    const costsOut = F.openCases(s).reduce((a, c) => a + c.costs, 0);
    const catName = { fees: 'Fee income', costs: 'Case cost', costs_recovered: 'Costs recovered', overhead: 'Overhead', payroll: 'Payroll', interest: 'Interest', marketing: 'Marketing', loan: 'Credit line', other: 'Other' };
    return `
      <div class="page-head"><h1>Finance</h1><p>Contingency practice is a cash-flow business: you advance every cost and get paid at the end. Costs out on open files right now: ${M(costsOut)}.</p></div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Cash</div><div class="kpi-value ${s.cash < 0 ? 'danger' : ''}">${M(s.cash)}</div></div>
        <div class="kpi"><div class="kpi-label">Line of credit</div><div class="kpi-value">${M(s.debt)}</div><div class="kpi-sub">of ${M(s.creditLimit)} · ${s.staffCounts.cfo ? '7.5' : '9.5'}% interest</div></div>
        <div class="kpi"><div class="kpi-label">Monthly overhead</div><div class="kpi-value">${M(o.total)}</div><div class="kpi-sub">${s.cash > 0 ? `${(s.cash / o.total).toFixed(1)} months of runway` : 'Running on credit'}</div></div>
        <div class="kpi"><div class="kpi-label">Fees, last 30 days</div><div class="kpi-value">${M(fees30)}</div><div class="kpi-sub">${M(fees365, { short: true })} trailing year</div></div>
        <div class="kpi"><div class="kpi-label">Spend, trailing year</div><div class="kpi-value">${M(spend365, { short: true })}</div><div class="kpi-sub">Net ${M(fees365 - spend365, { short: true })}</div></div>
      </div>
      <div class="grid cols-2">
        <div class="panel"><h3>Cash, last year</h3><canvas class="chart" id="cash-chart" width="600" height="160" aria-label="Cash history chart"></canvas></div>
        <div class="panel"><h3>Monthly overhead</h3><table><tr><td>Payroll and benefits${s.founderDraw ? ` <span class="small muted">(includes your ${M(s.founderDraw)} draw)</span>` : ''}</td><td class="num">${M(o.payroll)}</td></tr><tr><td>Rent</td><td class="num">${M(o.rent)}</td></tr><tr><td>Marketing</td><td class="num">${M(o.marketing)}</td></tr><tr><td>Malpractice insurance</td><td class="num">${M(o.insurance)}</td></tr><tr><td>Software and overhead</td><td class="num">${M(o.software)}</td></tr><tr><th>Total</th><th class="num">${M(o.total)}</th></tr></table></div>
      </div>
      <div class="grid cols-3">
        <div class="panel"><h3>Credit line</h3><div class="row"><input type="number" id="loan-amt" value="25000" step="5000" min="0" style="width:130px" aria-label="Amount"> ${btn('borrow', 'Draw', { cls: 'sm' })} ${btn('repay', 'Repay', { cls: 'sm', disabled: !s.debt })}</div><p class="small muted" style="margin-top:6px">Grows with reputation, firm tier and lifetime fees. The firm draws automatically when cash runs out.</p></div>
        <div class="panel"><h3>Owner's draw</h3><div class="row"><input type="number" id="draw-amt" value="${s.founderDraw}" step="500" min="0" style="width:130px" aria-label="Monthly draw"> ${btn('set-draw', 'Set', { cls: 'sm' })}</div><p class="small muted" style="margin-top:6px">What you pay yourself each month. Cut it to survive a dry spell; raise it when the fees arrive.</p></div>
        <div class="panel"><h3>Malpractice coverage</h3><label class="row"><input type="checkbox" data-act="policy" data-arg="insured" ${s.policy.insured ? 'checked' : ''}> Insured (${M(6500 * (s.modifiers.premiumMult || 1), { short: true })} per attorney per year)</label><p class="small muted" style="margin-top:6px">A blown statute without coverage comes out of the firm's pocket.</p></div>
      </div>
      <div class="panel flush table-wrap"><table><thead><tr><th>Date</th><th>Entry</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>${s.ledger.slice(0, 60).map((l) => `<tr><td class="mono small">${h(date(l.day))}</td><td>${h(l.label)}</td><td class="small muted">${h(catName[l.cat] || l.cat)}</td><td class="num ${l.amount > 0 ? 'good' : ''}">${l.amount > 0 ? '+' : ''}${M(l.amount)}</td></tr>`).join('')}</tbody></table></div>`;
  };

  U.drawCashChart = function (s, id) {
    const cv = document.getElementById(id || 'cash-chart');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const w = cv.width = cv.clientWidth * (window.devicePixelRatio || 1) || 600;
    const hgt = cv.height = 160 * (window.devicePixelRatio || 1);
    const cs = getComputedStyle(document.documentElement);
    const line = cs.getPropertyValue('--line').trim(), accent = cs.getPropertyValue('--accent').trim(), muted = cs.getPropertyValue('--muted').trim(), danger = cs.getPropertyValue('--danger').trim();
    const data = s.history.slice(-52);
    if (data.length < 2) { ctx.fillStyle = cs.getPropertyValue('--muted').trim(); ctx.font = `${12 * (window.devicePixelRatio || 1)}px ${cs.getPropertyValue('--font-ui')}`; ctx.fillText('The chart fills in as the weeks go by.', 12, 30 * (window.devicePixelRatio || 1)); return; }
    const vals = data.map((d) => d.cash - d.debt);
    let lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
    const pad = { l: 8, r: 8, t: 10, b: 20 };
    const X = (i) => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (hgt - pad.t - pad.b);
    ctx.clearRect(0, 0, w, hgt);
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (let g = 0; g <= 3; g++) { const y = pad.t + g * (hgt - pad.t - pad.b) / 3; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke(); }
    const zy = Y(0);
    ctx.strokeStyle = muted; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(pad.l, zy); ctx.lineTo(w - pad.r, zy); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(X(0), Y(vals[0]));
    vals.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(X(vals.length - 1), zy); ctx.lineTo(X(0), zy); ctx.closePath();
    ctx.fillStyle = accent; ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); vals.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v))));
    ctx.strokeStyle = vals[vals.length - 1] < 0 ? danger : accent; ctx.lineWidth = 2 * (window.devicePixelRatio || 1); ctx.stroke();
    ctx.fillStyle = muted; ctx.font = `${11 * (window.devicePixelRatio || 1)}px ${cs.getPropertyValue('--font-mono')}`;
    ctx.fillText(M(hi, { short: true }), pad.l + 4, pad.t + 12 * (window.devicePixelRatio || 1));
    ctx.fillText(M(lo, { short: true }), pad.l + 4, hgt - pad.b - 4);
    ctx.textAlign = 'right'; ctx.fillText('net of debt, ' + data.length + ' weeks', w - pad.r, hgt - 4);
  };

  // ---------- Firm ----------
  U.tabFirm = function (s) {
    const tier = D.TIERS[s.tier], next = D.TIERS[s.tier + 1];
    const f = F.founder(s);
    const partners = s.staff.filter((x) => x.isPartner && !x.isFounder);
    return `
      <div class="page-head"><h1>${h(s.firmName)}</h1><p>${h(tier.name)}. ${h(tier.desc)} Generation ${s.generation}${s.retired.length ? `, after ${s.retired.map((r) => h(r.name)).join(', ')}` : ''}.</p></div>
      <div class="grid cols-2">
        <div class="panel"><h3>${next ? `Next: ${h(next.name)}` : 'Dynasty achieved'}</h3>${next ? `<p class="small muted" style="margin-bottom:8px">${h(next.desc)} Unlocks ${h(next.unlocks.join(', ').toLowerCase())}.</p><table>${F.tierProgress(s, next).map((r) => `<tr><td>${h(r.label)}</td><td class="num mono">${h(r.text)}</td><td>${r.met ? chip('Met', 'good') : chip('Not yet')}</td></tr>`).join('')}</table>` : `<p>You built a national dynasty. Legacy score ${F.legacy(s).toLocaleString()}. The game continues for as long as you want to run it.</p>`}</div>
        <div class="panel"><h3>Leadership and succession</h3>
          <dl class="kv"><dt>Managing partner</dt><dd>${h(f.name)}, ${f.age}</dd><dt>Successor</dt><dd>${s.successorId ? h(F.staffById(s, s.successorId).name) : partners.length ? 'None named' : 'No partners yet. Promote an attorney to partner first.'}</dd><dt>Legacy score</dt><dd class="mono">${F.legacy(s).toLocaleString()}</dd></dl>
          <p class="small muted" style="margin:8px 0">The founder retires at 70. Without a named successor the firm dissolves at 72. A successor must be a partner.</p>
          <div class="actions">${partners.filter((p) => p.id !== s.successorId).map((p) => btn('successor', `Name ${h(p.name)}`, { arg: p.id, cls: 'sm' })).join('')}${f.age >= 55 && s.successorId ? btn('retire', 'Retire now and hand over', { cls: 'sm danger' }) : ''}</div>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="panel"><h3>How the firm runs</h3><p class="small muted" style="margin-bottom:10px">Sets how delegated attorneys and intake staff behave. Your own hands-on decisions can go either way, file by file.</p>
          <h4>Case philosophy</h4>
          <div class="options" style="margin:6px 0 12px">${[['volume', 'Volume shop', 'Demand on the bills to date as soon as liability is settled, take the first fair offer, move on. Fast cash, smaller fees per case, carriers learn you fold, clients who needed more treatment leave reviews.'], ['balanced', 'Balanced', 'Wait for MMI on most files, counter a few rounds, sue when the number is insulting.'], ['value', 'Maximum value', 'Specialists, surgery, full work-up, suit when the offer is short of value, a jury when it has to be. Slow money, bigger money, carriers reserve higher against you, clients refer their families.']].map(([id, name, desc]) => `<button class="btn ${s.strategy.philosophy === id ? 'primary' : ''}" data-act="strategy" data-arg="philosophy" data-arg2="${id}"><span>${name}</span><span class="desc">${desc}</span></button>`).join('')}</div>
          <h4>Intake selectivity</h4>
          <div class="options" style="margin:6px 0 0">${[['all', 'Sign everything with coverage', 'Every file consumes attorney hours and advanced costs. Weak cases drag the rest down.'], ['selective', 'Selective', 'Decline the tiny, the weak and the time-bombs; sign the rest.'], ['strong', 'Strong cases only', 'Clear liability, real injuries, no red flags. Fewer files, each one worth working.']].map(([id, name, desc]) => `<button class="btn ${s.strategy.selectivity === id ? 'primary' : ''}" data-act="strategy" data-arg="selectivity" data-arg2="${id}"><span>${name}</span><span class="desc">${desc}</span></button>`).join('')}</div>
        </div>
        <div class="panel"><h3>What the carriers think of you</h3><p class="small muted" style="margin-bottom:8px">Carrier reputation ${Math.round(s.carrierRep == null ? 30 : s.carrierRep)}/100. Every adjuster desk keeps a file on your firm: file suit and win verdicts and they pay; fold on lowballs and bluff limits demands and they stop taking you seriously.</p>
          ${Object.keys(s.carriers || {}).length ? `<div class="table-wrap"><table><thead><tr><th>Carrier</th><th>Attitude</th><th class="num">Closed</th><th class="num">Paid</th><th>Recent</th></tr></thead><tbody>${Object.entries(s.carriers).map(([id, k]) => { const ins = D.INSURERS.find((i) => i.id === id); if (!ins) return ''; const att = k.credibility >= 3 ? ['Respects the firm', 'good'] : k.credibility <= -3 ? ['Lowballs the firm', 'danger'] : ['Neutral', '']; return `<tr><td>${h(ins.name)}</td><td>${chip(att[0], att[1])}</td><td class="num">${k.cases}</td><td class="num">${M(k.paid, { short: true })}</td><td class="small muted">${k.notes.slice(0, 2).map((n) => h(n.why)).join(', ')}</td></tr>`; }).join('')}</tbody></table></div>` : '<div class="empty">No history with any carrier yet.</div>'}
        </div>
      </div>
      <div class="grid cols-2">
        <div class="panel"><h3>Firm policies</h3><div class="stack">
          <label class="row"><input type="checkbox" data-act="policy" data-arg="autoDelegate" ${s.policy.autoDelegate ? 'checked' : ''}> New files assigned to other attorneys are delegated to them</label>
          <label class="row"><input type="checkbox" data-act="policy" data-arg="pauseOnDecision" ${s.policy.pauseOnDecision ? 'checked' : ''}> Pause autoplay when a decision or event needs you</label>
          <label class="row"><input type="checkbox" data-act="policy" data-arg="autoIntake" ${s.policy.autoIntake ? 'checked' : ''}> Intake staff sign and decline leads automatically</label>
          <label class="row"><input type="checkbox" data-act="policy" data-arg="insured" ${s.policy.insured ? 'checked' : ''}> Carry malpractice insurance</label>
        </div><div class="actions" style="margin-top:10px">${btn('delegate-all', 'Delegate every open file', { cls: 'sm' })}${btn('handson-all', 'Take every file hands-on', { cls: 'sm' })}</div></div>
        <div class="panel"><h3>Record</h3><table>
          <tr><td>Lifetime fees</td><td class="num">${M(s.stats.feesEarned)}</td></tr><tr><td>Recovered for clients</td><td class="num">${M(s.stats.recovered)}</td></tr><tr><td>Cases resolved</td><td class="num">${s.stats.resolved}</td></tr><tr><td>Settled pre-suit / in litigation</td><td class="num">${s.stats.settledPreSuit} / ${s.stats.settledLit}</td></tr><tr><td>Trials (won / lost)</td><td class="num">${s.stats.trialWins} / ${s.stats.trialLosses}</td></tr><tr><td>Largest verdict</td><td class="num">${M(s.stats.biggestVerdict)}</td></tr><tr><td>Largest settlement</td><td class="num">${M(s.stats.biggestSettlement)}</td></tr><tr><td>Clients who fired the firm</td><td class="num">${s.stats.clientsLost}</td></tr><tr><td>Malpractice claims / bar complaints</td><td class="num">${s.stats.malpractice} / ${s.stats.barComplaints}</td></tr></table></div>
      </div>
      <div class="grid cols-2">
        <div class="panel"><h3>Milestones</h3>${s.achievements.length ? `<div class="timeline">${s.achievements.slice().reverse().map((a) => `<div class="entry good"><span class="when">${h(date(a.day))}</span><span class="what">${h(a.text)}</span></div>`).join('')}</div>` : '<div class="empty">None yet.</div>'}</div>
        <div class="panel"><h3>Year by year</h3>${s.yearbook.length ? `<div class="table-wrap"><table><thead><tr><th>Year</th><th class="num">Fees</th><th class="num">Resolved</th><th class="num">Staff</th><th class="num">Cash</th><th>Tier</th></tr></thead><tbody>${s.yearbook.slice().reverse().map((y) => `<tr><td class="mono">${y.year}</td><td class="num">${M(y.fees, { short: true })}</td><td class="num">${y.resolved}</td><td class="num">${y.staff}</td><td class="num">${M(y.cash, { short: true })}</td><td class="small">${h(D.TIERS[y.tier].name)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">The first year is not over yet.</div>'}</div>
      </div>`;
  };

  // ---------- Log ----------
  U.tabLog = function (s) {
    const kinds = [['all', 'Everything'], ['good', 'Good news'], ['bad', 'Bad news'], ['warn', 'Warnings'], ['stage', 'Milestones']];
    const rows = s.log.filter((l) => U.logFilter === 'all' || l.kind === U.logFilter);
    return `<div class="page-head"><h1>Firm log</h1></div><div class="row">${kinds.map(([k, n]) => `<button class="btn sm ${U.logFilter === k ? 'primary' : ''}" data-act="log-filter" data-arg="${k}">${n}</button>`).join('')}</div><div class="panel"><div class="timeline">${rows.map((l) => `<div class="entry ${l.kind}"><span class="when">${h(date(l.day))}</span><span class="what">${h(l.text)}</span></div>`).join('') || '<div class="empty">Quiet.</div>'}</div></div>`;
  };

  // ---------- Modals ----------
  U.renderModal = function () {
    const root = $('#modal-root');
    const m = U.modal;
    if (!m) { root.hidden = true; root.innerHTML = ''; return; }
    root.hidden = false;
    const s = U.state;
    const c = m.caseId ? s.cases.find((x) => x.id === m.caseId) : null;
    let html = '';
    if (m.type === 'demand' && c) {
      const est = C.estimate(s, c);
      const cap = C.collectible(s, c);
      const known = c.known.limits && !c.defendant.uninsured;
      const specials = C.specials(c);
      const read = C.carrierRead(s, c); const readMid = (read.lo + read.hi) / 2;
      const presets = [['Conservative', Math.round(readMid * 1.4 / 1000) * 1000], ['Standard', Math.round(readMid * 1.9 / 1000) * 1000], ['Aggressive', Math.round(readMid * 2.5 / 1000) * 1000]];
      if (known) presets.push(['Policy limits', c.defendant.limits]);
      const tlOk = known && C.effectiveLiability(c) >= 0.6 && est.mid >= c.defendant.limits * 0.7;
      html = `<h2>Demand: ${h(c.clientName)}</h2>
        <p class="muted">The demand anchors everything that follows. Ask too little and the carrier will happily pay it. Ask absurdly and they stop taking you seriously. ${known ? `Policy limits are <span class="mono">${M(c.defendant.limits)}</span>.` : 'Limits are undisclosed; you are negotiating blind.'}</p>
        <dl class="kv"><dt>Your valuation</dt><dd class="mono">${M(est.lo)} – ${M(est.hi)}</dd>${(() => { const r = C.carrierRead(s, c); const att = F.staffById(s, c.attorneyId); return `<dt>Your read on the carrier</dt><dd class="mono">${M(r.lo)} – ${M(r.hi)} <span class="small muted" style="font-family:var(--font-ui)">likely authority, judged by ${h(att ? att.name : 'the attorney')} (negotiation ${att ? att.skills.negotiation : 5}/10)</span></dd>`; })()}<dt>Billed medicals</dt><dd class="mono">${M(specials)}${c.treatment.mmi ? '' : ' <span class="warn" style="font-family:var(--font-ui)">and still treating: the carrier will discount an open injury</span>'}</dd><dt>Wage loss</dt><dd class="mono">${M(c.wage)}</dd><dt>Liability</dt><dd>${h(c.liability.determination || 'undetermined')}${c.liability.cf ? `, ${Math.round(c.liability.cf * 100)}% comparative fault alleged` : ''}</dd></dl>
        <p class="small muted">A demand around 1.5 to 2.5 times the carrier's likely authority leaves room to negotiate. Past 2.5 times, adjusters open lower and dig in; below it, they close fast and you leave money behind.</p>
        <div class="presets">${presets.map(([n, v]) => `<button class="btn sm" data-act="preset" data-arg="${v}">${n} <span class="cost">${M(v, { short: true })}</span></button>`).join('')}</div>
        <div class="amount-input"><span class="muted">$</span><input type="number" id="demand-amt" value="${presets[1][1]}" step="1000" min="1000"></div>
        ${known ? `<label class="row small"><input type="checkbox" id="demand-tl" ${!tlOk ? 'disabled' : ''}> Time-limited policy-limits demand (30 days). ${tlOk ? 'If the carrier fails to tender its limits in time, it becomes liable for any excess verdict.' : 'Only credible when liability is clear and the case is worth the policy.'}</label>` : ''}
        <div class="actions">${btn('send-demand', 'Send demand', { arg: c.id, cls: 'primary' })}${btn('close-modal', 'Not yet')}</div>`;
    } else if (m.type === 'offer' && c) {
      const n = c.negotiation;
      const est = C.estimate(s, c);
      const offer = n.currentOffer;
      const fee = Math.round(offer * c.feePct);
      const liens = c.liens.reduce((a, l) => a + l.amount, 0);
      const inLit = c.stage === 'litigation';
      const canFile = !(c.litigation && c.litigation.filed) && c.liability.determination != null;
      const needExpert = D.CASE_TYPES[c.type].expertRequired && !(c.litigation && c.litigation.experts.some((e) => D.EXPERTS[e].required));
      const steps = inLit && c.litigation.stepsOffer;
      html = `<h2>${offer ? `Offer: ${M(offer)}` : 'No offer'} <span class="muted small">· ${h(c.clientName)}</span></h2>
        <p class="muted">${offer ? `${n.finalOffer ? 'The carrier calls this final. ' : ''}${h((n.offers[n.offers.length - 1] || {}).note || '')}` : 'The carrier declined to put a number on the table.'} ${steps ? 'Trial starts Monday if you say no.' : ''}</p>
        ${(() => { const r = C.carrierRead(s, c); const pct = Math.round(offer / Math.max(1, est.mid) * 100); const lowball = offer < r.lo * 0.75; return `<div class="row small"><span class="chip ${pct >= 85 ? 'good' : pct >= 60 ? 'warn' : 'danger'}">${pct}% of your valuation</span><span class="muted">Your read on their authority: <span class="mono">${M(r.lo)} – ${M(r.hi)}</span>.</span>${lowball && !n.finalOffer ? '<span class="danger">Taking this now tells carriers your firm folds.</span>' : ''}</div>`; })()}
        <div class="grid cols-2"><dl class="kv"><dt>Your valuation</dt><dd class="mono">${M(est.lo)} – ${M(est.hi)}</dd><dt>Round</dt><dd>${n.round}${n.escalated ? ' (escalated)' : ''}</dd><dt>Statute</dt><dd>${c.litigation && c.litigation.filed ? 'Suit on file' : h(PI.daysToText(c.solDay - s.day))}</dd></dl>
        <dl class="kv"><dt>Fee if accepted</dt><dd class="mono">${M(fee)}</dd><dt>Costs reimbursed</dt><dd class="mono">${M(c.costs)}</dd><dt>Liens asserted</dt><dd class="mono">${M(liens)}</dd><dt>Client would net</dt><dd class="mono">about ${M(Math.max(0, offer - fee - c.costs - liens * 0.6))} after lien negotiation</dd></dl></div>
        ${n.offers.length > 1 ? `<div class="table-wrap"><table class="offer-table small">${n.offers.slice(-6).map((o) => `<tr><td>${h(date(o.day))}</td><td>${o.from === 'firm' ? 'You' : 'Carrier'}</td><td class="num">${o.amount ? M(o.amount) : 'no offer'}</td></tr>`).join('')}</table></div>` : ''}
        <div class="amount-input"><span class="muted">Counter at $</span><input type="number" id="counter-amt" value="${Math.round(Math.max(offer * 1.35, est.mid) / 1000) * 1000}" step="1000"></div>
        <div class="options">
          ${offer ? `<button class="btn primary" data-act="offer-accept" data-arg="${c.id}"><span>Accept ${M(offer)}</span><span class="desc">Release signed; funds in a few weeks; liens negotiated at disbursement.</span></button>` : ''}
          ${!(steps) ? `<button class="btn" data-act="offer-counter" data-arg="${c.id}"><span>Counter</span><span class="desc">Send the number above. The carrier responds in one to three weeks.${!inLit && n.finalOffer ? ' After a "final" offer, expect little movement.' : ''}</span></button>` : ''}
          ${!inLit && !n.escalated && n.round > 0 ? `<button class="btn" data-act="offer-escalate" data-arg="${c.id}"><span>Escalate to supervisor</span><span class="desc">One shot per case. Puts the carrier on notice of bad faith and usually shakes loose a few more points.</span></button>` : ''}
          ${canFile ? `<button class="btn ${needExpert ? '' : 'urgent'}" data-act="offer-file" data-arg="${c.id}" ${needExpert ? 'disabled' : ''}><span>File suit</span><span class="desc">${needExpert ? 'Requires a pre-suit expert review first (retain the required expert from the case file).' : 'Filing fee, 40% fee, one to two years of litigation, and a reserve that climbs as defense costs mount.'}</span></button>` : ''}
          ${inLit ? `<button class="btn ${steps ? 'danger' : ''}" data-act="offer-reject" data-arg="${c.id}"><span>${steps ? 'Reject and try the case' : 'Reject and keep litigating'}</span><span class="desc">${steps ? `Twelve strangers decide. Win probability depends on liability, credibility and your trial lawyer.` : 'Discovery continues. Expect the next number at mediation or on the courthouse steps.'}</span></button>` : ''}
        </div>
        <div class="actions">${btn('close-modal', 'Decide later')}</div>`;
    } else if (m.type === 'liens' && c) {
      const st = C.statement(s, c);
      html = `<h2>Liens on ${M(c.settlement.gross)} settlement</h2>
        <p class="muted">Everyone who paid a medical bill wants to be repaid from the recovery. Every dollar you cut goes to the client, and a client who nets real money sends referrals.</p>
        <div class="table-wrap"><table><thead><tr><th>Holder</th><th>Type</th><th class="num">Asserted</th></tr></thead><tbody>${c.liens.map((l) => `<tr><td>${h(l.holder)}</td><td class="small">${h(D.LIEN_TYPES[l.type].name)}<div class="muted">${h(D.LIEN_TYPES[l.type].desc)}</div></td><td class="num">${M(l.amount)}</td></tr>`).join('')}</tbody></table></div>
        <dl class="kv"><dt>Gross</dt><dd class="mono">${M(st.gross)}</dd><dt>Fee</dt><dd class="mono">${M(st.fee)}</dd><dt>Costs</dt><dd class="mono">${M(st.costs)}</dd><dt>Liens as asserted</dt><dd class="mono">${M(st.liens)}</dd><dt>Client nets if paid as billed</dt><dd class="mono ${st.net < st.liens ? 'warn' : ''}">${M(st.net)}${st.feeCut ? ` <span class="small muted">(your fee would be cut by ${M(st.feeCut)})</span>` : ''}</dd></dl>
        <div class="options">
          <button class="btn primary" data-act="liens-negotiate" data-arg="${c.id}"><span>Negotiate every lien</span><span class="desc">Two to six weeks. Reductions of 20% to 60% depending on the lienholder${s.staffCounts.lien ? ' and your lien negotiator' : ''}.</span></button>
          <button class="btn" data-act="liens-pay" data-arg="${c.id}"><span>Pay as billed</span><span class="desc">Fast disbursement, smaller check for the client.</span></button>
        </div>`;
    } else if (m.type === 'event') {
      const ev = s.events.find((e) => e.uid === m.uid);
      if (!ev) { U.modal = null; return U.renderModal(); }
      html = `<h2>${h(ev.title)}</h2><p>${h(ev.text)}</p><div class="options">${ev.options.map((o, i) => `<button class="btn ${i === 0 ? 'primary' : ''}" data-act="event-opt" data-arg="${ev.uid}" data-arg2="${i}"><span>${h(o.label)}</span>${o.desc ? `<span class="desc">${h(o.desc)}</span>` : ''}</button>`).join('')}</div>`;
    } else if (m.type === 'train') {
      const st = F.staffById(s, m.staffId);
      const keys = ['negotiation', 'litigation', 'client', 'organization', 'intake', 'investigation', 'marketing', 'management'];
      html = `<h2>Train ${h(st.name)}</h2><p class="muted">A seminar, a trial college or a mentor. One skill point for ${M(2500 + st.trained * 1500)}.</p><div class="options">${keys.map((k) => `<button class="btn" data-act="train-skill" data-arg="${st.id}" data-arg2="${k}" ${st.skills[k] >= 10 ? 'disabled' : ''}><span>${k[0].toUpperCase() + k.slice(1)} ${st.skills[k]} → ${Math.min(10, st.skills[k] + 1)}</span></button>`).join('')}</div><div class="actions">${btn('close-modal', 'Cancel')}</div>`;
    } else if (m.type === 'confirm') {
      html = `<h2>${h(m.title)}</h2><p>${h(m.text)}</p><div class="actions">${btn('confirm-yes', h(m.yes || 'Confirm'), { cls: 'danger' })}${btn('close-modal', 'Cancel')}</div>`;
    } else if (m.type === 'menu') {
      html = `<h2>Menu</h2>
        <div class="options">
          <button class="btn primary" data-act="help"><span>How to play and how to win</span><span class="desc">The levers that matter and the trade-offs behind them.</span></button>
          <button class="btn" data-act="save"><span>Save game</span><span class="desc">Saved in this browser. The game also autosaves every week.</span></button>
          <button class="btn" data-act="export"><span>Copy save to clipboard</span><span class="desc">A text blob you can paste into another browser.</span></button>
          <button class="btn" data-act="show-import"><span>Import a save</span><span class="desc">Paste a save blob below.</span></button>
          <button class="btn danger" data-act="new-game-confirm"><span>Start a new firm</span><span class="desc">Abandons the current game.</span></button>
        </div>
        <textarea id="import-text" rows="4" placeholder="Paste a save here, then press Import" style="width:100%"></textarea>
        <div class="actions">${btn('import', 'Import')}${btn('close-modal', 'Close')}</div>
        <p class="small muted">Contingency is a simulation. Insurers, courts and cities are fictional. Nothing here is legal advice.</p>`;
    } else if (m.type === 'help') {
      html = `<h2>How to play</h2>
        <div class="stack" style="gap:12px">
          <p><strong>You get paid at the end.</strong> A third of the recovery pre-suit, forty percent after you file. You advance every cost. Cash is the constraint; the line of credit is the cushion.</p>
          <p><strong>Not every case is worth signing.</strong> Each file eats attorney hours. An overloaded attorney moves every file slower, clients stop hearing back, deadlines slip and bar complaints follow. Each lead shows the fee it might produce, the costs you will front and the load it adds. Weak liability, uninsured defendants, minimum policies and difficult clients are how firms lose money.</p>
          <p><strong>Treatment is the case.</strong> Value is built on medical bills and what the doctors say. Watch the treatment column: treating, in a gap, or at maximum medical improvement (MMI). Waiting for MMI, referring to specialists and following a surgery recommendation raise the value. Demanding before MMI gets money in months instead of years, at a steep discount, and the client signs away future care. Some of them come back angry.</p>
          <p><strong>Evidence changes the carrier's mind.</strong> Police reports, witnesses, video and scene inspections raise liability strength and cut comparative fault, but only if they are in hand before the adjuster decides, or you submit them and ask for a second look. Video gets overwritten within weeks; preservation letters go out first. An investigator on staff does this for free, every week, on every file.</p>
          <p><strong>Demands have a right size.</strong> Your attorney's read on the carrier's authority gets sharper with negotiation skill. Ask around 1.5 to 2.5 times that read. Ask too little and they pay it. Ask too much and they open low, dig in and stop taking your letters seriously.</p>
          <p><strong>Reviews run the marketing.</strong> Closed cases leave reviews. Callers read them before they dial, so a two-star firm gets a fraction of the calls per ad dollar that a four-star firm gets, and the good callers hang up sooner. Fast, cheap settlements and ignored clients write the one-star reviews.</p>
          <p><strong>Two reputations.</strong> Street reputation comes from satisfied clients, referrals, community and advertising; it brings leads. Carrier reputation comes from what you do with offers: fold early and every adjuster in town lowballs you; file suits and win verdicts and they reserve higher against your letterhead before you say a word.</p>
          <p><strong>Pick a kind of firm.</strong> A volume shop signs widely, settles early and lives on marketing and headcount. A boutique signs strong cases, works them up fully and lives on referrals and verdicts. Both can make money. The Firm tab sets how your delegated attorneys and intake staff behave; your own hands-on files can go either way.</p>
          <p><strong>The clock.</strong> Every claim has a statute of limitations. Suit must be on file before it runs or the case dies and the client sues you. Government claims need a notice of claim within months.</p>
        </div>
        <div class="actions">${btn('close-modal', 'Got it')}</div>`;
    } else if (m.type === 'gameover') {
      html = `<h2>${s.gameOver.kind === 'bankrupt' ? 'The firm is insolvent' : 'The firm has dissolved'}</h2><p>${h(s.gameOver.text)}</p><table><tr><td>Years in practice</td><td class="num">${(s.week / 52).toFixed(1)}</td></tr><tr><td>Lifetime fees</td><td class="num">${M(s.stats.feesEarned)}</td></tr><tr><td>Recovered for clients</td><td class="num">${M(s.stats.recovered)}</td></tr><tr><td>Cases resolved</td><td class="num">${s.stats.resolved}</td></tr><tr><td>Highest tier</td><td>${h(D.TIERS[s.tier].name)}</td></tr></table><div class="actions">${btn('new-game', 'Start a new firm', { cls: 'primary' })}</div>`;
    }
    root.innerHTML = `<div class="modal ${m.type === 'offer' || m.type === 'liens' ? 'wide' : ''}" role="dialog">${html}</div>`;
  };

  // ---------- New game ----------
  U.renderNewGame = function (hasSave) {
    const ng = U.ng = U.ng || { founderName: '', firmName: '', backgroundId: 'defense', cityId: 'riverton' };
    $('#app').innerHTML = `<div class="newgame">
      <div class="masthead"><div class="small muted" style="text-transform:uppercase;letter-spacing:0.12em">A personal injury law firm simulation</div><h1>Contingency</h1><p class="sub">You get paid only when the client does. Sign the right cases, build the file, treat the client right, demand the number, fight the adjuster, and know when to pick a jury. Start alone in a spare bedroom. End with your name on a tower and a successor in your chair.</p></div>
      ${hasSave ? `<div class="panel row between"><div><strong>A saved firm exists in this browser.</strong><div class="small muted">Pick up where you left off.</div></div>${btn('continue', 'Continue', { cls: 'primary' })}</div>` : ''}
      <div class="panel"><h3>Your name on the door</h3><div class="form-row"><label>Your name<input id="ng-founder" value="${h(ng.founderName)}" placeholder="e.g. Jordan Reyes"></label><label>Firm name<input id="ng-firm" value="${h(ng.firmName)}" placeholder="e.g. Reyes Injury Law"></label></div></div>
      <div class="panel"><h3>Where you came from</h3><div class="choice-grid">${D.FOUNDER_BACKGROUNDS.map((b) => `<button class="choice ${ng.backgroundId === b.id ? 'on' : ''}" data-act="ng-bg" data-arg="${b.id}"><span class="name">${h(b.name)}</span><span class="desc">${h(b.desc)}</span><span class="small mono">Starts with ${M(b.cash)} · negotiation ${b.skills.negotiation}, litigation ${b.skills.litigation}, client ${b.skills.client}</span></button>`).join('')}</div></div>
      <div class="panel"><h3>Where you hang your shingle</h3><div class="choice-grid">${D.CITIES.map((c) => `<button class="choice ${ng.cityId === c.id ? 'on' : ''}" data-act="ng-city" data-arg="${c.id}"><span class="name">${h(c.name)}</span><span class="desc">${h(c.desc)}</span><span class="small mono">Juries ${c.venue > 1.1 ? 'generous' : c.venue < 0.9 ? 'conservative' : 'average'} · leads ${c.leadBase >= 1.1 ? 'plentiful' : c.leadBase < 0.8 ? 'scarce' : 'steady'} · rent ${c.costOfLiving > 1.1 ? 'high' : c.costOfLiving < 0.9 ? 'low' : 'average'}</span></button>`).join('')}</div></div>
      <div class="row between"><p class="small muted">Everything in the game is fictional. Carriers, courts, and the cities are invented.</p>${btn('ng-start', 'Open the firm', { cls: 'primary' })}</div>
    </div>`;
  };

  U.renderAll = function () {
    if (!U.state) return;
    U.renderTopbar(); U.renderRail(); U.renderTab(); U.renderDrawer(); U.renderModal();
  };
})();
