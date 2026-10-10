/* Contingency: the firm layer. State creation, the weekly tick, staff, marketing, leads, money, events and the dynasty arc. */
(function () {
  const PI = (globalThis.PI = globalThis.PI || {});
  const D = PI.DATA;
  const R = PI.rng;
  const C = PI.Cases;
  const F = (PI.Firm = {});
  F.SAVE_VERSION = 1;

  // ---------- Creation ----------
  function makeSkills(role, level) {
    const s = { negotiation: 3, litigation: 3, client: 3, organization: 3, intake: 3, investigation: 3, marketing: 3, management: 3 };
    const def = D.ROLES[role];
    for (const k of Object.keys(s)) s[k] = PI.clamp(Math.round(R.gauss(level - 1.5, 1.2)), 1, 10);
    for (const k of def.skills) s[k] = PI.clamp(Math.round(R.gauss(level, 1.1)), 1, 10);
    return s;
  }
  F.makeStaff = function (state, role, level, opts) {
    opts = opts || {};
    const def = D.ROLES[role];
    const skills = opts.skills || makeSkills(role, level || 5);
    const primary = def.skills.reduce((a, k) => a + skills[k], 0) / def.skills.length;
    const salary = Math.round((def.salary[0] + (def.salary[1] - def.salary[0]) * PI.clamp((primary - 2) / 8, 0, 1)) * (state ? state.city.costOfLiving : 1) * R.range(0.92, 1.08) / 1000) * 1000;
    return { id: PI.uid('st'), name: opts.name || C.personName(), role, title: def.name, skills, salary: opts.salary != null ? opts.salary : salary, morale: 75, hiredDay: state ? state.day : 0, isFounder: !!opts.isFounder, isPartner: !!opts.isPartner, resolved: 0, feesGenerated: 0, age: opts.age || R.int(24, 58), trained: 0 };
  };

  F.newGame = function (opts) {
    R.seed(opts.seed || Math.floor(Math.random() * 2 ** 31));
    const city = D.CITIES.find((c) => c.id === opts.cityId) || D.CITIES[1];
    const bg = D.FOUNDER_BACKGROUNDS.find((b) => b.id === opts.backgroundId) || D.FOUNDER_BACKGROUNDS[0];
    const state = {
      version: F.SAVE_VERSION, seed: opts.seed, firmName: opts.firmName || 'Law Office of ' + opts.founderName, founderName: opts.founderName, city, cityId: city.id,
      day: 0, week: 0, cash: bg.cash, debt: 0, creditLimit: 60000, reputation: 18, carrierRep: 30, reviews: { sum: 0, n: 0, recent: [] }, carriers: {}, strategy: { philosophy: 'balanced', selectivity: 'selective' }, generation: 1, founderDraw: 3500,
      office: 0, offices: [], staff: [], candidates: [], cases: [], leads: [], marketing: {}, channelSince: {},
      policy: { autoDelegate: true, autoAssign: true, insured: true, pauseOnDecision: true, autoIntake: false },
      stats: { feesEarned: 0, recovered: 0, resolved: 0, signed: 0, declined: 0, trials: 0, trialWins: 0, trialLosses: 0, biggestVerdict: 0, biggestSettlement: 0, settledPreSuit: 0, settledLit: 0, clientsLost: 0, malpractice: 0, barComplaints: 0, leadsLost: 0, leadsTotal: 0 },
      ledger: [], history: [], log: [], news: [], events: [], tier: 0, achievements: [], referralCredits: 0, modifiers: {}, pendingLiens: [], yearbook: [], successorId: null, retired: [], staffCounts: {}, gameOver: null, started: true
    };
    const founder = F.makeStaff(state, 'attorney', 6, { name: opts.founderName, isFounder: true, isPartner: true, skills: Object.assign({ organization: 4, intake: 5, investigation: 4, marketing: 4 }, bg.skills), salary: 0, age: bg.age });
    founder.title = 'Founding partner';
    founder.background = bg.id;
    state.staff.push(founder);
    state.marketing = { seo: 1 };
    state.channelSince.seo = 0;
    F.refreshCandidates(state);
    for (let i = 0; i < 3; i++) state.leads.push(C.generateLead(state, i === 0 ? 'referral' : 'seo'));
    F.seedStartingCases(state, bg);
    F.log(state, `${state.firmName} opens its doors in ${city.name}. ${bg.name}: ${bg.desc}`, 'stage');
    F.recount(state);
    F.snapshot(state);
    return state;
  };

  // The founder brings a few files from their old job, already partway through their life cycle.
  F.seedStartingCases = function (state, bg) {
    const ages = bg.id === 'grad' ? [10, 4] : [34, 20, 8];
    for (const weeksAgo of ages) {
      const realDay = state.day, realWeek = state.week;
      state.day = realDay - weeksAgo * 7; state.week = realWeek - weeksAgo;
      let lead = C.generateLead(state, 'referral');
      let tries = 0;
      const wantSev = weeksAgo === ages[0] ? 2 : null;
      while ((lead.severity > 2 || (wantSev && lead.severity !== wantSev) || lead.defendant.uninsured || D.CASE_TYPES[lead.type].expertRequired || lead.noticeDay || lead.liability.bucket === 'weak') && tries++ < 40) lead = C.generateLead(state, 'referral');
      // Make sure the statute is comfortably in the future once we fast-forward to today.
      const minIncident = realDay - 240;
      if (lead.incidentDay < minIncident) { lead.incidentDay = minIncident; lead.solDay = lead.incidentDay + D.CASE_TYPES[lead.type].sol; }
      lead.timeline = [];
      state.leads.push(lead);
      const c = F.signLead(state, lead.id, F.founder(state).id);
      c.delegated = false;
      C.log(state, c, 'File brought over from your previous firm with the client\'s written consent.');
      const ctx = { speed: 1, para: 1, cm: 0, inv: false, lien: false };
      for (let w = 0; w < weeksAgo; w++) {
        state.day += 7; state.week++;
        if (c.pending) break;
        C.weekly(state, c, ctx);
        if (!C.isOpen(c)) break;
      }
      state.day = realDay; state.week = realWeek;
      if (!C.isOpen(c)) { state.cases.splice(state.cases.indexOf(c), 1); state.stats.signed--; }
    }
  };

  // ---------- Helpers ----------
  F.founder = (state) => state.staff.find((s) => s.isFounder);
  // Online reviews. Until a firm has a few, callers assume about four stars.
  // Recent reviews count for more: a one-star review is half as loud after a year. A reformed firm can climb back; it just takes time.
  F.stars = function (state) {
    const r = state.reviews || { sum: 0, n: 0, recent: [] };
    if (r.n < 3) return 4.0;
    let ws = 0, wt = 0;
    for (const rv of r.recent || []) { const w = Math.pow(0.5, (state.day - rv.day) / 365); ws += w * rv.stars; wt += w; }
    // Reviews older than the stored window are a faded background average.
    const olderN = r.n - (r.recent || []).length;
    if (olderN > 0) { const olderAvg = (r.sum - (r.recent || []).reduce((a, x) => a + x.stars, 0)) / olderN; const w = Math.min(olderN, 10) * 0.15; ws += w * olderAvg; wt += w; }
    return wt ? ws / wt : 4.0;
  };
  F.addReview = function (state, stars, who, why) { state.reviews = state.reviews || { sum: 0, n: 0, recent: [] }; state.reviews.sum += stars; state.reviews.n++; state.reviews.recent.unshift({ day: state.day, stars, who, why }); if (state.reviews.recent.length > 60) state.reviews.recent.pop(); };
  // How much of every marketing dollar actually turns into a phone call, given the reviews.
  F.marketingEffect = function (state) { return PI.clamp(0.04 + 1.11 * Math.pow(PI.clamp((F.stars(state) - 1) / 3, 0, 1.33), 1.6), 0.04, 1.2); };
  // Each carrier keeps a file on the firm.
  F.carrier = function (state, id) { state.carriers = state.carriers || {}; return state.carriers[id] || (state.carriers[id] = { credibility: 0, cases: 0, paid: 0, filed: 0, notes: [] }); };
  F.carrierNote = function (state, id, delta, why) { const k = F.carrier(state, id); k.credibility = PI.clamp(k.credibility + delta, -10, 10); k.notes.unshift({ day: state.day, delta, why }); if (k.notes.length > 8) k.notes.pop(); };
  F.staffById = (state, id) => state.staff.find((s) => s.id === id);
  F.attorneys = (state) => state.staff.filter((s) => s.role === 'attorney' || s.role === 'trial');
  F.openCases = (state) => state.cases.filter(C.isOpen);
  F.caseload = (state, attId) => state.cases.filter((c) => C.isOpen(c) && c.attorneyId === attId);
  F.recount = function (state) {
    const counts = {};
    for (const s of state.staff) counts[s.role] = (counts[s.role] || 0) + 1;
    state.staffCounts = counts;
  };
  F.log = function (state, text, kind) {
    state.log.unshift({ day: state.day, text, kind: kind || 'info' });
    if (state.log.length > 300) state.log.pop();
  };
  F.news = function (state, text) { state.news.unshift({ day: state.day, text }); if (state.news.length > 40) state.news.pop(); };
  F.spend = function (state, amount, label, cat) {
    if (!amount) return;
    state.cash -= amount;
    state.ledger.unshift({ day: state.day, amount: -amount, label, cat: cat || 'other' });
    if (state.ledger.length > 600) state.ledger.pop();
  };
  F.earn = function (state, amount, label, cat) {
    if (!amount) return;
    state.cash += amount;
    state.ledger.unshift({ day: state.day, amount, label, cat: cat || 'other' });
    if (state.ledger.length > 600) state.ledger.pop();
  };
  F.adjustRep = (state, d) => { state.reputation = PI.clamp(state.reputation + d, 0, 100); };
  F.gainSkill = function (state, st, k) { if (st.skills[k] < 10) { st.skills[k]++; F.log(state, `${st.name}'s ${k} improved to ${st.skills[k]}.`); } };
  F.malpractice = function (state, c) {
    state.stats.malpractice++;
    const exposure = Math.round(C.expectedValue(state, c) * R.range(0.4, 0.9));
    if (state.policy.insured) { F.spend(state, 10000, `Malpractice deductible (${c.clientName})`, 'overhead'); F.log(state, `Malpractice claim by ${c.clientName}. Carrier paid ${PI.money(exposure)}; you paid the $10,000 deductible and your premium will rise.`, 'bad'); state.modifiers.premiumMult = (state.modifiers.premiumMult || 1) * 1.4; }
    else { F.spend(state, exposure, `Malpractice settlement (${c.clientName})`, 'overhead'); F.log(state, `Uninsured malpractice claim by ${c.clientName}. Settled for ${PI.money(exposure)} out of pocket.`, 'bad'); }
    F.adjustRep(state, -5);
    F.barComplaint(state, `${c.clientName} reported the blown deadline to the state bar.`);
  };
  F.barComplaint = function (state, text) {
    state.stats.barComplaints++;
    state.barHeat = (state.barHeat || 0) + 1;
    F.log(state, `Bar complaint: ${text}`, 'bad');
    F.adjustRep(state, -1);
  };
  // The state bar notices patterns. Heat decays by about two and a half complaints a year.
  F.barLevel = function (state) { const h = state.barHeat || 0; return h < 3 ? ['Clean', ''] : h < 6 ? ['A few complaints on file', 'warn'] : h < 10 ? ['Under investigation', 'danger'] : ['Disbarment proceedings looming', 'danger']; };
  F.weeklyBar = function (state) {
    state.barHeat = Math.max(0, (state.barHeat || 0) - 0.05);
    const h = state.barHeat;
    const f = F.founder(state);
    if (h >= 16) { state.gameOver = { kind: 'disbarred', text: `The state bar disbarred ${f.name} after a pattern of client neglect, missed deadlines and solicitation complaints. Without a licensed managing partner, ${state.firmName} was wound up and its files referred out. Legacy score: ${F.legacy(state).toLocaleString()}.` }; F.log(state, `${f.name} has been disbarred.`, 'bad'); return; }
    if (h >= 10 && (!state.lastSuspensionWeek || state.week - state.lastSuspensionWeek > 52)) {
      state.lastSuspensionWeek = state.week;
      f.suspendedUntil = state.day + 180;
      state.barHeat -= 2;
      F.addReview(state, 1, 'Local news', 'managing partner suspended by the state bar');
      F.adjustRep(state, -10);
      F.news(state, `State bar suspends ${f.name} of ${state.firmName} for six months over client neglect.`);
      F.log(state, `The state bar suspended ${f.name} for 180 days. The pattern of complaints is now public. Next time it will be disbarment.`, 'bad');
      return;
    }
    if (h >= 5 && (!state.lastHearingWeek || state.week - state.lastHearingWeek > 26) && !state.events.find((e) => e.id === 'bar_hearing')) { state.lastHearingWeek = state.week; F.queueEvent(state, 'bar_hearing'); }
  };
  F.achieve = function (state, id, text) { if (state.achievements.find((a) => a.id === id)) return; state.achievements.push({ id, text, day: state.day }); F.log(state, `Milestone: ${text}`, 'stage'); };

  F.capacity = function (state, st) {
    const def = D.ROLES[st.role];
    let cap = def.capacity;
    if (st.isFounder) {
      const admin = Math.max(0, (state.staff.length - 1) / 4);
      cap -= state.staffCounts.office || state.staffCounts.cfo ? admin * 0.3 : admin;
      cap += (st.skills.management - 5) * 0.3;
    }
    if (st.suspendedUntil && state.day < st.suspendedUntil) cap = 0;
    if (st.sickUntil && state.day < st.sickUntil) cap *= 0.4;
    return Math.max(1, cap);
  };

  F.officeCap = function (state) {
    return D.OFFICES[state.office].cap + state.offices.length * 12;
  };

  // ---------- The weekly tick ----------
  F.tick = function (state) {
    if (state.gameOver) return;
    state.week++;
    state.day += 7;
    F.recount(state);
    const prevMonth = PI.monthOf(state.day - 7), month = PI.monthOf(state.day);
    const prevYear = PI.yearOf(state.day - 7), year = PI.yearOf(state.day);

    // Capacity planning per attorney.
    const open = F.openCases(state);
    const paralegalPts = (state.staffCounts.paralegal || 0) * 8;
    const paraFactor = 1 + 0.65 * Math.min(1, paralegalPts / Math.max(1, open.length * 0.9));
    const cmCoverage = Math.min(1, ((state.staffCounts.casemgr || 0) * 28) / Math.max(1, open.length));
    const ctxBase = { para: paraFactor, cm: cmCoverage, inv: !!state.staffCounts.investigator, lien: !!state.staffCounts.lien };
    const loads = {};
    for (const c of open) {
      if (!c.attorneyId || !F.staffById(state, c.attorneyId)) c.attorneyId = F.leastLoaded(state).id;
      loads[c.attorneyId] = (loads[c.attorneyId] || 0) + C.workNeed(c) * (c.flags.includes('language') ? 1.2 : 1);
    }
    state.loads = {};
    const attCount = Math.max(1, F.attorneys(state).length);
    const support = Math.min(6, ((state.staffCounts.paralegal || 0) * 4 + (state.staffCounts.casemgr || 0) * 2) / attCount);
    for (const att of F.attorneys(state)) {
      const cap = F.capacity(state, att) + support;
      const need = loads[att.id] || 0;
      const speed = need <= cap ? 1 : PI.clamp(cap / need, 0.15, 1);
      state.loads[att.id] = { cap, need, speed };
      if (!att.isFounder) { if (speed < 0.7) att.morale -= 2.5; else if (speed < 0.9) att.morale -= 0.8; else att.morale += 0.4; }
    }
    // Court closures freeze litigation.
    const courtsClosed = state.modifiers.courtsClosedUntil && state.day < state.modifiers.courtsClosedUntil;
    for (const c of open) {
      const ld = state.loads[c.attorneyId] || { speed: 1 };
      const ctx = Object.assign({ speed: ld.speed }, ctxBase);
      if (courtsClosed && c.stage === 'litigation') continue;
      C.weekly(state, c, ctx);
    }

    // Leads.
    F.generateLeads(state);
    F.processLeadQueue(state);

    // Money.
    F.weeklyExpenses(state);

    // Staff.
    F.weeklyStaff(state);

    // The bar.
    F.weeklyBar(state);
    if (state.gameOver) { F.snapshot(state); return; }

    // Events.
    F.rollEvents(state);

    // Deferred fee liens from clients who left.
    for (const pl of state.pendingLiens.slice()) {
      if (state.day >= pl.due) { state.pendingLiens.splice(state.pendingLiens.indexOf(pl), 1); if (R.chance(0.55)) { F.earn(state, pl.amount, `Quantum meruit fee lien paid: ${pl.name}`, 'fees'); state.stats.feesEarned += pl.amount; F.log(state, `Successor counsel honored your fee lien on ${pl.name}: ${PI.money(pl.amount)}.`, 'good'); } }
    }

    if (month !== prevMonth) F.monthly(state);
    if (year !== prevYear) F.yearly(state, prevYear);
    F.checkTier(state);
    F.checkAchievements(state);
    F.snapshot(state);
    F.checkGameOver(state);
  };

  F.snapshot = function (state) {
    const open = F.openCases(state);
    const fees4 = state.ledger.filter((l) => l.cat === 'fees' && l.day > state.day - 28).reduce((a, l) => a + l.amount, 0);
    state.history.push({ day: state.day, cash: Math.round(state.cash), debt: state.debt, open: open.length, fees4, rep: Math.round(state.reputation), staff: state.staff.length });
    if (state.history.length > 600) state.history.shift();
  };

  F.leastLoaded = function (state) {
    const atts = F.attorneys(state);
    let best = atts[0], bestRatio = Infinity;
    for (const a of atts) {
      const ratio = F.caseload(state, a.id).reduce((s, c) => s + C.workNeed(c), 0) / F.capacity(state, a);
      if (ratio < bestRatio) { bestRatio = ratio; best = a; }
    }
    return best;
  };

  // ---------- Leads and intake ----------
  F.channelLeadsPerWeek = function (state, chId) {
    const ch = D.CHANNELS[chId];
    const lvl = state.marketing[chId] || 0;
    if (!lvl && !ch.passive) return 0;
    let perMonth = ch.leads * Math.pow(lvl, 0.85);
    if (ch.ramp) { const weeks = state.week - (state.channelSince[chId] || 0); perMonth *= PI.clamp(0.25 + weeks / ch.ramp, 0.25, 1); }
    if (chId === 'seo' && state.modifiers.seoPenaltyUntil && state.day < state.modifiers.seoPenaltyUntil) perMonth *= 0.5;
    const mk = state.staff.find((s) => s.role === 'marketing');
    if (mk) perMonth *= 1 + mk.skills.marketing * 0.03;
    perMonth *= state.city.leadBase * (1 + state.offices.length * 0.45);
    perMonth *= 0.8 + state.reputation / 100 * 0.4;
    perMonth *= F.marketingEffect(state); // one-star firms pay for ads nobody answers
    if (state.modifiers.leadMultUntil && state.day < state.modifiers.leadMultUntil) perMonth *= state.modifiers.leadMult || 1;
    return perMonth / 4.33;
  };
  F.generateLeads = function (state) {
    const newLeads = [];
    for (const chId of Object.keys(D.CHANNELS)) {
      const ch = D.CHANNELS[chId];
      let n = ch.passive ? 0 : F.channelLeadsPerWeek(state, chId);
      if (chId === 'referral') {
        n = 0.2 + (state.reputation / 100) * 0.9;
        if (state.referralCredits > 0 && R.chance(0.5)) { state.referralCredits--; n += 1; }
      }
      let count = Math.floor(n);
      if (R.chance(n - count)) count++;
      for (let i = 0; i < count; i++) newLeads.push(C.generateLead(state, chId));
    }
    state.stats.leadsTotal += newLeads.length;
    state.leads.push(...newLeads);
    state.lastWeekLeads = newLeads.length;
  };
  F.intakeCapacity = function (state) {
    let cap = (state.staffCounts.intake || 0) * 9 + F.attorneys(state).length * 1.5 + (state.staffCounts.casemgr || 0) * 1;
    const f = F.founder(state);
    if (f) cap += 2 + f.skills.intake * 0.3;
    return cap;
  };
  F.processLeadQueue = function (state) {
    // Leads expire. Capacity shortfall loses the newest leads to voicemail.
    const cap = Math.floor(F.intakeCapacity(state));
    let lost = 0;
    state.leads = state.leads.filter((l) => {
      if (state.day > l.expiresDay) { lost++; return false; }
      return true;
    });
    if (state.leads.length > cap) {
      const excess = state.leads.length - cap;
      // Drop the lowest-quality channels first.
      state.leads.sort((a, b) => (D.CHANNELS[b.channel].quality - D.CHANNELS[a.channel].quality));
      state.leads.splice(cap, excess);
      lost += excess;
      if (excess > 0) F.log(state, `${excess} caller${excess > 1 ? 's' : ''} hung up before anyone answered. Intake capacity is ${cap} leads at a time.`, 'warn');
    }
    state.stats.leadsLost += lost;
    if (state.policy.autoIntake) F.autoIntake(state);
  };
  F.autoIntake = function (state) {
    const intakeSkill = Math.max(...state.staff.map((s) => s.skills.intake));
    for (const l of state.leads.slice()) {
      const exp = C.expectedValue(state, l);
      const open = F.openCases(state).length;
      const room = F.attorneys(state).length * 22;
      if (l.defendant.uninsured && !l.client.umLimit) { F.declineLead(state, l.id); continue; }
      const daysLeft = l.solDay - state.day;
      const sel = (state.strategy && state.strategy.selectivity) || 'selective';
      let decline = (daysLeft < 120 && exp < 50000) || (D.CASE_TYPES[l.type].expertRequired && state.cash < 60000);
      if (sel === 'selective') decline = decline || exp < 6000 || (open > room && exp < 40000) || (l.liability.bucket === 'weak' && intakeSkill < 7);
      if (sel === 'strong') decline = decline || exp < 15000 || l.liability.bucket !== 'clear' || (l.known.flags || []).some((f) => ['prior_claims', 'difficult', 'social', 'minor_damage'].includes(f));
      if (decline) { F.declineLead(state, l.id); continue; }
      F.signLead(state, l.id);
    }
  };
  F.signLead = function (state, leadId, attorneyId) {
    const i = state.leads.findIndex((l) => l.id === leadId);
    if (i < 0) return null;
    const c = state.leads.splice(i, 1)[0];
    const att = (attorneyId && F.staffById(state, attorneyId)) || F.leastLoaded(state);
    c.attorneyId = att.id;
    c.delegated = !att.isFounder && state.policy.autoDelegate;
    c.signedDay = state.day;
    c.client.lastContactWeek = state.week;
    c.stage = 'investigation'; c.weeksInStage = 0;
    c.docs.push({ day: state.day, name: 'Contingency fee agreement (33⅓% pre-suit, 40% in litigation)' }, { day: state.day, name: 'HIPAA authorization' }, { day: state.day, name: 'Letter of representation to all carriers' });
    C.log(state, c, `Signed. Retainer agreement executed; letters of representation sent. Assigned to ${att.name}.`, 'stage');
    state.cases.push(c);
    state.stats.signed++;
    // Sign-up: do the free basics immediately.
    if (c.known.flags.length < c.flags.length && R.chance(0.5)) { const hidden = c.flags.filter((f) => !c.known.flags.includes(f)); if (hidden.length) { c.known.flags.push(hidden[0]); const fd = D.RED_FLAGS.find((x) => x.id === hidden[0]) || D.GREEN_FLAGS.find((x) => x.id === hidden[0]); C.log(state, c, `Intake interview revealed: ${fd.name}. ${fd.desc}`, D.RED_FLAGS.find((x) => x.id === hidden[0]) ? 'warn' : 'good'); } }
    return c;
  };
  F.declineLead = function (state, leadId) {
    const i = state.leads.findIndex((l) => l.id === leadId);
    if (i < 0) return;
    state.leads.splice(i, 1);
    state.stats.declined++;
  };
  F.referLead = function (state, leadId) {
    const i = state.leads.findIndex((l) => l.id === leadId);
    if (i < 0) return;
    const c = state.leads.splice(i, 1)[0];
    c.stage = 'referred';
    const exp = C.expectedValue(state, c);
    const fee = Math.round(exp * R.range(0.5, 0.9) * 0.333 * 0.25);
    state.pendingLiens.push({ caseId: c.id, due: state.day + R.int(250, 800), amount: fee, name: `${c.clientName} (referral fee)` });
    F.log(state, `Referred ${c.clientName} to another firm for a 25% referral fee, payable if and when it resolves.`);
    state.stats.declined++;
  };
  F.investigateLead = function (state, leadId) {
    const l = state.leads.find((x) => x.id === leadId);
    if (!l || l.investigated) return;
    l.investigated = true;
    F.spend(state, 150, `Pre-sign investigation: ${l.clientName}`, 'costs');
    l.known.flags = l.flags.slice();
    l.known.liability = true; l.known.insurer = true; l.known.um = true; l.known.health = true;
    if (l.defendant.uninsured) l.known.uninsured = true;
    l.expiresDay += 7;
  };

  // ---------- Staff ----------
  F.refreshCandidates = function (state) {
    const roles = Object.keys(D.ROLES);
    const n = 4 + Math.min(6, Math.floor(state.staff.length / 3));
    state.candidates = [];
    for (let i = 0; i < n; i++) {
      let role = R.pick(roles);
      if (state.tier < 2 && (role === 'cfo' || role === 'trial')) role = 'attorney';
      if (i === 0 && state.staff.length < 3) role = R.pick(['paralegal', 'intake', 'casemgr']);
      const level = PI.clamp(Math.round(R.gauss(4.5 + state.reputation / 25, 1.5)), 2, 9);
      state.candidates.push(F.makeStaff(state, role, level));
    }
  };
  F.hire = function (state, candId) {
    const i = state.candidates.findIndex((c) => c.id === candId);
    if (i < 0) return { ok: false, msg: 'Candidate no longer available.' };
    if (state.staff.length >= F.officeCap(state)) return { ok: false, msg: 'No room in the office. Upgrade or open another location.' };
    const c = state.candidates.splice(i, 1)[0];
    c.hiredDay = state.day;
    state.staff.push(c);
    F.recount(state);
    F.log(state, `Hired ${c.name} as ${D.ROLES[c.role].name.toLowerCase()} at ${PI.money(c.salary)} a year.`);
    return { ok: true };
  };
  F.fire = function (state, id) {
    const st = F.staffById(state, id);
    if (!st || st.isFounder) return;
    const severance = Math.round(st.salary / 12);
    F.spend(state, severance, `Severance: ${st.name}`, 'payroll');
    state.staff = state.staff.filter((s) => s.id !== id);
    F.recount(state);
    for (const c of state.cases) if (c.attorneyId === id && C.isOpen(c)) { c.attorneyId = F.leastLoaded(state).id; C.log(state, c, `Reassigned to ${F.staffById(state, c.attorneyId).name} after ${st.name} left the firm.`); }
    for (const s of state.staff) if (!s.isFounder) s.morale -= 4;
    F.log(state, `${st.name} let go with ${PI.money(severance)} severance.`);
  };
  F.raise = function (state, id, pct) {
    const st = F.staffById(state, id);
    if (!st || st.isFounder) return;
    st.salary = Math.round(st.salary * (1 + pct) / 500) * 500;
    st.morale = Math.min(100, st.morale + pct * 150);
    st.lastRaiseDay = state.day;
    F.log(state, `${st.name} received a ${Math.round(pct * 100)}% raise to ${PI.money(st.salary)}.`);
  };
  F.bonus = function (state, id, amount) {
    const st = F.staffById(state, id);
    if (!st) return;
    F.spend(state, amount, `Bonus: ${st.name}`, 'payroll');
    st.morale = Math.min(100, st.morale + amount / 400);
  };
  F.train = function (state, id, skillKey) {
    const st = F.staffById(state, id);
    if (!st) return { ok: false };
    const cost = 2500 + st.trained * 1500;
    if (state.cash < cost) return { ok: false, msg: 'Not enough cash.' };
    if (st.skills[skillKey] >= 10) return { ok: false, msg: 'Already at the top of the scale.' };
    F.spend(state, cost, `Training: ${st.name} (${skillKey})`, 'overhead');
    st.trained++;
    st.skills[skillKey]++;
    st.morale = Math.min(100, st.morale + 3);
    F.log(state, `${st.name} completed advanced training. ${skillKey} is now ${st.skills[skillKey]}.`);
    return { ok: true };
  };
  F.promote = function (state, id) {
    const st = F.staffById(state, id);
    if (!st || st.isPartner || !(st.role === 'attorney' || st.role === 'trial')) return;
    st.isPartner = true;
    st.title = 'Partner';
    st.salary = Math.round(st.salary * 1.35 / 1000) * 1000;
    st.morale = 100;
    F.log(state, `${st.name} made partner.`, 'stage');
    F.achieve(state, 'partner', 'Made your first partner.');
  };
  F.assignCase = function (state, caseId, attId) {
    const c = state.cases.find((x) => x.id === caseId);
    const att = F.staffById(state, attId);
    if (!c || !att) return;
    c.attorneyId = attId;
    C.log(state, c, `Reassigned to ${att.name}.`);
  };

  F.weeklyStaff = function (state) {
    for (const st of state.staff) {
      if (st.isFounder) continue;
      // Morale baseline drift.
      const officeBonus = D.OFFICES[state.office].rep * 0.03;
      st.morale += officeBonus - 0.2;
      const stars = F.stars(state);
      if (stars < 3) st.morale -= (3 - stars) * 0.5; // nobody wants a mill with bad reviews on their resume
      else if (stars > 4.3) st.morale += 0.15;
      if (state.staff.length > F.officeCap(state)) st.morale -= 1.5;
      if (st.lastRaiseDay && state.day - st.lastRaiseDay > 365 * 1.5) st.morale -= 0.3;
      st.morale = PI.clamp(st.morale, 0, 100);
      if (st.morale < 20 && R.chance(0.08)) {
        state.staff = state.staff.filter((s) => s.id !== st.id);
        F.recount(state);
        for (const c of state.cases) if (c.attorneyId === st.id && C.isOpen(c)) { c.attorneyId = F.leastLoaded(state).id; }
        F.log(state, `${st.name} quit. "I can't do this caseload anymore."`, 'bad');
      }
    }
  };

  // ---------- Money ----------
  F.monthlyOverhead = function (state) {
    const payroll = state.staff.reduce((a, s) => a + s.salary, 0) / 12 + (state.founderDraw || 0);
    const rent = D.OFFICES[state.office].rent * state.city.costOfLiving + state.offices.length * 9000;
    const marketing = Object.keys(state.marketing).reduce((a, k) => a + (D.CHANNELS[k].cost * (state.marketing[k] || 0)), 0);
    const atts = F.attorneys(state).length;
    const insurance = state.policy.insured ? (atts * 6500 * (state.modifiers.premiumMult || 1)) / 12 : 0;
    const software = state.staff.length * 180 + 400;
    const benefits = (payroll - (state.founderDraw || 0)) * 0.18;
    const cfo = state.staffCounts.cfo ? 0.92 : 1;
    return { payroll: payroll + benefits, rent, marketing, insurance, software, total: (payroll + benefits + rent + marketing + insurance + software) * cfo };
  };
  F.weeklyExpenses = function (state) {
    const o = F.monthlyOverhead(state);
    const weekly = o.total / 4.33;
    F.spend(state, Math.round(weekly), 'Weekly overhead (payroll, rent, marketing, insurance)', 'overhead');
    if (state.debt > 0) { const interest = Math.round(state.debt * (state.staffCounts.cfo ? 0.075 : 0.095) / 52); F.spend(state, interest, 'Line of credit interest', 'interest'); }
    state.creditLimit = Math.round((60000 + state.reputation * 1500 + state.tier * 120000 + Math.min(2000000, state.stats.feesEarned * 0.08)) / 5000) * 5000;
    // Auto-draw to cover payroll.
    if (state.cash < 0 && state.debt < state.creditLimit) {
      const draw = Math.min(state.creditLimit - state.debt, Math.ceil(-state.cash / 5000) * 5000);
      state.debt += draw; state.cash += draw;
      F.log(state, `Drew ${PI.money(draw)} on the line of credit to cover overhead.`, 'warn');
    }
  };
  F.borrow = function (state, amt) { amt = Math.min(amt, state.creditLimit - state.debt); if (amt <= 0) return; state.debt += amt; state.cash += amt; state.ledger.unshift({ day: state.day, amount: amt, label: 'Line of credit draw', cat: 'loan' }); };
  F.repay = function (state, amt) { amt = Math.min(amt, state.debt, state.cash); if (amt <= 0) return; state.debt -= amt; state.cash -= amt; state.ledger.unshift({ day: state.day, amount: -amt, label: 'Line of credit repayment', cat: 'loan' }); };

  F.setChannel = function (state, chId, level) {
    const ch = D.CHANNELS[chId];
    if (!ch || ch.passive) return { ok: false };
    if (ch.unlockTier && state.tier < ch.unlockTier) return { ok: false, msg: `Unlocks at ${D.TIERS[ch.unlockTier].name}.` };
    level = PI.clamp(level, 0, ch.maxLevel);
    if (!state.marketing[chId] && level > 0) state.channelSince[chId] = state.week;
    if (level === 0) delete state.marketing[chId]; else state.marketing[chId] = level;
    if (ch.rep && level > (state.marketing[chId] || 0)) F.adjustRep(state, ch.rep * 0.2);
    return { ok: true };
  };
  F.upgradeOffice = function (state, tier) {
    const o = D.OFFICES[tier];
    if (!o || tier === state.office) return { ok: false };
    if (tier === 5 && state.tier < 4) return { ok: false, msg: 'A named tower requires a statewide brand.' };
    const moveCost = tier > state.office ? Math.round(o.rent * 3 * state.city.costOfLiving) : Math.round(D.OFFICES[state.office].rent * 1.5);
    if (state.cash < moveCost) return { ok: false, msg: `Moving costs ${PI.money(moveCost)} (deposit and build-out).` };
    F.spend(state, moveCost, `Office move: ${o.name}`, 'overhead');
    const up = tier > state.office;
    state.office = tier;
    if (up) { F.adjustRep(state, o.rep * 0.5); for (const s of state.staff) s.morale = Math.min(100, s.morale + 8); }
    F.log(state, `Moved into ${o.name.toLowerCase()}.`, 'stage');
    return { ok: true };
  };
  F.openOffice = function (state, cityId) {
    if (state.tier < 2) return { ok: false, msg: 'A second office unlocks at Established firm.' };
    if (cityId === state.cityId || state.offices.find((o) => o.cityId === cityId)) return { ok: false, msg: 'Already there.' };
    const cost = 60000;
    if (state.cash < cost) return { ok: false, msg: `Opening a satellite office costs ${PI.money(cost)}.` };
    F.spend(state, cost, `Opened office in ${D.CITIES.find((c) => c.id === cityId).name}`, 'overhead');
    state.offices.push({ cityId, openedDay: state.day });
    F.adjustRep(state, 3);
    F.log(state, `Opened a satellite office in ${D.CITIES.find((c) => c.id === cityId).name}.`, 'stage');
    F.news(state, `${state.firmName} expands to ${D.CITIES.find((c) => c.id === cityId).name}.`);
    return { ok: true };
  };

  // ---------- Monthly and yearly ----------
  F.monthly = function (state) {
    F.refreshCandidates(state);
    const o = F.monthlyOverhead(state);
    const fees = state.ledger.filter((l) => l.cat === 'fees' && l.day > state.day - 30).reduce((a, l) => a + l.amount, 0);
    F.log(state, `Month closed. Fees ${PI.money(fees)}, overhead ${PI.money(o.total)}, cash ${PI.money(state.cash)}${state.debt ? `, debt ${PI.money(state.debt)}` : ''}.`);
    // Reputation drifts slowly toward what the firm is actually doing.
    const avgSat = state.stats.satN ? state.stats.satSum / state.stats.satN : 60;
    const target = 15 + Math.min(35, state.stats.resolved * 0.25) + (avgSat - 60) * 0.6 + state.stats.trialWins * 1.5 + D.OFFICES[state.office].rep + state.offices.length * 3 + (state.marketing.tv || 0) * 2 + (state.marketing.billboard || 0) + (state.marketing.sponsorship || 0) * 2;
    state.reputation += (PI.clamp(target, 0, 100) - state.reputation) * 0.05;
    const acceptRatio = state.stats.acceptN ? state.stats.acceptRatioSum / state.stats.acceptN : 0.85;
    const filedRate = state.stats.resolved ? (state.stats.settledLit + state.stats.trials) / state.stats.resolved : 0.1;
    const crTarget = PI.clamp(30 + (acceptRatio - 0.85) * 120 + filedRate * 40 + state.stats.trialWins * 2 - state.stats.trialLosses, 0, 100);
    state.carrierRep = PI.clamp((state.carrierRep == null ? 30 : state.carrierRep) + (crTarget - state.carrierRep) * 0.06, 0, 100);
    for (const k of Object.values(state.carriers || {})) k.credibility *= 0.97;
  };
  F.yearly = function (state, closedYear) {
    const fees = state.ledger.filter((l) => l.cat === 'fees' && l.day > state.day - 365).reduce((a, l) => a + l.amount, 0);
    const resolved = state.cases.filter((c) => c.closedDay && c.closedDay > state.day - 365 && c.stage === 'closed').length;
    state.yearbook.push({ year: closedYear, fees: Math.round(fees), resolved, staff: state.staff.length, cash: Math.round(state.cash), rep: Math.round(state.reputation), tier: state.tier });
    for (const s of state.staff) { s.age++; if (!s.isFounder && (!s.lastRaiseDay || state.day - s.lastRaiseDay > 365)) { s.morale -= 6; } }
    const f = F.founder(state);
    F.log(state, `${closedYear} in review: ${PI.money(fees)} in fees, ${resolved} cases resolved, ${state.staff.length} on staff. ${f.name} turns ${f.age}.`, 'stage');
    if (f.age >= 58 && !state.successorId && state.tier >= 2) F.log(state, `${f.name} is ${f.age}. The firm needs a succession plan: name a partner as successor on the Firm tab.`, 'warn');
    if (f.age >= 70) F.retireFounder(state);
    if (state.modifiers.premiumMult && state.modifiers.premiumMult > 1) state.modifiers.premiumMult = Math.max(1, state.modifiers.premiumMult * 0.85);
  };

  // ---------- Dynasty ----------
  F.nameSuccessor = function (state, id) {
    const st = F.staffById(state, id);
    if (!st || !st.isPartner || st.isFounder) return { ok: false, msg: 'Successor must be a partner.' };
    state.successorId = id;
    F.log(state, `${st.name} named successor and managing partner-in-waiting.`, 'stage');
    F.achieve(state, 'successor', 'Named a successor.');
    return { ok: true };
  };
  F.retireFounder = function (state) {
    const f = F.founder(state);
    const succ = F.staffById(state, state.successorId);
    if (!succ) {
      if (f.age >= 72) { state.gameOver = { kind: 'dissolved', text: `${f.name} retired at ${f.age} with no successor. The firm was dissolved and its cases referred out. Legacy score: ${F.legacy(state).toLocaleString()}.` }; return; }
      F.log(state, `${f.name} wants to retire but has no successor. Name a partner before it is too late.`, 'bad');
      return;
    }
    f.isFounder = false; f.title = 'Of counsel (retired)'; f.salary = 0;
    f.retiredDay = state.day;
    state.retired.push({ name: f.name, years: PI.yearOf(state.day) - PI.yearOf(f.hiredDay), generation: state.generation });
    succ.isFounder = true; succ.title = 'Managing partner'; succ.salary = 0; succ.morale = 100;
    state.successorId = null;
    state.generation++;
    state.founderName = succ.name;
    F.log(state, `${f.name} retired. ${succ.name} takes over as managing partner. Generation ${state.generation} of the firm begins.`, 'stage');
    F.news(state, `${state.firmName} announces leadership transition to ${succ.name}.`);
    F.adjustRep(state, -3);
    state.staff = state.staff.filter((s) => s !== f);
    F.recount(state);
    for (const c of state.cases) if (c.attorneyId === f.id && C.isOpen(c)) { c.attorneyId = succ.id; }
  };
  F.retireNow = function (state) { const f = F.founder(state); if (f.age < 55) return { ok: false, msg: 'Too young to retire.' }; F.retireFounder(state); return { ok: true }; };
  F.legacy = function (state) {
    return Math.round(state.stats.feesEarned / 1000 + state.stats.recovered / 5000 + state.stats.trialWins * 2000 + state.stats.resolved * 50 + state.tier * 20000 + (state.generation - 1) * 50000 + state.reputation * 200);
  };

  // ---------- Progression ----------
  F.checkTier = function (state) {
    const next = D.TIERS[state.tier + 1];
    if (!next) return;
    if (F.tierProgress(state, next).every((r) => r.met)) {
      state.tier++;
      F.adjustRep(state, 5);
      F.log(state, `The firm is now a ${next.name.toLowerCase()}. ${next.desc} Unlocked: ${next.unlocks.join(', ')}.`, 'stage');
      F.news(state, `${state.firmName} grows into a ${next.name.toLowerCase()}.`);
      for (const s of state.staff) s.morale = Math.min(100, s.morale + 10);
    }
  };
  F.tierProgress = function (state, tier) {
    const r = tier.req;
    const out = [];
    const add = (label, have, need, fmt) => out.push({ label, have, need, met: have >= need, text: `${fmt ? fmt(have) : have} / ${fmt ? fmt(need) : need}` });
    if (r.staff) add('Staff', state.staff.length, r.staff);
    if (r.fees) add('Lifetime fees', state.stats.feesEarned, r.fees, (v) => PI.money(v, { short: true }));
    if (r.resolved) add('Cases resolved', state.stats.resolved, r.resolved);
    if (r.office) add('Office tier', state.office, r.office, (v) => D.OFFICES[Math.min(v, 5)].name);
    if (r.trials) add('Trial wins', state.stats.trialWins, r.trials);
    if (r.offices) add('Locations', state.offices.length + 1, r.offices);
    if (r.verdict) add('Largest verdict', state.stats.biggestVerdict, r.verdict, (v) => PI.money(v, { short: true }));
    if (r.successor) out.push({ label: 'Successor named', have: state.successorId || state.generation > 1 ? 1 : 0, need: 1, met: !!(state.successorId || state.generation > 1), text: state.successorId || state.generation > 1 ? 'Yes' : 'No' });
    return out;
  };
  F.checkAchievements = function (state) {
    const s = state.stats;
    if (s.resolved >= 1) F.achieve(state, 'first', 'First case resolved.');
    if (s.biggestSettlement >= 100000) F.achieve(state, 'sixfig', 'First six-figure recovery.');
    if (s.biggestSettlement >= 1000000) F.achieve(state, 'sevenfig', 'First seven-figure recovery.');
    if (s.trialWins >= 1) F.achieve(state, 'trial', 'First plaintiff\'s verdict.');
    if (s.biggestVerdict >= 10000000) F.achieve(state, 'eightfig', 'Eight-figure verdict.');
    if (state.staff.length >= 10) F.achieve(state, 'ten', 'Ten people on payroll.');
    if (state.staff.length >= 50) F.achieve(state, 'fifty', 'Fifty people on payroll.');
    if (s.feesEarned >= 10000000) F.achieve(state, 'tenm', 'Ten million dollars in lifetime fees.');
    if (state.offices.length >= 1) F.achieve(state, 'expand', 'Opened a second office.');
    if (state.generation >= 2) F.achieve(state, 'dynasty', 'A second generation leads the firm.');
    if (state.tier >= 5) F.achieve(state, 'national', 'National dynasty.');
  };
  F.checkGameOver = function (state) {
    if (state.gameOver) return;
    if (state.cash < 0 && state.debt >= state.creditLimit) {
      state.insolventWeeks = (state.insolventWeeks || 0) + 1;
      if (state.insolventWeeks === 1) F.log(state, 'The firm cannot make payroll and the line of credit is maxed. Settle something or cut costs within eight weeks.', 'bad');
      if (state.insolventWeeks >= 8) state.gameOver = { kind: 'bankrupt', text: `${state.firmName} could not make payroll for two months. The bank called the line, the landlord changed the locks and the cases were referred out. Legacy score: ${F.legacy(state).toLocaleString()}.` };
    } else state.insolventWeeks = 0;
  };

  // ---------- Events ----------
  F.EVENTS = {
    kickback: { title: 'A chiropractor wants a deal', w: 6, cond: (s) => s.week > 8, text: 'Dr. Pruitt runs three clinics and says he can send you forty cases a year. All he wants is $400 "marketing reimbursement" per patient. It is a kickback with a new name.', options: [{ label: 'Take the deal', desc: 'Leads up sharply. Bar risk.' }, { label: 'Decline politely', desc: 'Reputation +1.' }] },
    tv_feature: { title: 'Local news wants an interview', w: 5, cond: (s) => s.stats.resolved >= 3, text: 'A reporter is doing a segment on dangerous intersections and wants a lawyer on camera.', options: [{ label: 'Do the interview', desc: 'Reputation and a burst of leads.' }, { label: 'Pass', desc: 'No effect.' }] },
    poach: { title: 'Competitor poaching', w: 6, cond: (s) => s.staff.length >= 3, text: '{name} just got a call from a billboard firm across town offering 30% more.', options: [{ label: 'Match the offer', desc: 'Salary +30%, morale up.' }, { label: 'Wish them luck', desc: '60% chance they leave.' }] },
    tort_reform: { title: 'Tort reform bill', w: 2, cond: (s) => s.week > 52 && !s.modifiers.tortReformUntil, text: 'The legislature is voting on a cap on non-economic damages. The trial lawyers\' association is asking every firm for $25,000 for the lobbying fight.', options: [{ label: 'Contribute $25,000', desc: '70% chance the bill dies.' }, { label: 'Sit it out', desc: '60% chance it passes: verdicts and reserves down 15% for three years.' }] },
    bar_audit: { title: 'Trust account audit', w: 3, cond: (s) => s.week > 26, text: 'The state bar selected the firm for a random IOLTA trust account audit.', options: [{ label: 'Hire a CPA to prepare ($4,000)', desc: 'Almost certainly clean.' }, { label: 'Hand over the books as they are', desc: 'Risk of a fine if the ledgers are sloppy.' }] },
    hurricane: { title: 'Hurricane warning', w: 3, cond: (s) => s.cityId === 'gulfshore' || s.cityId === 'portavalon', text: 'A Category 3 storm is bearing down on the coast. Courts will close.', options: [{ label: 'Batten down', desc: 'Courts closed for four weeks. Premises leads surge afterward.' }] },
    mass_tort: { title: 'Mass tort steering committee', w: 2, cond: (s) => s.tier >= 3 && !s.modifiers.massTortDue, text: 'A plaintiffs\' steering committee on a defective hip implant MDL is offering seats at $150,000 each. Payouts, if any, are two years out.', options: [{ label: 'Buy in ($150,000)', desc: 'Returns between 0.3x and 6x in about two years.' }, { label: 'Pass', desc: '' }] },
    big_referral: { title: 'A referral from the courthouse', w: 4, cond: (s) => s.reputation > 25, text: 'A divorce lawyer you met at a CLE has a client whose husband was killed by a tractor-trailer. She does not do PI and is sending the family to you.', options: [{ label: 'Take the call', desc: 'A catastrophic trucking lead with a 25% referral fee owed.' }] },
    social_breach: { title: 'Client posted the settlement', w: 3, cond: (s) => s.stats.resolved >= 5, text: 'A former client posted a photo of their settlement check, with the confidential amount, on social media. The carrier is demanding $15,000 in liquidated damages under the confidentiality clause.', options: [{ label: 'Pay it from firm funds', desc: '$15,000, client relationship preserved.' }, { label: 'Fight it', desc: '50% chance it goes away; otherwise $25,000 and a reputation hit.' }] },
    burnout: { title: 'Burnout', w: 5, cond: (s) => s.staff.length >= 2, text: '{name} came into your office and closed the door. "I have not had a weekend in three months."', options: [{ label: 'Give a $3,000 bonus and a week off', desc: 'Morale restored.' }, { label: 'Tell them it is a sprint', desc: 'Morale drops.' }] },
    adjuster_defects: { title: 'An adjuster wants to switch sides', w: 3, cond: (s) => s.tier >= 1, text: 'A twelve-year claims adjuster from Redline Auto Casualty applied for a job. She knows exactly how the valuation software works.', options: [{ label: 'Interview her', desc: 'Adds a high-negotiation candidate to the pool.' }] },
    google_update: { title: 'Search algorithm update', w: 3, cond: (s) => (s.marketing.seo || 0) >= 2, text: 'Overnight the firm dropped from page one to page four for every search that matters.', options: [{ label: 'Pay an agency $10,000 to recover', desc: 'Fixed quickly.' }, { label: 'Wait it out', desc: 'Search leads halved for six months.' }] },
    award: { title: 'Rising Star award', w: 3, cond: (s) => s.reputation > 40 && !s.achievements.find((a) => a.id === 'award'), text: 'A legal magazine named you to its Rising Stars list. They would like to sell you a plaque.', options: [{ label: 'Buy the plaque ($1,200)', desc: 'Reputation +3.' }, { label: 'Just post about it', desc: 'Reputation +1.' }] },
    runner: { title: 'A "runner" offers hospital clients', w: 3, cond: (s) => s.week > 20, text: 'A man who says he works hospital parking lots offers to send injured patients your way for $1,000 each. This is solicitation and it is illegal.', options: [{ label: 'Hire him', desc: 'Lots of leads. Real chance of suspension.' }, { label: 'Throw him out', desc: 'Nothing happens.' }] },
    recession: { title: 'Recession', w: 2, cond: (s) => s.week > 40 && !s.modifiers.recessionUntil, text: 'Markets fell 20% and carriers are tightening reserves. Expect lower offers for a year.', options: [{ label: 'Acknowledge', desc: 'Offers down 10% for 12 months.' }] },
    founder_health: { title: 'Health scare', w: 2, cond: (s) => F.founder(s).age >= 52, text: 'Chest pains during a deposition. The cardiologist says stress. Six weeks of reduced hours.', options: [{ label: 'Follow doctor\'s orders', desc: 'Founder capacity reduced for six weeks.' }] },
    cle_invite: { title: 'Invited to speak at a CLE', w: 4, cond: (s) => s.stats.resolved >= 8, text: 'The county bar wants a one-hour talk on time-limited demands. Every lawyer in the room is a potential referral source.', options: [{ label: 'Give the talk', desc: 'Attorney referral network grows by one level.' }, { label: 'Decline', desc: '' }] },
    bar_hearing: { title: 'Disciplinary hearing', w: 0, cond: () => false, text: 'A run of bar complaints in a short span triggered a formal hearing. The panel is considering a suspension. Whatever happens here, the complaints keep counting until the firm changes how it treats clients.', options: [{ label: 'Retain ethics counsel ($20,000)', desc: '80% chance of a private reprimand only.' }, { label: 'Represent yourself', desc: '50% chance of a 90-day suspension.' }] },
    runner_caught: { title: 'Solicitation investigation', w: 0, cond: () => false, text: 'Your runner was arrested. He named every lawyer he worked with.', options: [{ label: 'Cooperate', desc: 'Suspension for 90 days, reputation hit.' }] },
    defense_verdict_press: { title: 'Carrier publicity', w: 2, cond: (s) => s.stats.trialLosses >= 1, text: 'A carrier\'s defense firm is bragging about beating you at trial in its newsletter.', options: [{ label: 'Respond with your verdict record', desc: 'Reputation +1 if you have trial wins; otherwise nothing.' }, { label: 'Ignore it', desc: '' }] },
    paralegal_catch: { title: 'Calendar catch', w: 3, cond: (s) => (s.staffCounts.paralegal || 0) >= 1, text: 'Your paralegal noticed a statute of limitations that was calendared on the wrong year. Caught with three weeks to spare.', options: [{ label: 'Buy lunch for the whole office ($300)', desc: 'Morale up across the firm.' }] }
  };
  F.queueEvent = function (state, id, extra) {
    const E = F.EVENTS[id];
    if (!E) return;
    let text = E.text;
    let target = null;
    if (text.includes('{name}')) { const pool = state.staff.filter((s) => !s.isFounder); if (!pool.length) return; target = R.pick(pool); text = text.replace('{name}', target.name); }
    state.events.push({ id, uid: PI.uid('ev'), day: state.day, title: E.title, text, options: E.options, targetId: target ? target.id : null, extra: extra || null });
  };
  F.rollEvents = function (state) {
    if (state.events.length >= 2) return;
    if (!R.chance(0.09)) return;
    const pool = Object.entries(F.EVENTS).filter(([id, E]) => E.w > 0 && E.cond(state) && !state.events.find((e) => e.id === id) && !(state.recentEvents || []).includes(id));
    if (!pool.length) return;
    const id = R.weighted(pool.map(([id, E]) => ({ w: E.w, v: id })));
    state.recentEvents = (state.recentEvents || []).concat(id).slice(-6);
    F.queueEvent(state, id);
  };
  F.resolveEvent = function (state, uid, optIdx) {
    const i = state.events.findIndex((e) => e.uid === uid);
    if (i < 0) return;
    const ev = state.events.splice(i, 1)[0];
    const target = ev.targetId ? F.staffById(state, ev.targetId) : null;
    const key = ev.id + ':' + optIdx;
    const say = (t, k) => F.log(state, t, k || 'info');
    switch (key) {
      case 'kickback:0': state.modifiers.leadMult = 1.5; state.modifiers.leadMultUntil = state.day + 365; state.modifiers.kickback = true; say('You took the chiropractor\'s deal. Leads will climb. So will the risk.', 'warn'); if (R.chance(0.35)) setTimeoutEvent(state, 'bar_hearing', R.int(20, 60)); break;
      case 'kickback:1': F.adjustRep(state, 1); say('You declined the kickback. Dr. Pruitt found another lawyer by lunchtime.'); break;
      case 'tv_feature:0': F.adjustRep(state, 3); state.modifiers.leadMult = 1.6; state.modifiers.leadMultUntil = state.day + 42; say('The segment aired twice. The phones have not stopped.', 'good'); break;
      case 'poach:0': if (target) { F.raise(state, target.id, 0.3); } break;
      case 'poach:1': if (target && R.chance(0.6)) { state.staff = state.staff.filter((s) => s.id !== target.id); F.recount(state); for (const c of state.cases) if (c.attorneyId === target.id && C.isOpen(c)) c.attorneyId = F.leastLoaded(state).id; say(`${target.name} left for the billboard firm.`, 'bad'); } else if (target) say(`${target.name} decided to stay. Loyalty, or the other firm's reputation.`); break;
      case 'tort_reform:0': F.spend(state, 25000, 'Lobbying contribution', 'overhead'); if (R.chance(0.3)) { applyTortReform(state); } else say('The bill died in committee. Money well spent.', 'good'); break;
      case 'tort_reform:1': if (R.chance(0.6)) applyTortReform(state); else say('The bill died in committee without your help.'); break;
      case 'bar_audit:0': F.spend(state, 4000, 'CPA audit preparation', 'overhead'); say('Audit closed with no findings.', 'good'); break;
      case 'bar_audit:1': if (!(state.staffCounts.office || state.staffCounts.cfo) && R.chance(0.4)) { F.spend(state, 7500, 'Bar fine: trust accounting deficiencies', 'overhead'); F.barComplaint(state, 'Trust account reconciliations were months behind.'); } else say('Audit closed with no findings.', 'good'); break;
      case 'hurricane:0': state.modifiers.courtsClosedUntil = state.day + 28; state.modifiers.leadMult = 1.4; state.modifiers.leadMultUntil = state.day + 90; say('Courts closed for four weeks. Expect a wave of premises and roadway cases when the water recedes.', 'warn'); break;
      case 'mass_tort:0': F.spend(state, 150000, 'Mass tort steering committee buy-in', 'costs'); state.modifiers.massTortDue = state.day + R.int(600, 800); state.modifiers.massTortMult = R.weighted([{ w: 25, v: 0.3 }, { w: 30, v: 1.2 }, { w: 30, v: 2.5 }, { w: 15, v: 6 }]); say('Seated on the steering committee. The MDL judge set a bellwether schedule.'); break;
      case 'big_referral:0': { const l = C.generateLead(state, 'network'); l.type = 'trucking'; l.severity = 5; l.clientName = `Estate of ${C.personName()}`; l.specialsTarget = R.range(400000, 900000); l.futureWage = R.range(800000, 2500000); l.defendant.limits = 2000000; l.defendant.insurer = 'meridian'; l.liability.L = R.range(0.7, 0.9); l.liability.bucket = 'clear'; l.injury = 'death of a 41-year-old parent of two'; l.expiresDay = state.day + 21; l.known.liability = true; state.leads.push(l); say('The family is coming in Thursday. Do not blow this one.', 'good'); break; }
      case 'social_breach:0': F.spend(state, 15000, 'Confidentiality breach payment', 'overhead'); break;
      case 'social_breach:1': if (R.chance(0.5)) say('The carrier dropped it after a sharp letter.', 'good'); else { F.spend(state, 25000, 'Confidentiality breach judgment', 'overhead'); F.adjustRep(state, -2); } break;
      case 'burnout:0': if (target) F.bonus(state, target.id, 3000); if (target) target.morale = Math.min(100, target.morale + 25); break;
      case 'burnout:1': if (target) target.morale -= 20; break;
      case 'adjuster_defects:0': { const c = F.makeStaff(state, 'attorney', 5); c.name = c.name.split(' ')[0] + ' Kessler'; c.skills.negotiation = 9; c.skills.litigation = 3; c.title = 'Associate attorney'; c.salary = 95000; state.candidates.unshift(c); say('Former adjuster added to the candidate pool.'); break; }
      case 'google_update:0': F.spend(state, 10000, 'SEO recovery', 'marketing'); break;
      case 'google_update:1': state.modifiers.seoPenaltyUntil = state.day + 180; break;
      case 'award:0': F.spend(state, 1200, 'Award plaque', 'marketing'); F.adjustRep(state, 3); F.achieve(state, 'award', 'Named a Rising Star.'); break;
      case 'award:1': F.adjustRep(state, 1); F.achieve(state, 'award', 'Named a Rising Star.'); break;
      case 'runner:0': state.modifiers.leadMult = 1.8; state.modifiers.leadMultUntil = state.day + 365; say('The runner is working the ERs. Your phone is ringing.', 'warn'); if (R.chance(0.5)) setTimeoutEvent(state, 'runner_caught', R.int(15, 50)); break;
      case 'recession:0': state.modifiers.recessionUntil = state.day + 365; break;
      case 'founder_health:0': F.founder(state).sickUntil = state.day + 42; break;
      case 'cle_invite:0': state.marketing.network = Math.min(D.CHANNELS.network.maxLevel, (state.marketing.network || 0) + 1); if (!state.channelSince.network) state.channelSince.network = state.week; say('Forty lawyers took your card.', 'good'); break;
      case 'bar_hearing:0': F.spend(state, 20000, 'Ethics counsel', 'overhead'); state.barHeat = Math.max(0, (state.barHeat || 0) - 1.5); if (R.chance(0.8)) say('Private reprimand. The matter is closed, for now.', 'good'); else suspend(state, 90); break;
      case 'bar_hearing:1': state.barHeat = Math.max(0, (state.barHeat || 0) - 0.5); if (R.chance(0.5)) say('Public reprimand, no suspension.', 'warn'); else suspend(state, 90); break;
      case 'runner_caught:0': suspend(state, 90); F.adjustRep(state, -10); state.modifiers.leadMultUntil = 0; break;
      case 'defense_verdict_press:0': if (state.stats.trialWins) F.adjustRep(state, 1); break;
      case 'paralegal_catch:0': F.spend(state, 300, 'Office lunch', 'overhead'); for (const s of state.staff) s.morale = Math.min(100, s.morale + 6); break;
    }
    function applyTortReform(state) { state.modifiers.tortReformUntil = state.day + 365 * 3; state.city = Object.assign({}, state.city, { venue: state.city.venue * 0.85 }); F.log(state, 'Tort reform passed. Non-economic damages capped; carriers immediately cut reserves 15%.', 'bad'); F.news(state, 'Governor signs damages cap into law.'); }
    function suspend(state, days) { const f = F.founder(state); f.suspendedUntil = state.day + days; F.log(state, `${f.name} suspended from practice for ${days} days. Cases must be carried by other attorneys.`, 'bad'); F.adjustRep(state, -8); }
    function setTimeoutEvent(state, id, weeks) { state.scheduled = state.scheduled || []; state.scheduled.push({ id, week: state.week + weeks }); }
    // Scheduled follow-ups fire from rollEvents via this hook.
  };
  const origRoll = F.rollEvents;
  F.rollEvents = function (state) {
    if (state.scheduled) for (const s of state.scheduled.slice()) if (state.week >= s.week) { state.scheduled.splice(state.scheduled.indexOf(s), 1); F.queueEvent(state, s.id); }
    if (state.scheduledCaseEvents) for (const e of state.scheduledCaseEvents.slice()) if (state.week >= e.week) {
      state.scheduledCaseEvents.splice(state.scheduledCaseEvents.indexOf(e), 1);
      const c = state.cases.find((x) => x.id === e.caseId);
      if (c && e.kind === 'early_regret') { F.addReview(state, 1, c.clientName, 'pushed into an early settlement'); F.log(state, `${c.clientName} needed ${c.severity >= 3 ? 'surgery' : 'months more treatment'} after the early settlement and has no way to pay for it. A one-star review followed.`, 'bad'); F.adjustRep(state, c.severity >= 3 ? -3 : -1.5); if (c.severity >= 3 && R.chance(0.2)) F.barComplaint(state, `${c.clientName} says the firm pushed a quick settlement.`); }
    }
    if (state.modifiers.massTortDue && state.day >= state.modifiers.massTortDue) { const pay = Math.round(150000 * state.modifiers.massTortMult); F.earn(state, pay, 'Mass tort common benefit fee', 'fees'); state.stats.feesEarned += pay; F.log(state, `The MDL settled globally. Your committee share: ${PI.money(pay)}.`, pay > 150000 ? 'good' : 'bad'); delete state.modifiers.massTortDue; }
    if (state.modifiers.tortReformUntil && state.day > state.modifiers.tortReformUntil) { delete state.modifiers.tortReformUntil; state.city = D.CITIES.find((c) => c.id === state.cityId); F.log(state, 'The damages cap was struck down by the state supreme court.', 'good'); }
    origRoll(state);
  };

  // ---------- Save / load ----------
  F.serialize = (state) => JSON.stringify({ rng: R.state(), state });
  F.deserialize = function (json) {
    const o = JSON.parse(json);
    if (!o || !o.state || !o.state.cases) throw new Error('Not a valid save.');
    R.seed(o.rng);
    const s = o.state;
    s.city = D.CITIES.find((c) => c.id === s.cityId) || s.city;
    if (s.modifiers && s.modifiers.tortReformUntil) s.city = Object.assign({}, s.city, { venue: s.city.venue * 0.85 });
    if (s.carrierRep == null) s.carrierRep = 30;
    s.reviews = s.reviews || { sum: 0, n: 0, recent: [] };
    s.carriers = s.carriers || {};
    s.strategy = s.strategy || { philosophy: 'balanced', selectivity: 'selective' };
    F.recount(s);
    return s;
  };
})();
