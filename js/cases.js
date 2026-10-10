/* Contingency: the case engine. A case moves lead -> investigation -> treatment -> records -> demand -> negotiation -> (litigation) -> disbursement -> closed. */
(function () {
  const PI = (globalThis.PI = globalThis.PI || {});
  const D = PI.DATA;
  const R = PI.rng;
  const C = (PI.Cases = {});

  const STAGE_NAMES = {
    lead: 'Lead', investigation: 'Investigation', treatment: 'Treatment', records: 'Records', demand: 'Demand', negotiation: 'Negotiation',
    litigation: 'Litigation', disbursement: 'Disbursement', closed: 'Closed', dropped: 'Dropped', lost: 'Lost', referred: 'Referred out'
  };
  C.STAGE_NAMES = STAGE_NAMES;
  C.OPEN_STAGES = ['investigation', 'treatment', 'records', 'demand', 'negotiation', 'litigation', 'disbursement'];
  C.isOpen = (c) => C.OPEN_STAGES.includes(c.stage);

  function personName() { return `${R.pick(D.FIRST_NAMES)} ${R.pick(D.LAST_NAMES)}`; }
  C.personName = personName;

  function pickSeverity(type) {
    const w = D.CASE_TYPES[type].sevW;
    return R.weighted(w.map((x, i) => ({ w: x, v: i + 1 })));
  }

  function pickLimits(type, flags) {
    const t = D.CASE_TYPES[type];
    let limits;
    switch (t.limits) {
      case 'auto': limits = R.weighted(D.AUTO_LIMITS); break;
      case 'rideshare': limits = 1000000; break;
      case 'commercial': limits = R.pick([1000000, 1000000, 2000000, 5000000]); break;
      case 'cgl': limits = R.pick([500000, 1000000, 1000000, 2000000]); break;
      case 'homeowner': limits = R.pick([100000, 300000, 300000, 500000]); break;
      case 'medmal': limits = R.pick([1000000, 1000000, 3000000]); break;
      case 'government': limits = 250000; break;
      default: limits = 100000;
    }
    if (flags.includes('commercial') && t.limits === 'auto') limits = Math.max(limits, R.pick([1000000, 1000000, 2000000]));
    let umbrella = 0;
    if (flags.includes('umbrella')) umbrella = R.pick([1000000, 1000000, 2000000, 5000000]);
    return { limits, umbrella };
  }

  function liabilityFor(type, flags) {
    const prof = D.CASE_TYPES[type].liab;
    const bucket = R.weighted([{ w: prof.clear, v: 'clear' }, { w: prof.disputed, v: 'disputed' }, { w: prof.weak, v: 'weak' }]);
    let L, cf = 0;
    if (bucket === 'clear') { L = R.range(0.8, 0.97); cf = R.chance(0.25) ? R.range(0, 0.1) : 0; }
    else if (bucket === 'disputed') { L = R.range(0.5, 0.78); cf = R.chance(0.6) ? R.range(0.1, 0.4) : 0; }
    else { L = R.range(0.2, 0.5); cf = R.chance(0.7) ? R.range(0.2, 0.55) : 0; }
    for (const f of flags) {
      const g = D.GREEN_FLAGS.find((x) => x.id === f);
      if (g && g.liability) L = Math.min(0.98, L + g.liability);
    }
    return { bucket, L, cf };
  }

  function buildTreatmentPlan(sev, flags) {
    const S = D.SEVERITY[sev];
    const plan = [];
    const add = (id) => { if (!plan.find((p) => p.id === id)) plan.push({ id, ...D.PROVIDERS[id] }); };
    if (sev >= 2 || R.chance(0.55)) add('er'); else add(R.chance(0.5) ? 'urgent' : 'pcp');
    if (sev === 1) { add(R.chance(0.6) ? 'chiro' : 'pt'); if (R.chance(0.4)) add('mri'); }
    if (sev === 2) { add('pt'); add('mri'); add('ortho'); if (R.chance(0.5)) add('pain'); if (R.chance(0.3)) add('neuro'); }
    if (sev >= 3) { add('mri'); add('ortho'); add('pt'); add('pain'); if (R.chance(0.5)) add('neuro'); if (R.chance(0.4)) add('psych'); }
    if (sev >= 4) { add('surgery'); add('rehab'); }
    if (sev === 5) { add('lifecare'); }
    const weeks = R.int(S.weeks[0], S.weeks[1]);
    const surgeryIndicated = sev >= 3 && R.chance(S.surgeryChance) && !plan.find((p) => p.id === 'surgery');
    return { plan: plan.map((p) => ({ id: p.id, name: p.name, billed: 0, done: false, recordsRequested: false, recordsReceived: false, recordsWeeks: 0, recordCost: 0 })), weeksTotal: weeks, weeksLeft: weeks, surgeryIndicated, surgeryDone: false, gapWeeks: 0, gaps: 0, mmi: false, compliance: 1 };
  }

  // Create a brand new potential case (a lead). All hidden facts are generated now; the player discovers them over time.
  C.generateLead = function (state, channelId) {
    const types = Object.keys(D.CASE_TYPES).map((k) => ({ w: D.CASE_TYPES[k].w, v: k }));
    const type = R.weighted(types);
    const T = D.CASE_TYPES[type];
    const ch = D.CHANNELS[channelId] || D.CHANNELS.referral;
    let sev = pickSeverity(type);
    // Better channels skew toward better cases.
    if (ch.quality > 1.1 && sev < 3 && R.chance(0.25)) sev++;
    if (ch.quality < 0.85 && sev > 1 && R.chance(0.3)) sev--;
    if (T.death) sev = 5;

    const flags = [];
    D.RED_FLAGS.forEach((f) => { if (R.chance(f.w / 100 * (ch.quality < 0.9 ? 1.3 : 0.8))) flags.push(f.id); });
    D.GREEN_FLAGS.forEach((f) => { if (R.chance(f.w / 100 * (ch.quality > 1.1 ? 1.3 : 0.9))) flags.push(f.id); });
    if (T.cat !== 'auto') { ['dashcam', 'citation', 'minor_damage', 'umbrella'].forEach((x) => { const i = flags.indexOf(x); if (i >= 0) flags.splice(i, 1); }); }
    if (type === 'workplace_third' && !flags.includes('comp')) flags.push('comp');
    if (type !== 'workplace_third') { const i = flags.indexOf('comp'); if (i >= 0 && R.chance(0.7)) flags.splice(i, 1); }

    const liab = liabilityFor(type, flags);
    const { limits, umbrella } = pickLimits(type, flags);
    const insurer = R.weighted(D.INSURERS.filter((i) => {
      if (T.limits === 'medmal') return i.id === 'medpro';
      if (T.limits === 'commercial') return ['meridian', 'cornerstone', 'sentinel', 'beacon'].includes(i.id);
      if (T.limits === 'cgl') return ['cornerstone', 'sentinel', 'beacon', 'granite'].includes(i.id);
      return !['medpro', 'meridian', 'cornerstone'].includes(i.id);
    }).map((i) => ({ w: i.share, v: i.id })));
    const uninsured = T.limits === 'auto' && (flags.includes('no_insurance') ? R.chance(0.6) : R.chance(0.08));
    const umLimit = R.weighted([{ w: 35, v: 0 }, { w: 25, v: 25000 }, { w: 20, v: 50000 }, { w: 15, v: 100000 }, { w: 5, v: 250000 }]);
    const medpay = R.chance(0.35) ? R.pick([1000, 2000, 5000, 10000]) : 0;
    const health = R.weighted([{ w: 25, v: 'none' }, { w: 38, v: 'private' }, { w: 12, v: 'erisa' }, { w: 15, v: 'medicare' }, { w: 10, v: 'medicaid' }]);

    const S = D.SEVERITY[sev];
    const specialsTarget = R.range(S.specials[0], S.specials[1]);
    let wage = R.range(S.wage[0], S.wage[1]);
    if (flags.includes('high_earner')) wage *= 3;
    const incidentDaysAgo = T.noticeDays ? R.int(5, 120) : R.weighted([{ w: 50, v: R.int(2, 30) }, { w: 30, v: R.int(30, 180) }, { w: 15, v: R.int(180, 500) }, { w: 5, v: R.int(500, 700) }]);
    const incidentDay = state.day - incidentDaysAgo;
    const age = T.death ? R.int(2, 80) : R.int(19, 78);
    const narrativeTpl = R.pick(D.INJURY_NARRATIVES[type]);
    const business = R.pick(D.BUSINESS_NAMES);
    const narrative = narrativeTpl.replace('{road}', R.pick(D.ROADS)).replace('{vehicle}', R.pick(D.VEHICLES)).replace(/\{business\}/g, business);
    const defendantName = ['commercial', 'cgl', 'medmal', 'government'].includes(T.limits) || flags.includes('commercial') ? (T.limits === 'government' ? 'City of ' + state.city.name : business) : personName();
    const credibility = flags.reduce((a, f) => { const x = D.RED_FLAGS.find((r) => r.id === f) || D.GREEN_FLAGS.find((g) => g.id === f); return a + ((x && x.credibility) || 0); }, 0);

    const c = {
      id: PI.uid('case'), createdDay: state.day, expiresDay: state.day + R.int(5, 14), channel: channelId,
      clientName: personName(), clientAge: age, occupation: R.pick(['warehouse worker', 'nurse', 'teacher', 'retiree', 'software developer', 'line cook', 'electrician', 'student', 'rideshare driver', 'accountant', 'landscaper', 'dental hygienist', 'truck driver', 'real estate agent', 'home health aide', 'barber']),
      type, severity: sev, injury: R.pick(S.examples), narrative, incidentDay, solDay: incidentDay + T.sol, noticeDay: T.noticeDays ? incidentDay + T.noticeDays : null, noticeServed: false,
      stage: 'lead', weeksInStage: 0, substage: null, attorneyId: null, delegated: false,
      flags, known: { flags: flags.filter(() => R.chance(0.6)), liability: false, insurer: false, limits: false, um: false, health: false, uninsured: false },
      liability: { bucket: liab.bucket, L: liab.L, cf: liab.cf, evidence: {}, determination: null, determinationWeek: null },
      defendant: { name: defendantName, insurer, limits, umbrella, uninsured, adjuster: null, adjusterStyle: null, defenseFirm: null },
      client: { umLimit, medpay, health, mood: 70, lastContactWeek: 0, credibility, expectations: 1.0 },
      treatment: buildTreatmentPlan(sev, flags), specialsTarget, wage, futureMeds: sev >= 3 ? specialsTarget * R.range(0.15, 0.5) : 0, futureWage: sev >= 4 ? wage * R.range(1.5, 5) : 0,
      liens: [], records: { started: false, complete: false },
      demand: null, negotiation: null, litigation: null, costs: 0, costLog: [], feePct: 0.3333, uim: null,
      settlement: null, timeline: [], docs: [], pending: null, notes: [], workNeed: 0, speedLast: 1
    };
    if (flags.includes('difficult')) c.client.expectations = 1.5;
    if (flags.includes('child')) c.clientAge = R.int(6, 17);
    if (T.death) c.clientName = `Estate of ${personName()}`;
    C.log(state, c, `Lead received via ${ch.name.toLowerCase()}.`);
    return c;
  };

  C.log = function (state, c, text, kind) {
    c.timeline.push({ day: state.day, text, kind: kind || 'info' });
    if (c.timeline.length > 400) c.timeline.shift();
  };
  C.addCost = function (state, c, amount, label) {
    if (amount <= 0) return;
    c.costs += amount;
    c.costLog.push({ day: state.day, amount, label });
    PI.Firm.spend(state, amount, `Case cost: ${label} (${c.clientName})`, 'costs');
  };

  // ---------- Valuation ----------
  function flagsValueMult(c) {
    let m = 1;
    for (const f of c.flags) { const r = D.RED_FLAGS.find((x) => x.id === f); if (r && r.valueMult) m *= r.valueMult; }
    return m;
  }
  C.specials = (c) => c.treatment.plan.reduce((a, p) => a + p.billed, 0);
  C.treatmentStatus = function (c) {
    const t = c.treatment;
    if (t.mmi) return { label: 'MMI reached', pct: 100, kind: 'good' };
    if (t.inGap) return { label: `Gap in care (${t.gapWeeks} wk)`, pct: Math.round((1 - t.weeksLeft / Math.max(1, t.weeksTotal)) * 100), kind: 'danger' };
    const pct = Math.round(PI.clamp(1 - t.weeksLeft / Math.max(1, t.weeksTotal), 0, 0.99) * 100);
    return { label: `Treating, ~${PI.weeksToText(Math.max(1, Math.round(t.weeksLeft)))} left`, pct, kind: '' };
  };
  // The true full value of the case if liability were 100%.
  C.trueValue = function (state, c) {
    const S = D.SEVERITY[c.severity];
    const T = D.CASE_TYPES[c.type];
    const specials = Math.max(C.specials(c), c.treatment.mmi ? 0 : c.specialsTarget * 0.4);
    const mult = (S.mult[0] + S.mult[1]) / 2;
    let v = specials * mult + c.wage + c.futureMeds + c.futureWage;
    if (T.death) v = Math.max(v, c.specialsTarget * 2 + c.futureWage + 250000);
    v *= state.city.venue * (T.biasMult || 1) * flagsValueMult(c);
    v *= 1 + c.client.credibility;
    if (c.treatment.gaps > 0) v *= Math.max(0.6, 1 - 0.08 * c.treatment.gaps);
    if (c.treatment.surgeryDone) v *= 1.15;
    if (T.punitive) v *= 1.2;
    if (c.litigation && c.litigation.expertBonus) v *= 1 + c.litigation.expertBonus;
    if (c.litigation && c.litigation.imePenalty) v *= 1 - c.litigation.imePenalty;
    if (c.litigation && c.litigation.depoMod) v *= 1 + c.litigation.depoMod;
    return Math.max(1000, v);
  };
  // What the case would be worth fully worked up: the yardstick clients eventually measure you against.
  C.potentialValue = function (state, c) {
    const S = D.SEVERITY[c.severity];
    const mult = (S.mult[0] + S.mult[1]) / 2;
    const specials = Math.max(C.specials(c), c.specialsTarget);
    let v = (specials * mult + c.wage + c.futureMeds + c.futureWage) * state.city.venue * (D.CASE_TYPES[c.type].biasMult || 1) * flagsValueMult(c) * (1 + c.client.credibility);
    const cf = c.liability.cf;
    return Math.max(1000, v * C.effectiveLiability(c) * (cf >= 0.5 ? 0 : 1 - cf));
  };
  C.expectedValue = function (state, c) {
    const L = C.effectiveLiability(c);
    const cf = c.liability.cf;
    const cfFactor = cf >= 0.5 ? 0 : 1 - cf;
    return C.trueValue(state, c) * L * cfFactor;
  };
  C.effectiveLiability = function (c) {
    let L = c.liability.L;
    const ev = c.liability.evidence;
    if (ev.policeReport) L += 0.03;
    if (ev.witnesses) L += 0.06;
    if (ev.photos) L += 0.02;
    if (ev.video) L += 0.12;
    if (ev.scene) L += 0.04;
    if (ev.blackbox) L += 0.08;
    if (c.litigation && c.litigation.liabilityBonus) L += c.litigation.liabilityBonus;
    return PI.clamp(L, 0.05, 0.98);
  };
  C.collectible = function (state, c) {
    const d = c.defendant;
    if (d.uninsured) return 0;
    let cap = d.limits + d.umbrella;
    if (c.litigation && c.litigation.badFaith) cap = Infinity;
    if (D.CASE_TYPES[c.type].limits === 'commercial' || D.CASE_TYPES[c.type].limits === 'medmal') cap = cap * 1.15; // corporate assets reachable above limits
    return cap;
  };
  // What the firm shows the player: an estimate with noise that shrinks with attorney skill and case maturity.
  C.estimate = function (state, c) {
    const att = PI.Firm.staffById(state, c.attorneyId);
    const skill = att ? (att.skills.negotiation + att.skills.litigation) / 2 : 4;
    const maturity = c.treatment.mmi ? 0.15 : 0.45;
    const noise = maturity * (1.3 - skill / 10);
    const v = C.expectedValue(state, c);
    const cap = C.collectible(state, c);
    const lo = Math.min(cap, v * (1 - noise)), hi = Math.min(cap === Infinity ? v * 3 : cap * 1.2, v * (1 + noise));
    return { lo: Math.round(lo / 500) * 500, hi: Math.round(hi / 500) * 500, mid: Math.round(v / 500) * 500 };
  };

  // ---------- Staff helpers ----------
  function attorney(state, c) { return PI.Firm.staffById(state, c.attorneyId) || PI.Firm.founder(state); }
  function skill(state, c, k) { const a = attorney(state, c); return a ? a.skills[k] || 5 : 5; }

  // ---------- Weekly progression ----------
  // ctx: { speed: 0.3..1 attorney bandwidth factor, para: 1..1.7 paralegal factor, cm: 0..1 case manager coverage, inv: investigator on staff, lien: lien negotiator on staff }
  C.weekly = function (state, c, ctx) {
    if (!C.isOpen(c)) return;
    c.weeksInStage++;
    c.speedLast = ctx.speed;
    const T = D.CASE_TYPES[c.type];

    // Statute of limitations and notice deadlines.
    if (c.noticeDay && !c.noticeServed && state.day > c.noticeDay) {
      return C.kill(state, c, 'lost', 'Notice of claim deadline missed. The claim against the government is barred.', true);
    }
    if (!(c.litigation && c.litigation.filed) && c.stage !== 'disbursement' && state.day > c.solDay) {
      return C.kill(state, c, 'lost', 'Statute of limitations expired without a complaint on file. The case is dead and the client has a malpractice claim against the firm.', true);
    }

    // Client mood: decays without contact; case managers keep it up.
    const weeksSinceContact = state.week - c.client.lastContactWeek;
    let decay = 0.9 + (c.flags.includes('difficult') ? 1.2 : 0);
    if (c.stage === 'litigation') decay += 0.4;
    decay *= 1 - 0.7 * ctx.cm;
    if (ctx.speed < 0.6) decay *= 1.6;
    if (ctx.speed < 0.5 && R.chance(0.012)) { c.client.mood -= 10; c.client.credibility -= 0.02; C.log(state, c, 'Nobody returned the client\'s calls for three weeks and a records deadline was missed. The file is moving, barely.', 'warn'); if (R.chance(0.25)) PI.Firm.barComplaint(state, `${c.clientName} complained that nobody at the firm knows their case.`); }
    if (ctx.speed < 0.5 && c.stage === 'litigation' && R.chance(0.04)) { c.litigation.depoMod = (c.litigation.depoMod || 0) - 0.03; C.log(state, c, 'A discovery deadline slipped because the attorney is overloaded. Defense counsel noticed.', 'warn'); }
    if (weeksSinceContact > 4) c.client.mood -= decay * Math.min(2, (weeksSinceContact - 2) / 4);
    if (ctx.cm > 0.5 && R.chance(0.3 * ctx.cm)) { c.client.lastContactWeek = state.week; c.client.mood = Math.min(100, c.client.mood + 3); }
    // An attorney with room on their desk returns calls without being told to.
    else if (ctx.speed >= 0.85 && weeksSinceContact >= 3 && R.chance(0.35)) { c.client.lastContactWeek = state.week; c.client.mood = Math.min(100, c.client.mood + 2); }
    c.client.mood = PI.clamp(c.client.mood, 0, 100);
    if (c.client.mood <= 10 && c.stage !== 'disbursement' && R.chance(0.35)) {
      return C.kill(state, c, 'dropped', `${c.clientName} fired the firm and hired a competitor. You keep a lien for fees, but it may be years before it pays, if ever.`, false, true);
    }

    // Treatment runs in the background through investigation, treatment and into records.
    if (!c.treatment.mmi && ['investigation', 'treatment', 'records', 'demand', 'negotiation'].includes(c.stage)) progressTreatment(state, c, ctx);

    switch (c.stage) {
      case 'investigation': weeklyInvestigation(state, c, ctx); break;
      case 'treatment': if (c.treatment.mmi) { setStage(state, c, 'records'); startRecords(state, c); } break;
      case 'records': weeklyRecords(state, c, ctx); break;
      case 'demand': weeklyDemand(state, c, ctx); break;
      case 'negotiation': weeklyNegotiation(state, c, ctx); break;
      case 'litigation': weeklyLitigation(state, c, ctx); break;
      case 'disbursement': weeklyDisbursement(state, c, ctx); break;
    }
    if (c.delegated && C.isOpen(c)) C.autoPilot(state, c);
  };

  function setStage(state, c, stage) {
    c.stage = stage; c.weeksInStage = 0;
    C.log(state, c, `Case moved to ${STAGE_NAMES[stage]}.`, 'stage');
  }
  C.setStage = setStage;

  C.kill = function (state, c, stage, reason, malpractice, fired) {
    C.log(state, c, reason, 'bad');
    c.stage = stage; c.pending = null; c.closedDay = state.day;
    PI.Firm.log(state, `${c.clientName}: ${reason}`, 'bad');
    if (malpractice) PI.Firm.malpractice(state, c);
    if (fired) { state.stats.clientsLost++; PI.Firm.adjustRep(state, -1.5); state.pendingLiens = state.pendingLiens || []; state.pendingLiens.push({ caseId: c.id, due: state.day + R.int(200, 700), amount: Math.round(C.expectedValue(state, c) * 0.1 * R.range(0.2, 0.8)), name: c.clientName }); }
  };

  function progressTreatment(state, c, ctx) {
    const t = c.treatment;
    // Compliance and gaps.
    const gapChance = 0.03 + (c.client.mood < 40 ? 0.05 : 0) + (c.flags.includes('difficult') ? 0.02 : 0);
    if (!t.inGap && R.chance(gapChance * (1 - 0.8 * ctx.cm))) { t.inGap = true; t.gaps++; C.log(state, c, 'Client stopped showing up for treatment. A gap in care is forming.', 'warn'); }
    if (t.inGap) { t.gapWeeks++; if (R.chance(0.35 + 0.4 * ctx.cm)) { t.inGap = false; C.log(state, c, 'Client resumed treatment.'); } return; }
    // Bill accrual: spread the specials target across the plan.
    const share = t.weeksTotal > 0 ? 1 / t.weeksTotal : 1;
    const perWeekBudget = c.specialsTarget * share;
    const open = t.plan.filter((p) => !p.done);
    if (open.length) {
      const providers = D.PROVIDERS;
      for (const p of open) {
        const def = providers[p.id];
        if (def.once) {
          if (p.billed === 0 && R.chance(p.id === 'er' || p.id === 'urgent' || p.id === 'pcp' ? 0.9 : 0.25)) {
            const amt = R.range(def.cost[0], def.cost[1]) * (c.severity >= 4 ? 1.5 : 1);
            if (p.id === 'surgery' || p.id === 'rehab') {
              // Surgery happens around the middle of treatment.
              if (t.weeksLeft < t.weeksTotal * 0.6) { p.billed = amt; p.done = true; t.surgeryDone = p.id === 'surgery' || t.surgeryDone; C.log(state, c, `${p.name} completed. Billed ${PI.money(amt)}.`); }
            } else { p.billed = amt; p.done = true; if (['ortho', 'mri', 'pain', 'neuro'].includes(p.id)) C.log(state, c, `Client seen by ${p.name.toLowerCase()}. Billed ${PI.money(amt)}.`); }
          }
        } else {
          p.billed += perWeekBudget * 0.35 / Math.max(1, open.filter((q) => !providers[q.id].once).length) + R.range(def.perWeek[0], def.perWeek[1]) * 0.5;
        }
      }
    }
    t.weeksLeft--;
    if (t.weeksLeft <= 0) {
      t.mmi = true;
      t.plan.forEach((p) => { p.done = true; if (p.billed === 0) p.billed = D.PROVIDERS[p.id].once ? R.range(D.PROVIDERS[p.id].cost[0], D.PROVIDERS[p.id].cost[1]) : 500; });
      // Scale total to the hidden target so severity drives value.
      const total = C.specials(c);
      const scale = (c.specialsTarget * (t.surgeryDone ? 1.25 : 1)) / Math.max(1, total);
      if (scale > 1) t.plan.forEach((p) => { p.billed *= scale; });
      t.plan.forEach((p) => { p.billed = Math.round(p.billed); });
      buildLiens(state, c);
      C.log(state, c, `Client reached maximum medical improvement. Total billed charges: ${PI.money(C.specials(c))}.`, 'good');
      if (c.stage === 'treatment') { setStage(state, c, 'records'); startRecords(state, c); }
    }
  }

  function buildLiens(state, c) {
    const cl = c.client;
    const liens = [];
    for (const p of c.treatment.plan) {
      const def = D.PROVIDERS[p.id];
      if (p.billed <= 0) continue;
      if (cl.health === 'none') {
        if (def.lop || def.lien === 'hospital') liens.push({ type: def.lien === 'hospital' ? 'hospital' : 'lop', holder: p.name, amount: Math.round(p.billed), status: 'open' });
      } else if (cl.health === 'medicare') {
        liens.push({ type: 'medicare', holder: 'CMS (Medicare)', amount: Math.round(p.billed * 0.32), status: 'open' });
      } else if (cl.health === 'medicaid') {
        liens.push({ type: 'medicaid', holder: 'State Medicaid agency', amount: Math.round(p.billed * 0.28), status: 'open' });
      } else {
        if (def.lop && R.chance(0.5)) liens.push({ type: 'lop', holder: p.name, amount: Math.round(p.billed), status: 'open' });
        else liens.push({ type: cl.health === 'erisa' ? 'erisa' : 'health', holder: cl.health === 'erisa' ? 'Employer self-funded plan' : 'Health insurer', amount: Math.round(p.billed * 0.45), status: 'open' });
      }
    }
    // Merge same-type payor liens.
    const merged = {};
    for (const l of liens) {
      const key = l.type === 'lop' || l.type === 'hospital' ? l.type + l.holder : l.type;
      if (!merged[key]) merged[key] = l; else merged[key].amount += l.amount;
    }
    c.liens = Object.values(merged);
    c.liensBuilt = true;
    if (c.flags.includes('comp')) c.liens.push({ type: 'comp', holder: 'Workers\' compensation carrier', amount: Math.round(C.specials(c) * 0.5 + c.wage * 0.66), status: 'open' });
    if (cl.medpay && c.medpayUsed) c.liens.push({ type: 'medpay', holder: 'Client\'s auto carrier (med-pay)', amount: c.medpayUsed, status: 'open' });
    if (R.chance(0.04)) c.liens.push({ type: 'childsupport', holder: 'State child support enforcement', amount: R.int(2000, 18000), status: 'open' });
  }

  function weeklyInvestigation(state, c, ctx) {
    const d = c.defendant;
    if (!d.adjuster && c.weeksInStage >= 1 && !d.uninsured) {
      d.adjuster = personName();
      d.adjusterStyle = R.pick(D.ADJUSTER_STYLES).id;
      c.known.insurer = true;
      C.log(state, c, `Claim acknowledged by ${D.INSURERS.find((i) => i.id === d.insurer).name}. Adjuster ${d.adjuster} assigned (${D.ADJUSTER_STYLES.find((s) => s.id === d.adjusterStyle).name.toLowerCase()}).`);
    }
    if (d.uninsured && c.weeksInStage >= 2 && !c.known.uninsured) {
      c.known.uninsured = true;
      C.log(state, c, 'Defendant has no liability insurance. Recovery depends on the client\'s own UM/UIM coverage.', 'bad');
      if (!c.known.um) { c.known.um = true; C.log(state, c, c.client.umLimit ? `Client carries ${PI.money(c.client.umLimit)} in UM/UIM coverage.` : 'Client carries no UM/UIM coverage.', c.client.umLimit ? 'good' : 'bad'); }
      if (!c.client.umLimit) return C.kill(state, c, 'dropped', 'No liability insurance and no UM coverage. There is nothing to recover. Case withdrawn.');
    }
    // Investigator on staff passively gathers evidence.
    if (ctx.inv && R.chance(0.3)) gainEvidence(state, c, R.pick(['photos', 'witnesses', 'scene']), 'Staff investigator');
    // Liability determination arrives after a few weeks.
    if (c.liability.determination == null && c.weeksInStage >= R.int(3, 6) && (d.adjuster || d.uninsured)) {
      const L = C.effectiveLiability(c);
      const style = D.INSURERS.find((i) => i.id === d.insurer).style;
      let det;
      if (L > 0.8 - style * 0.15 && c.liability.cf < 0.1) det = 'accepted';
      else if (L < 0.45 || (style > 0.7 && L < 0.6)) det = 'denied';
      else det = 'disputed';
      if ((c.liability.evidence.video || c.liability.evidence.witnesses) && c.liability.cf > 0) { c.liability.cf *= 0.5; }
      c.liability.determination = det;
      c.liability.evidenceAtDet = Object.keys(c.liability.evidence).length;
      c.known.liability = true;
      const cfText = c.liability.cf > 0 ? ` They assert ${Math.round(c.liability.cf * 100)}% comparative fault on your client.` : '';
      C.log(state, c, det === 'accepted' ? 'Carrier accepted liability.' : det === 'disputed' ? `Carrier disputes liability.${cfText}` : `Carrier denied liability outright.${cfText}`, det === 'accepted' ? 'good' : 'warn');
      setStage(state, c, c.treatment.mmi ? 'records' : 'treatment');
      if (c.treatment.mmi) startRecords(state, c);
    }
  }

  function gainEvidence(state, c, kind, source) {
    if (c.liability.evidence[kind]) return false;
    c.liability.evidence[kind] = true;
    const names = { policeReport: 'police report', photos: 'scene and vehicle photographs', witnesses: 'witness statements', video: 'surveillance or camera footage', scene: 'scene inspection report', blackbox: 'vehicle event data recorder download' };
    C.log(state, c, `${source} obtained ${names[kind]}.`, 'good');
    c.docs.push({ day: state.day, name: names[kind] });
    return true;
  }

  function startRecords(state, c) {
    c.records.started = true;
    for (const p of c.treatment.plan) {
      if (p.billed <= 0) continue;
      p.recordsRequested = true;
      p.recordsWeeks = R.int(2, 8);
      p.recordCost = R.int(25, 180);
    }
    C.log(state, c, 'HIPAA authorizations signed. Records and billing requests sent to every provider.');
  }

  function weeklyRecords(state, c, ctx) {
    let allIn = true;
    for (const p of c.treatment.plan) {
      if (p.billed <= 0 || p.recordsReceived) continue;
      p.recordsWeeks -= ctx.para * ctx.speed;
      if (p.recordsWeeks <= 0) {
        p.recordsReceived = true;
        C.addCost(state, c, p.recordCost, `Records from ${p.name}`);
        c.docs.push({ day: state.day, name: `Records and bills: ${p.name}` });
      } else allIn = false;
    }
    if (allIn) {
      c.records.complete = true;
      C.log(state, c, 'All medical records and bills received. Ready to draft a demand.', 'good');
      setStage(state, c, 'demand');
      c.demand = { drafted: 0, draftNeed: 3 + c.severity, sent: false };
    }
  }

  function weeklyDemand(state, c, ctx) {
    if (!c.demand) c.demand = { drafted: 0, draftNeed: 3 + c.severity, sent: false };
    if (!c.demand.sent) {
      c.demand.drafted += ctx.speed * ctx.para * (1 + skill(state, c, 'negotiation') / 20);
      if (c.demand.drafted >= c.demand.draftNeed && !c.demand.ready) {
        c.demand.ready = true;
        C.log(state, c, 'Demand package drafted: liability summary, records, bills, wage documentation and a pain-and-suffering narrative. Awaiting your demand figure.', 'good');
        c.pending = { type: 'demand' };
      }
    }
  }

  // Hidden reserve: what the adjuster is actually authorized to pay right now.
  C.reserve = function (state, c, inLit, ignoreDemand) {
    const ins = D.INSURERS.find((i) => i.id === c.defendant.insurer);
    const adj = D.ADJUSTER_STYLES.find((s) => s.id === c.defendant.adjusterStyle) || D.ADJUSTER_STYLES[1];
    let exp = C.expectedValue(state, c);
    let factor = 1 - ins.style * 0.45 - adj.mod;
    if (inLit) factor = 0.88 - ins.style * 0.12 + (c.litigation.stageIndex || 0) * 0.015;
    factor += (skill(state, c, 'negotiation') - 5) * 0.025;
    // Carriers reserve against the firm's record, not its billboards.
    factor += (((state.carrierRep == null ? 30 : state.carrierRep) - 40) / 100) * 0.3;
    const cred = PI.Firm.carrier(state, c.defendant.insurer).credibility;
    factor += cred * 0.012;
    if (!c.treatment.mmi) { const prog = PI.clamp(1 - c.treatment.weeksLeft / Math.max(1, c.treatment.weeksTotal), 0, 1); factor *= 0.72 + 0.22 * prog; } // open-ended treatment: the adjuster discounts hard
    if (c.liability.determination === 'denied' && !inLit) factor *= 0.4;
    const ev = c.liability.evidence;
    if (ev.video || ev.witnesses) factor += 0.04;
    if (c.flags.includes('minor_damage')) factor -= 0.05;
    if (c.demand && c.demand.quality) factor += (c.demand.quality - 1) * 0.1;
    let r = exp * PI.clamp(factor, 0.2, 1.1);
    // Demands below the reserve are accepted: an anchor set low is money left behind.
    if (!ignoreDemand && c.demand && c.demand.amount && c.demand.amount < r) r = c.demand.amount;
    const cap = C.collectible(state, c);
    return Math.min(r, cap);
  };

  // What the attorney thinks the carrier will authorize: a range that narrows with negotiation skill.
  C.carrierRead = function (state, c) {
    const r = C.reserve(state, c, c.stage === 'litigation', true);
    const sk = skill(state, c, 'negotiation');
    const noise = 0.45 - sk * 0.035;
    return { lo: Math.round(r * (1 - noise) / 500) * 500, hi: Math.round(r * (1 + noise) / 500) * 500 };
  };

  C.sendDemand = function (state, c, amount, timeLimited) {
    const cap = C.collectible(state, c);
    c.demand.amount = amount;
    c.demand.sentDay = state.day;
    c.demand.sent = true;
    c.demand.timeLimited = !!timeLimited;
    c.demand.deadlineDay = state.day + (timeLimited ? 30 : 45);
    c.demand.quality = 0.9 + skill(state, c, 'negotiation') / 50 + (state.staffCounts && state.staffCounts.paralegal ? 0.05 : 0);
    c.pending = null;
    c.demand.ready = true;
    const raw = C.reserve(state, c, false, true);
    c.demand.ratio = amount / Math.max(1, raw);
    if (c.demand.ratio > 2.5) PI.Firm.carrierNote(state, c.defendant.insurer, -1, 'unreasonable demand');
    if (timeLimited && C.expectedValue(state, c) < cap * 0.7) { PI.Firm.carrierNote(state, c.defendant.insurer, -2, 'bluffed a policy-limits demand'); state.carrierRep = PI.clamp((state.carrierRep || 30) - 1, 0, 100); }
    c.docs.push({ day: state.day, name: `Demand letter (${PI.money(amount)}${timeLimited ? ', time-limited policy-limits demand' : ''})` });
    C.log(state, c, `Demand sent for ${PI.money(amount)}${timeLimited ? ' as a time-limited policy-limits demand with a 30-day deadline' : ''}.`, 'stage');
    if (amount > C.trueValue(state, c) * 4 && cap > amount) C.log(state, c, 'The demand is far above any realistic valuation. Expect the adjuster to treat it as noise.', 'warn');
    setStage(state, c, 'negotiation');
    const basePatience = (D.ADJUSTER_STYLES.find((s) => s.id === c.defendant.adjusterStyle) || D.ADJUSTER_STYLES[1]).patience;
    c.negotiation = { round: 0, offers: [], currentOffer: 0, responseWeek: state.week + R.int(2, 4), finalOffer: false, patience: basePatience, escalated: false, awaiting: true };
    if (c.demand.ratio > 2.5) { c.negotiation.patience += 1; c.negotiation.lowStart = true; C.log(state, c, 'The demand is well above the carrier\'s evaluation. Expect a lower opening offer and more rounds.', 'warn'); }
    else if (c.demand.ratio < 1.35) { c.negotiation.patience = Math.max(2, basePatience - 1); c.negotiation.quickClose = true; }
    if (timeLimited) c.negotiation.responseWeek = state.week + R.int(3, 5);
  };

  function weeklyNegotiation(state, c, ctx) {
    const n = c.negotiation;
    if (!n.awaiting) return;
    if (state.week < n.responseWeek) return;
    n.awaiting = false;
    const ins = D.INSURERS.find((i) => i.id === c.defendant.insurer);
    const adj = D.ADJUSTER_STYLES.find((s) => s.id === c.defendant.adjusterStyle) || D.ADJUSTER_STYLES[1];
    const reserve = C.reserve(state, c, false);
    const cap = C.collectible(state, c);

    // Time-limited policy-limits demand: did the carrier tender in time?
    if (c.demand.timeLimited && n.round === 0) {
      const exposure = C.expectedValue(state, c) / Math.max(1, cap);
      const tenderChance = PI.clamp(0.95 - ins.style * 0.6 - adj.mod * 1.5 + (exposure - 1) * 0.3 + (C.effectiveLiability(c) - 0.8), 0.1, 0.95);
      if (state.day > c.demand.deadlineDay - 7 && !R.chance(tenderChance)) {
        c.demand.blown = true;
        C.log(state, c, `${ins.name} let the 30-day deadline pass without tendering the ${PI.money(c.defendant.limits)} policy. The carrier is now exposed to an excess verdict for bad faith.`, 'good');
        n.round++;
        const offer = Math.round(reserve * R.range(0.3, 0.5) / 500) * 500;
        n.offers.push({ day: state.day, from: 'adjuster', amount: offer, note: 'Late, below-limits offer after the deadline.' });
        n.currentOffer = offer;
        c.pending = { type: 'offer' };
        return;
      }
      if (exposure >= 0.85 || reserve >= cap * 0.9) {
        const offer = cap;
        n.offers.push({ day: state.day, from: 'adjuster', amount: offer, note: 'Policy limits tendered within the deadline.' });
        n.currentOffer = offer;
        C.log(state, c, `${ins.name} tendered policy limits of ${PI.money(offer)} within the deadline.`, 'good');
        c.pending = { type: 'offer' };
        return;
      }
    }

    n.round++;
    if (c.liability.determination === 'denied' && n.round === 1 && R.chance(0.6)) {
      n.offers.push({ day: state.day, from: 'adjuster', amount: 0, note: 'Carrier maintains its liability denial and declines to make an offer.' });
      n.currentOffer = 0;
      C.log(state, c, `${c.defendant.adjuster} declined to make any offer, standing on the liability denial.`, 'warn');
      c.pending = { type: 'offer' };
      return;
    }
    if (c.demand.amount > C.trueValue(state, c) * 4 && n.round === 1 && R.chance(0.7)) {
      n.offers.push({ day: state.day, from: 'adjuster', amount: 0, note: 'Adjuster calls the demand unreasonable and asks for a realistic number.' });
      n.currentOffer = 0;
      C.log(state, c, `${c.defendant.adjuster} refused to respond with a number, calling the demand "not a serious attempt to resolve the claim."`, 'warn');
      c.pending = { type: 'offer' };
      return;
    }
    const progress = Math.min(1, Math.pow(n.round / n.patience, 0.75));
    const start = n.lowStart ? 0.3 : n.quickClose ? 0.6 : 0.4;
    let offer = reserve * (start + (0.98 - start) * progress) * R.range(0.95, 1.03);
    if (n.lastCounter && n.lastCounter <= reserve * 1.08) offer = Math.max(offer, Math.min(n.lastCounter, reserve) * R.range(0.96, 1.0));
    if (n.round >= n.patience) { n.finalOffer = true; offer = Math.max(offer, reserve * R.range(0.96, 1.0)); }
    offer = Math.max(offer, n.currentOffer * 1.01);
    offer = Math.min(offer, cap);
    offer = Math.round(offer / 250) * 250;
    n.offers.push({ day: state.day, from: 'adjuster', amount: offer, note: n.finalOffer ? 'Represented as the carrier\'s final offer.' : '' });
    n.currentOffer = offer;
    C.log(state, c, `${c.defendant.adjuster} offered ${PI.money(offer)}${n.finalOffer ? ' and called it final' : ''}.`, 'offer');
    c.pending = { type: 'offer' };
  }

  C.counter = function (state, c, amount) {
    const n = c.negotiation;
    n.offers.push({ day: state.day, from: 'firm', amount });
    n.lastCounter = amount;
    n.awaiting = true;
    n.responseWeek = state.week + R.int(1, 3);
    c.pending = null;
    C.log(state, c, `Countered at ${PI.money(amount)}.`);
  };
  C.escalate = function (state, c) {
    const n = c.negotiation;
    if (n.escalated) return;
    n.escalated = true;
    n.patience += 1;
    n.finalOffer = false;
    c.negotiation.bonus = (c.negotiation.bonus || 0) + 0.06;
    n.awaiting = true; n.responseWeek = state.week + R.int(2, 3); c.pending = null;
    C.log(state, c, 'Requested review by the adjuster\'s supervisor and sent a bad-faith reminder letter.');
  };
  C.acceptOffer = function (state, c, amount) {
    const n = c.negotiation || {};
    const inLit = c.stage === 'litigation';
    c.pending = null;
    const raw = C.reserve(state, c, inLit, true);
    const ratio = amount / Math.max(1, raw);
    state.stats.acceptRatioSum = (state.stats.acceptRatioSum || 0) + Math.min(1.2, ratio); state.stats.acceptN = (state.stats.acceptN || 0) + 1;
    if (ratio < 0.72 && !n.finalOffer && !inLit) { PI.Firm.carrierNote(state, c.defendant.insurer, -1, 'took an early lowball'); state.carrierRep = PI.clamp((state.carrierRep || 30) - 0.8, 0, 100); C.log(state, c, 'Accepted well below the carrier\'s authority. Adjusters remember who folds.', 'warn'); }
    else if (ratio >= 0.95) { state.carrierRep = PI.clamp((state.carrierRep || 30) + 0.25, 0, 100); }
    C.log(state, c, `Settled for ${PI.money(amount)}${inLit ? ' during litigation' : ' pre-suit'}. Release signed; check expected within weeks.`, 'good');
    c.docs.push({ day: state.day, name: 'Settlement agreement and release' });
    startDisbursement(state, c, amount, inLit ? 'settled_lit' : 'settled');
  };

  // UIM: the client's own policy pays above the defendant's limits.
  C.openUIM = function (state, c) {
    if (c.uim || !c.client.umLimit) return;
    c.uim = { opened: state.day, limit: c.client.umLimit, resolved: false };
    c.known.um = true;
    C.log(state, c, `Opened an underinsured-motorist claim with the client's own carrier (${PI.money(c.client.umLimit)} UM/UIM limits).`);
  };

  // ---------- Litigation ----------
  C.fileSuit = function (state, c) {
    const T = D.CASE_TYPES[c.type];
    if (T.expertRequired && !(c.litigation && c.litigation.experts && c.litigation.experts.some((e) => D.EXPERTS[e].required))) {
      // Pre-suit expert review is purchased through retainExpert.
      return false;
    }
    if (state.day > c.solDay) return false;
    c.pending = null;
    c.feePct = 0.4;
    const lit = c.litigation || { experts: [], expertBonus: 0, liabilityBonus: 0 };
    Object.assign(lit, { filed: true, filedDay: state.day, stageIndex: 0, stageWeeks: 0, stageNeed: R.int(1, 2), court: `${state.city.name} ${R.pick(['District', 'Superior', 'Circuit'])} Court`, judge: R.pick(D.JUDGES), defenseFirm: R.pick(D.DEFENSE_FIRMS), depos: { client: false, defendant: false, doctor: false }, ime: false, msjRuled: false, mediationDone: false, trialDate: null, badFaith: !!(c.demand && c.demand.blown), discoveryDispute: false });
    c.litigation = lit;
    if (!c.negotiation) c.negotiation = { round: 0, offers: [], currentOffer: 0, awaiting: false, patience: 4 };
    c.negotiation.awaiting = false;
    C.addCost(state, c, 450, 'Filing fee');
    state.carrierRep = PI.clamp((state.carrierRep || 30) + 0.6, 0, 100);
    PI.Firm.carrierNote(state, c.defendant.insurer, 1, 'filed suit');
    c.docs.push({ day: state.day, name: 'Complaint and jury demand' });
    C.log(state, c, `Complaint filed in ${lit.court}, assigned to ${lit.judge}. Fee converts to 40% under the retainer agreement.`, 'stage');
    if (c.stage !== 'litigation') setStage(state, c, 'litigation');
    return true;
  };

  C.retainExpert = function (state, c, expertId) {
    const E = D.EXPERTS[expertId];
    c.litigation = c.litigation || { experts: [], expertBonus: 0, liabilityBonus: 0 };
    if (c.litigation.experts.includes(expertId)) return;
    c.litigation.experts.push(expertId);
    C.addCost(state, c, E.cost, `Expert: ${E.name}`);
    if (E.liability) c.litigation.liabilityBonus += E.liability * 0.6;
    if (E.damages) c.litigation.expertBonus += E.damages;
    if (E.trial) c.litigation.trialBonus = (c.litigation.trialBonus || 0) + E.trial;
    C.log(state, c, `Retained ${E.name.toLowerCase()} for ${PI.money(E.cost)}.`);
  };

  function litStage(c) { return D.LIT_STAGES[c.litigation.stageIndex]; }
  C.litStage = litStage;

  function weeklyLitigation(state, c, ctx) {
    const lit = c.litigation;
    const n = c.negotiation;
    // Settlement talks can continue during litigation.
    if (n && n.awaiting && state.week >= n.responseWeek) {
      n.awaiting = false;
      const reserve = C.reserve(state, c, true) * (1 + (n.bonus || 0));
      let offer = Math.min(C.collectible(state, c), Math.max(n.currentOffer * 1.03, reserve * R.range(0.85, 1.0)));
      if (n.lastCounter && n.lastCounter <= reserve * 1.05) offer = Math.max(offer, Math.min(n.lastCounter, reserve));
      offer = Math.round(offer / 500) * 500;
      n.offers.push({ day: state.day, from: 'defense', amount: offer });
      n.currentOffer = offer;
      C.log(state, c, `Defense counsel conveyed an offer of ${PI.money(offer)}.`, 'offer');
      c.pending = { type: 'offer' };
      return;
    }
    if (c.pending) return; // waiting on the player
    const st = litStage(c);
    lit.stageWeeks += ctx.speed * (st.id === 'discovery' ? ctx.para : 1);
    if (lit.stageWeeks < lit.stageNeed) return;
    // Stage complete: apply effects and advance.
    completeLitStage(state, c, ctx, st);
  }

  function advanceLit(state, c, skipTo) {
    const lit = c.litigation;
    lit.stageIndex = skipTo != null ? skipTo : lit.stageIndex + 1;
    lit.stageWeeks = 0;
    const st = D.LIT_STAGES[lit.stageIndex];
    if (!st) return;
    let weeks = R.int(st.weeks[0], st.weeks[1]);
    if (st.id === 'pretrial') weeks = Math.max(weeks, Math.round(state.city.backlog - (state.day - lit.filedDay) / 7 + R.int(-8, 8)));
    lit.stageNeed = Math.max(1, weeks);
    if (st.cost) C.addCost(state, c, st.cost, st.name);
    C.log(state, c, `Litigation: ${st.name}.`, 'stage');
    if (st.id === 'trial') { lit.trialDate = state.day; C.log(state, c, `Trial begins before ${lit.judge}. Jury selection this morning.`, 'stage'); }
  }

  function completeLitStage(state, c, ctx, st) {
    const lit = c.litigation;
    const lskill = skill(state, c, 'litigation');
    switch (st.id) {
      case 'filing': advanceLit(state, c); break;
      case 'service':
        if (R.chance(0.15) && !lit.serviceRetry) { lit.serviceRetry = true; lit.stageWeeks = 0; lit.stageNeed = R.int(3, 6); C.addCost(state, c, 250, 'Special process server'); C.log(state, c, 'Defendant evaded service. Special process server retained.', 'warn'); return; }
        C.log(state, c, `Defendant served. ${lit.defenseFirm} appeared for the defense.`);
        advanceLit(state, c); break;
      case 'answer': advanceLit(state, c); break;
      case 'discovery':
        if (R.chance(0.3) && !lit.discoveryDispute) { lit.discoveryDispute = true; lit.stageWeeks = lit.stageNeed - 4; C.addCost(state, c, 150, 'Motion to compel'); C.log(state, c, 'Defense served boilerplate objections. Motion to compel filed and granted; sanctions denied.', 'warn'); return; }
        if (c.client.mood < 35 && R.chance(0.3)) { c.litigation.depoMod = (c.litigation.depoMod || 0) - 0.05; C.log(state, c, 'Client missed the deadline on interrogatory answers twice. The judge was not amused.', 'warn'); }
        c.docs.push({ day: state.day, name: 'Interrogatory answers and document production' });
        advanceLit(state, c); break;
      case 'depositions': {
        // Client deposition performance.
        const prep = ctx.speed > 0.7 ? 0.05 : -0.05;
        const perf = R.gauss(c.client.credibility + prep + (skill(state, c, 'client') - 5) * 0.015, 0.1);
        lit.depoMod = (lit.depoMod || 0) + PI.clamp(perf, -0.25, 0.2);
        lit.depos.client = true; lit.depos.defendant = true;
        C.addCost(state, c, 1400, 'Court reporter and transcripts (client and defendant depositions)');
        C.log(state, c, perf > 0.05 ? 'Client was credible and sympathetic at deposition. Defense counsel looked worried.' : perf < -0.05 ? 'Client deposition went poorly: inconsistent on prior injuries and activity levels.' : 'Client deposition was uneventful. Defendant admitted to looking at the radio.', perf > 0.05 ? 'good' : perf < -0.05 ? 'bad' : 'info');
        if (c.severity >= 2) { C.addCost(state, c, 2800, 'Treating physician deposition'); lit.depos.doctor = true; }
        if (R.chance(0.6)) { lit.ime = true; const pen = c.flags.includes('preexisting') ? R.range(0.1, 0.25) : R.range(0.03, 0.12); lit.imePenalty = (lit.experts || []).includes('medical') ? pen * 0.3 : pen; C.log(state, c, `Defense medical examiner opined the injuries were ${c.flags.includes('preexisting') ? 'degenerative and pre-existing' : 'resolved within six weeks'}.${lit.imePenalty < 0.05 ? ' Your medical expert\'s report blunts it.' : ''}`, 'warn'); }
        advanceLit(state, c); break;
      }
      case 'experts': {
        const T = D.CASE_TYPES[c.type];
        if (T.expertRequired && !lit.experts.some((e) => D.EXPERTS[e].required)) {
          return C.kill(state, c, 'lost', 'No qualified expert disclosed. Defense motion to dismiss granted.', false);
        }
        advanceLit(state, c); break;
      }
      case 'motions': {
        const L = C.effectiveLiability(c);
        if (L < 0.55 && !lit.msjRuled) {
          lit.msjRuled = true;
          const loseChance = PI.clamp(0.45 - L * 0.5 - (lskill - 5) * 0.04, 0.05, 0.5);
          C.addCost(state, c, 900, 'Summary judgment opposition');
          if (R.chance(loseChance)) return C.kill(state, c, 'lost', 'Defense motion for summary judgment granted. The court found no triable issue on liability.', false);
          C.log(state, c, 'Defense motion for summary judgment denied. The case proceeds to mediation.', 'good');
        }
        advanceLit(state, c); break;
      }
      case 'mediation': {
        lit.mediationDone = true;
        const n = c.negotiation;
        const reserve = C.reserve(state, c, true) * (1 + (n.bonus || 0));
        let offer = Math.min(C.collectible(state, c), reserve * R.range(0.9, 1.08));
        offer = Math.max(offer, n.currentOffer * 1.05);
        offer = Math.round(offer / 500) * 500;
        n.offers.push({ day: state.day, from: 'defense', amount: offer, note: `Mediator ${R.pick(D.MEDIATORS)}'s proposal after a full day.` });
        n.currentOffer = offer;
        n.mediationOffer = offer;
        C.log(state, c, `Mediation: after nine hours, the defense moved to ${PI.money(offer)}.`, 'offer');
        c.pending = { type: 'offer' };
        lit.afterMediation = true;
        if (c.delegated) C.autoPilot(state, c);
        break;
      }
      case 'pretrial': {
        if (R.chance(0.25) && !lit.continued) { lit.continued = true; lit.stageWeeks = 0; lit.stageNeed = R.int(8, 20); C.log(state, c, 'Trial continued: the court\'s criminal docket took priority. New setting in a few months.', 'warn'); return; }
        // Last chance offer on the courthouse steps.
        const n = c.negotiation;
        const reserve = C.reserve(state, c, true) * (1 + (n.bonus || 0)) * 1.08;
        const offer = Math.round(Math.min(C.collectible(state, c), Math.max(n.currentOffer * 1.08, reserve)) / 500) * 500;
        n.offers.push({ day: state.day, from: 'defense', amount: offer, note: 'Courthouse-steps offer the Friday before trial.' });
        n.currentOffer = offer;
        C.log(state, c, `Friday before trial: defense offers ${PI.money(offer)}. Accept or pick a jury Monday.`, 'offer');
        lit.stepsOffer = true;
        c.pending = { type: 'offer' };
        if (c.delegated) C.autoPilot(state, c);
        break;
      }
      case 'trial': runTrial(state, c, ctx); break;
      case 'posttrial': {
        if (lit.verdictCollectible > 0) startDisbursement(state, c, lit.verdictCollectible, 'verdict');
        break;
      }
      case 'appeal': {
        const roll = R.next();
        if (roll < 0.65) { C.log(state, c, 'Verdict affirmed on appeal. Judgment with interest is paid.', 'good'); startDisbursement(state, c, lit.verdictCollectible * 1.06, 'verdict'); }
        else if (roll < 0.92) { const red = R.range(0.6, 0.85); C.log(state, c, `Appellate court ordered a remittitur. Judgment reduced to ${PI.money(lit.verdictCollectible * red)} and paid.`, 'warn'); startDisbursement(state, c, lit.verdictCollectible * red, 'verdict'); }
        else { C.log(state, c, 'Verdict reversed on an evidentiary error. The parties settled for a fraction rather than retry.', 'bad'); startDisbursement(state, c, lit.verdictCollectible * 0.3, 'settled_lit'); }
        break;
      }
    }
  }

  function runTrial(state, c, ctx) {
    const lit = c.litigation;
    const lskill = skill(state, c, 'litigation');
    const L = C.effectiveLiability(c);
    const tb = lit.trialBonus || 0;
    let pWin = PI.clamp(L + (lskill - 5) * 0.035 + c.client.credibility + (lit.depoMod || 0) + tb - (c.flags.includes('immigration') ? 0.1 : 0), 0.05, 0.96);
    const cf = c.liability.cf;
    C.addCost(state, c, 4000 + (lit.experts.length * 6000), 'Trial exhibits and expert trial testimony');
    state.stats.trials++;
    const won = R.chance(pWin);
    if (!won) {
      state.stats.trialLosses++;
      C.log(state, c, `Defense verdict. The jury found ${cf > 0 ? 'your client more than 50% at fault' : 'no negligence by the defendant'}. The firm absorbs ${PI.money(c.costs)} in costs.`, 'bad');
      PI.Firm.log(state, `Defense verdict in ${c.clientName}. ${PI.money(c.costs)} in costs written off.`, 'bad');
      PI.Firm.adjustRep(state, -1);
      state.carrierRep = PI.clamp((state.carrierRep || 30) - 1.5, 0, 100);
      c.client.mood -= 30;
      return C.kill(state, c, 'lost', 'Case lost at trial.', false);
    }
    const jury = R.lognormal(1, 0.45);
    let gross = C.trueValue(state, c) * jury;
    if (cf > 0) gross *= 1 - cf;
    if (D.CASE_TYPES[c.type].punitive && R.chance(0.5)) { const pun = gross * R.range(0.3, 1.5); gross += pun; C.log(state, c, `Jury awarded ${PI.money(pun)} in punitive damages.`, 'good'); }
    gross = Math.round(gross / 1000) * 1000;
    const cap = C.collectible(state, c);
    const collectible = Math.min(gross, cap);
    lit.verdict = gross; lit.verdictCollectible = collectible;
    state.stats.trialWins++;
    state.stats.biggestVerdict = Math.max(state.stats.biggestVerdict, gross);
    C.log(state, c, `Plaintiff's verdict: ${PI.money(gross)}.${collectible < gross ? ` Only ${PI.money(collectible)} is collectible against the available coverage.` : ''}`, 'good');
    PI.Firm.log(state, `Jury verdict of ${PI.money(gross)} for ${c.clientName}.`, 'good');
    PI.Firm.adjustRep(state, gross > 1000000 ? 4 : 2);
    state.carrierRep = PI.clamp((state.carrierRep || 30) + (gross > 1000000 ? 6 : 4), 0, 100);
    PI.Firm.carrierNote(state, c.defendant.insurer, 3, 'beat them at trial');
    if (gross > 1000000) PI.Firm.news(state, `Local jury hands down ${PI.money(gross, { short: true })} verdict against ${c.defendant.name}; ${state.firmName} tried the case.`);
    // Appeal risk.
    if (gross > 400000 && R.chance(0.35)) { C.log(state, c, 'Defense filed a notice of appeal. Expect a year or more before the judgment is paid.', 'warn'); advanceLit(state, c, D.LIT_STAGES.findIndex((s) => s.id === 'appeal')); return; }
    advanceLit(state, c, D.LIT_STAGES.findIndex((s) => s.id === 'posttrial'));
  }

  // ---------- Disbursement ----------
  function startDisbursement(state, c, gross, how) {
    let uimAdd = 0;
    if (c.uim && !c.uim.resolved && gross >= c.defendant.limits * 0.95 && c.defendant.limits < c.client.umLimit) {
      const want = Math.min(C.expectedValue(state, c), c.client.umLimit) - c.defendant.limits;
      uimAdd = Math.max(0, Math.round(want * R.range(0.6, 0.95) / 500) * 500);
      c.uim.resolved = true; c.uim.recovered = uimAdd;
      if (uimAdd > 0) C.log(state, c, `UIM carrier paid ${PI.money(uimAdd)} on top of the liability settlement.`, 'good');
    }
    if (c.defendant.uninsured && c.client.umLimit) { gross = Math.min(gross, c.client.umLimit); }
    if (!c.liensBuilt) buildLiens(state, c);
    c.settlement = { gross: Math.round(gross + uimAdd), how, day: state.day, weeksToCheck: how === 'verdict' ? R.int(4, 10) : R.int(2, 4), liensNegotiated: false, negotiatingWeeks: 0, disbursed: false, early: !c.treatment.mmi };
    if (!c.treatment.mmi) { c.treatment.mmi = true; c.treatment.weeksLeft = 0; C.log(state, c, 'Settled before maximum medical improvement. The release covers any future treatment.', 'warn'); }
    if (c.flags.includes('child')) { c.settlement.weeksToCheck += 6; C.log(state, c, 'Minor\'s settlement requires court approval. Petition filed.'); }
    c.negotiation = c.negotiation || {}; c.negotiation.awaiting = false;
    setStage(state, c, 'disbursement');
    if (c.liens.length) c.pending = { type: 'liens' }; else { c.settlement.liensNegotiated = true; }
    if (c.delegated) C.autoPilot(state, c);
  }
  C.startDisbursement = startDisbursement;

  C.negotiateLiens = function (state, c, ctx) {
    const s = c.settlement;
    s.liensNegotiated = true; s.negotiating = true; s.negotiatingWeeks = R.int(2, 6);
    c.pending = null;
    C.log(state, c, 'Lien reduction requests sent to every lienholder with the settlement statement and procurement-cost arguments.');
  };
  C.payLiensFull = function (state, c) { c.settlement.liensNegotiated = true; c.pending = null; C.log(state, c, 'Liens will be paid as billed.'); };

  function weeklyDisbursement(state, c, ctx) {
    const s = c.settlement;
    if (c.pending) return;
    if (s.negotiating) {
      s.negotiatingWeeks -= ctx.lien ? 1.6 : 1;
      if (s.negotiatingWeeks <= 0) {
        s.negotiating = false;
        const sk = ctx.lien ? 8 : skill(state, c, 'negotiation');
        let saved = 0;
        for (const l of c.liens) {
          const def = D.LIEN_TYPES[l.type];
          let red = R.range(def.reducible[0], def.reducible[1]) * (0.7 + sk / 20);
          // Statutory and made-whole caps: a lien cannot exceed the client's share.
          const red2 = PI.clamp(red, 0, 0.9);
          l.reduction = Math.round(l.amount * red2);
          saved += l.reduction;
          l.status = 'reduced';
        }
        // Limits cases: lienholders accept pro-rata reductions so the client actually nets something.
        const available = s.gross * (1 - c.feePct) - c.costs;
        const rigid = (l) => ['erisa', 'childsupport', 'medicare', 'comp'].includes(l.type);
        let remaining = c.liens.reduce((a, l) => a + l.amount - l.reduction, 0);
        if (remaining > available * 0.7) {
          const flexible = c.liens.filter((l) => !rigid(l));
          const flexTotal = flexible.reduce((a, l) => a + l.amount - l.reduction, 0);
          const rigidTotal = remaining - flexTotal;
          const targetFlex = Math.max(0, available * 0.7 - rigidTotal);
          if (flexTotal > 0 && targetFlex < flexTotal) {
            const ratio = targetFlex / flexTotal;
            for (const l of flexible) { const after = Math.round((l.amount - l.reduction) * ratio); saved += (l.amount - l.reduction) - after; l.reduction = l.amount - after; }
            C.log(state, c, 'Lienholders agreed to pro-rata reductions because the recovery was limited by the available coverage.');
          }
        }
        C.log(state, c, `Lien negotiations complete: ${PI.money(saved)} in reductions, all of which goes to the client.`, 'good');
      }
      return;
    }
    s.weeksToCheck -= 1;
    if (s.weeksToCheck <= 0 && !s.disbursed) disburse(state, c);
  }

  C.statement = function (state, c) {
    const s = c.settlement;
    const gross = s.gross;
    const fee = Math.round(gross * c.feePct);
    const costs = Math.round(c.costs);
    const liens = c.liens.reduce((a, l) => a + (l.amount - (l.reduction || 0)), 0);
    const referral = c.channel === 'network' ? Math.round(fee * D.CHANNELS.network.fee) : 0;
    let net = gross - fee - costs - liens;
    let feeAdj = fee;
    // Attorneys routinely cut their fee so a client never nets less than their lienholders.
    let feeCut = 0;
    if (net < liens * 0.5 && net < gross * 0.25) { feeCut = Math.min(fee * 0.5, Math.round(liens * 0.5 - net)); feeAdj -= feeCut; net += feeCut; }
    if (net < 0) { feeCut += Math.min(feeAdj, -net); feeAdj = Math.max(0, feeAdj + net); net = Math.max(0, net); }
    return { gross, fee, feeCut, feeNet: feeAdj, costs, liens, referral, net: Math.max(0, net), firmCash: feeAdj - referral + costs };
  };

  function disburse(state, c) {
    const st = C.statement(state, c);
    const s = c.settlement;
    s.disbursed = true;
    s.statement = st;
    PI.Firm.earn(state, st.feeNet - st.referral, `Attorney fee: ${c.clientName}`, 'fees');
    if (st.costs) PI.Firm.earn(state, st.costs, `Case costs reimbursed: ${c.clientName}`, 'costs_recovered');
    if (st.referral) PI.Firm.log(state, `Paid ${PI.money(st.referral)} referral fee on ${c.clientName}.`);
    state.stats.feesEarned += st.feeNet - st.referral;
    { const k = PI.Firm.carrier(state, c.defendant.insurer); k.cases++; k.paid += st.gross; }
    state.stats.recovered += st.gross;
    state.stats.resolved++;
    state.stats.biggestSettlement = Math.max(state.stats.biggestSettlement, st.gross);
    if (s.how === 'settled') state.stats.settledPreSuit++; else if (s.how === 'settled_lit') state.stats.settledLit++;
    const exp = Math.max(C.expectedValue(state, c), s.early ? C.potentialValue(state, c) : 0);
    const ratio = st.net / Math.max(1, exp * 0.5 * c.client.expectations);
    const weeksOpen = (state.day - (c.signedDay || c.createdDay)) / 7;
    const processed = (1 - (c.speedLast || 1)) * 25; // clients can tell when they are a file number
    let sat = PI.clamp(40 + ratio * 35 + (c.client.mood - 50) * 0.5 - weeksOpen / 8 + (weeksOpen < 30 && ratio > 1 ? 8 : 0) - processed, 0, 100);
    c.satisfaction = Math.round(sat);
    state.stats.satSum = (state.stats.satSum || 0) + c.satisfaction; state.stats.satN = (state.stats.satN || 0) + 1;
    if (s.early && c.severity >= 2 && R.chance(c.severity >= 3 ? 0.5 : 0.25)) { state.scheduledCaseEvents = state.scheduledCaseEvents || []; state.scheduledCaseEvents.push({ week: state.week + R.int(8, 30), caseId: c.id, kind: 'early_regret' }); }
    c.stage = 'closed'; c.closedDay = state.day; c.pending = null;
    C.log(state, c, `Disbursed. Client netted ${PI.money(st.net)}; firm fee ${PI.money(st.feeNet)}${st.feeCut ? ` (fee reduced by ${PI.money(st.feeCut)} so the client nets something)` : ''}. Client satisfaction ${c.satisfaction}/100.`, 'good');
    PI.Firm.log(state, `${c.clientName} closed: ${PI.money(st.gross)} gross, ${PI.money(st.feeNet)} fee.`, 'good');
    if (sat > 75) { state.referralCredits = (state.referralCredits || 0) + (sat > 90 ? 2 : 1); PI.Firm.adjustRep(state, 0.4); }
    if (sat < 35) { PI.Firm.adjustRep(state, -0.8); if (R.chance(0.15)) PI.Firm.barComplaint(state, `${c.clientName} filed a bar complaint over the fee and communication.`); }
    const att = PI.Firm.staffById(state, c.attorneyId);
    if (att) { att.resolved = (att.resolved || 0) + 1; att.feesGenerated = (att.feesGenerated || 0) + st.feeNet; if (R.chance(0.3)) PI.Firm.gainSkill(state, att, s.how === 'verdict' ? 'litigation' : 'negotiation'); }
  }

  // ---------- Available actions for the UI ----------
  C.actions = function (state, c) {
    const a = [];
    const T = D.CASE_TYPES[c.type];
    const ev = c.liability.evidence;
    const lit = c.litigation;
    const preSuit = !(lit && lit.filed);
    const open = C.isOpen(c);
    if (!open) return a;
    const inv = ['investigation', 'treatment', 'records', 'demand', 'negotiation'].includes(c.stage);
    if (c.noticeDay && !c.noticeServed) a.push({ id: 'notice', name: 'Serve notice of claim', desc: `Required against a government entity. Due ${PI.fmtDate(c.noticeDay)}.`, cost: 0, urgent: state.day > c.noticeDay - 45 });
    if (inv) {
      if (T.cat === 'auto' && !ev.policeReport) a.push({ id: 'police', name: 'Order police report', desc: 'Crash report with the officer\'s narrative, diagram and any citations.', cost: 25 });
      if (!ev.photos) a.push({ id: 'photos', name: 'Collect photographs', desc: 'Vehicle damage, scene, injuries. Client phone photos plus a site visit.', cost: 150 });
      if (!ev.witnesses) a.push({ id: 'investigator', name: 'Hire investigator', desc: 'Locate and interview witnesses, canvass for cameras.', cost: state.staffCounts.investigator ? 0 : 850 });
      if (!ev.video && !c.spoliationSent) a.push({ id: 'spoliation', name: 'Send preservation letters', desc: 'Demand that nearby businesses, the defendant and any motor carrier preserve video and electronic data before it is overwritten.', cost: 0 });
      if (!ev.scene && T.cat !== 'professional') a.push({ id: 'scene', name: 'Scene inspection', desc: 'Measure, photograph and document the scene. Essential in premises cases.', cost: 400 });
      if (!c.known.limits && c.known.insurer && !c.defendant.uninsured) a.push({ id: 'limits', name: 'Request policy limits disclosure', desc: 'Statutory letter demanding the declarations page. Response in a few weeks.', cost: 0 });
      if (!c.known.um) a.push({ id: 'um', name: 'Review client\'s own auto policy', desc: 'Check for UM/UIM and med-pay coverage. Takes an hour and can double the recovery.', cost: 0 });
      if (c.client.medpay && !c.medpayUsed && c.known.um) a.push({ id: 'medpay', name: 'Submit med-pay claim', desc: `Client's own policy has ${PI.money(c.client.medpay)} of med-pay. Pays bills now, reduces liens later.`, cost: 0 });
      if (!c.known.health) a.push({ id: 'health', name: 'Identify health coverage and liens', desc: 'Who paid the bills? Health plan, Medicare, Medicaid or nobody. Determines the lien fight at the end.', cost: 0 });
    }
    if (!c.treatment.mmi && ['investigation', 'treatment'].includes(c.stage)) {
      if (!c.treatment.referred && c.severity <= 2) a.push({ id: 'refer_specialist', name: 'Refer to specialist on LOP', desc: 'Orthopedic evaluation and MRI on a letter of protection. Raises specials and value, adds a lien.', cost: 0 });
      if (c.treatment.surgeryIndicated && !c.treatment.surgeryDone && !c.treatment.surgeryDeclined) a.push({ id: 'surgery', name: 'Discuss recommended surgery with client', desc: 'The orthopedist recommends surgery. It raises value substantially but extends the case by months.', cost: 0 });
    }
    if (open && c.stage !== 'disbursement') a.push({ id: 'call', name: 'Call the client', desc: 'A twenty-minute status call. Keeps the client treating, informed and loyal.', cost: 0 });
    if (c.known.um && c.client.umLimit > 0 && !c.uim && !c.defendant.uninsured && c.client.umLimit > c.defendant.limits && c.known.limits) a.push({ id: 'uim', name: 'Open UIM claim', desc: `Client's ${PI.money(c.client.umLimit)} UIM limits exceed the defendant's ${PI.money(c.defendant.limits)}. The client's own carrier pays the difference.`, cost: 0 });
    if (['investigation', 'treatment'].includes(c.stage) && c.liability.determination != null && !c.treatment.mmi && C.specials(c) > 0) a.push({ id: 'demand_early', name: 'Demand now, before MMI', desc: 'The volume play: settle on the bills to date. Faster money, smaller case, and the client signs away future treatment. Carriers discount an open-ended injury by about 12%.', cost: 0, group: 'strategy' });
    if (['treatment', 'records', 'demand', 'negotiation'].includes(c.stage) && ['disputed', 'denied'].includes(c.liability.determination) && !c.liability.reevaluated && Object.keys(c.liability.evidence).length > (c.liability.evidenceAtDet || 0)) a.push({ id: 'reeval', name: 'Submit new evidence to carrier', desc: 'Ask the adjuster to reconsider liability in light of what the investigation turned up. One shot.', cost: 0 });
    if (c.stage === 'demand' && c.demand && c.demand.ready && !c.demand.sent) a.push({ id: 'demand', name: 'Set demand and send', desc: 'Pick the number. Anchors the whole negotiation.', cost: 0, primary: true });
    if (c.stage === 'negotiation' && !c.negotiation.awaiting && c.pending && c.pending.type === 'offer') a.push({ id: 'respond', name: 'Respond to offer', desc: `Current offer: ${PI.money(c.negotiation.currentOffer)}.`, cost: 0, primary: true });
    if (c.stage === 'negotiation' && c.negotiation.round > 0 && !c.negotiation.escalated && !c.negotiation.awaiting) a.push({ id: 'escalate', name: 'Escalate to supervisor', desc: 'Demand a supervisor review and put the carrier on notice of bad faith. One shot per case.', cost: 0 });
    if (['negotiation', 'demand', 'records', 'treatment', 'investigation'].includes(c.stage) && c.liability.determination != null) {
      const needExpert = T.expertRequired && !(lit && lit.experts.some((e) => D.EXPERTS[e].required));
      a.push({ id: 'file', name: 'File suit', desc: needExpert ? 'Requires a pre-suit expert review first (see experts).' : `Complaint, filing fee, 40% fee. Statute runs ${PI.fmtDate(c.solDay)}.`, cost: 450, disabled: needExpert, urgent: c.solDay - state.day < 90 });
    }
    if (c.stage === 'litigation' && c.pending && c.pending.type === 'offer') a.push({ id: 'respond', name: 'Respond to offer', desc: `Current offer: ${PI.money(c.negotiation.currentOffer)}.`, cost: 0, primary: true });
    if (c.stage === 'litigation' && !c.pending && !c.negotiation.awaiting && lit.stageIndex >= 3 && lit.stageIndex <= 8) a.push({ id: 'reopen', name: 'Reopen settlement talks', desc: 'Send a renewed demand to defense counsel. They respond in a few weeks.', cost: 0 });
    // Experts available from negotiation onward (pre-suit expert review) through expert disclosures.
    if (['negotiation', 'demand', 'litigation'].includes(c.stage) && (!lit || lit.stageIndex == null || lit.stageIndex <= 5)) {
      for (const [id, E] of Object.entries(D.EXPERTS)) {
        if (lit && lit.experts.includes(id)) continue;
        if (E.types && !E.types.includes(c.type)) continue;
        if (E.cats && !E.cats.includes(T.cat)) continue;
        if (E.minSev && c.severity < E.minSev) continue;
        if (id === 'jury' && !(lit && lit.filed && lit.stageIndex >= 7)) continue;
        a.push({ id: 'expert:' + id, name: `Retain ${E.name.toLowerCase()}`, desc: `${E.liability ? `Liability +${Math.round(E.liability * 60)}%. ` : ''}${E.damages ? `Damages +${Math.round(E.damages * 100)}%. ` : ''}${E.trial ? 'Improves trial odds. ' : ''}${E.required ? 'Required to file this case type.' : ''}`, cost: E.cost, group: 'experts' });
      }
    }
    if (c.stage === 'disbursement' && c.pending && c.pending.type === 'liens') a.push({ id: 'liens', name: 'Handle liens', desc: 'Negotiate reductions or pay as billed.', cost: 0, primary: true });
    if (open) a.push({ id: 'toggle_delegate', name: c.delegated ? 'Take hands-on control' : 'Delegate to assigned attorney', desc: c.delegated ? 'You make every decision on this file.' : 'The assigned attorney makes demand, offer and lien decisions using their own judgment.', cost: 0, group: 'manage' });
    if (open && c.stage !== 'disbursement') a.push({ id: 'withdraw', name: 'Withdraw from representation', desc: 'Drop the case. Costs advanced are written off. Small reputation hit.', cost: 0, group: 'manage', danger: true });
    return a;
  };

  C.act = function (state, c, id, payload) {
    const T = D.CASE_TYPES[c.type];
    payload = payload || {};
    if (id.startsWith('expert:')) { C.retainExpert(state, c, id.slice(7)); return true; }
    switch (id) {
      case 'notice': c.noticeServed = true; c.docs.push({ day: state.day, name: 'Notice of claim (government entity)' }); C.log(state, c, 'Notice of claim served on the city attorney and risk manager.', 'good'); return true;
      case 'police': C.addCost(state, c, 25, 'Police report'); gainEvidence(state, c, 'policeReport', 'Records clerk'); if (c.flags.includes('citation')) C.log(state, c, 'The report shows the defendant was cited at the scene.', 'good'); return true;
      case 'photos': C.addCost(state, c, 150, 'Photographs'); gainEvidence(state, c, 'photos', 'Paralegal'); return true;
      case 'investigator': {
        const cost = state.staffCounts.investigator ? 0 : 850;
        C.addCost(state, c, cost, 'Private investigator');
        const sk = state.staffCounts.investigator ? 0.85 : 0.65;
        if (R.chance(sk) || c.flags.includes('witness')) gainEvidence(state, c, 'witnesses', 'Investigator'); else C.log(state, c, 'Investigator canvassed the area. No cooperative witnesses found.', 'warn');
        if (R.chance(0.25)) gainEvidence(state, c, 'photos', 'Investigator');
        return true;
      }
      case 'spoliation': {
        c.spoliationSent = true;
        c.docs.push({ day: state.day, name: 'Preservation (spoliation) letters' });
        const weeksSince = (state.day - c.incidentDay) / 7;
        const decay = Math.max(0.1, 1 - Math.max(0, weeksSince - 2) / 10);
        const chance = c.flags.includes('dashcam') ? 1 : (T.cat === 'premises' || c.type === 'trucking' || c.type === 'rideshare' ? 0.7 : 0.4) * decay;
        if (R.chance(chance)) gainEvidence(state, c, 'video', 'Preservation letter'); else C.log(state, c, weeksSince > 6 ? 'Preservation letters sent too late. Every camera in the area had already overwritten the footage.' : 'Preservation letters sent. No footage surfaced; the store says its system overwrites every 72 hours.', 'warn');
        if (c.type === 'trucking' && R.chance(0.6)) gainEvidence(state, c, 'blackbox', 'Preservation letter');
        return true;
      }
      case 'scene': C.addCost(state, c, 400, 'Scene inspection'); gainEvidence(state, c, 'scene', 'Investigator'); return true;
      case 'limits': c.known.limits = true; C.log(state, c, `Carrier disclosed policy limits of ${PI.money(c.defendant.limits)}${c.defendant.umbrella ? ` plus a ${PI.money(c.defendant.umbrella)} umbrella policy` : ''}.`, c.defendant.limits >= C.expectedValue(state, c) ? 'good' : 'warn'); return true;
      case 'um': c.known.um = true; C.log(state, c, c.client.umLimit ? `Client's own policy carries ${PI.money(c.client.umLimit)} UM/UIM${c.client.medpay ? ` and ${PI.money(c.client.medpay)} med-pay` : ''}.` : `Client's own policy has no UM/UIM coverage${c.client.medpay ? ` but does carry ${PI.money(c.client.medpay)} med-pay` : ''}.`); return true;
      case 'medpay': c.medpayUsed = c.client.medpay; C.log(state, c, `Med-pay claim submitted. ${PI.money(c.client.medpay)} paid directly to providers.`, 'good'); return true;
      case 'health': { c.known.health = true; const h = { none: 'Client has no health insurance. Providers are treating on letters of protection and will hold liens for full billed charges.', private: 'Client has private health insurance. Expect a subrogation lien for amounts paid, negotiable.', erisa: 'Client is on a self-funded ERISA plan. The plan will demand full reimbursement and federal law backs them.', medicare: 'Client is a Medicare beneficiary. Conditional payment letter requested from CMS; final demand before disbursement.', medicaid: 'Client is on Medicaid. State lien capped at the medical portion of recovery.' }; C.log(state, c, h[c.client.health], c.client.health === 'erisa' ? 'warn' : 'info'); return true; }
      case 'refer_specialist': { c.treatment.referred = true; const add = ['ortho', 'mri', 'pain']; for (const id of add) if (!c.treatment.plan.find((p) => p.id === id)) c.treatment.plan.push({ id, name: D.PROVIDERS[id].name, billed: 0, done: false, recordsRequested: false, recordsReceived: false, recordsWeeks: 0, recordCost: 0 }); c.specialsTarget *= 1.45; c.treatment.weeksLeft += R.int(6, 12); c.treatment.weeksTotal += 8; if (R.chance(0.3)) c.treatment.surgeryIndicated = true; C.log(state, c, 'Client referred to an orthopedist and for MRI on a letter of protection.'); return true; }
      case 'surgery': {
        const yes = R.chance(0.45 + c.client.mood / 200);
        if (yes) { c.treatment.plan.push({ id: 'surgery', name: D.PROVIDERS.surgery.name, billed: 0, done: false, recordsRequested: false, recordsReceived: false, recordsWeeks: 0, recordCost: 0 }); c.treatment.weeksLeft += R.int(16, 30); c.treatment.weeksTotal += 20; c.treatment.surgeryIndicated = false; c.specialsTarget *= 1.9; C.log(state, c, 'Client elected to proceed with surgery. Scheduled in the coming weeks; recovery will take months.', 'good'); }
        else { c.treatment.surgeryDeclined = true; C.log(state, c, 'Client declined surgery for now. The recommendation itself still supports future medical damages.'); c.futureMeds += c.specialsTarget * 0.8; }
        return true;
      }
      case 'call': c.client.lastContactWeek = state.week; c.client.mood = Math.min(100, c.client.mood + 14); C.log(state, c, 'Status call with client. Questions answered, expectations managed.'); return true;
      case 'uim': C.openUIM(state, c); return true;
      case 'demand': if (payload.amount) C.sendDemand(state, c, Math.round(payload.amount), payload.timeLimited); return true;
      case 'escalate': C.escalate(state, c); return true;
      case 'demand_early': {
        c.earlyDemand = true;
        for (const p of c.treatment.plan) if (p.billed > 0) { p.recordsRequested = true; p.recordsReceived = true; C.addCost(state, c, R.int(25, 120), `Records to date from ${p.name}`); }
        c.records.started = true; c.records.complete = true;
        c.demand = { drafted: 0, draftNeed: 2 + Math.floor(c.severity / 2), sent: false };
        C.log(state, c, 'Decided to demand on the bills to date rather than wait for maximum medical improvement.', 'stage');
        setStage(state, c, 'demand');
        return true;
      }
      case 'reeval': {
        c.liability.reevaluated = true;
        const L = C.effectiveLiability(c);
        const style = D.INSURERS.find((i) => i.id === c.defendant.insurer).style;
        const before = c.liability.determination;
        if ((c.liability.evidence.video || c.liability.evidence.witnesses) && c.liability.cf > 0) c.liability.cf *= 0.5;
        let det;
        if (L > 0.78 - style * 0.15 && c.liability.cf < 0.1) det = 'accepted'; else if (L < 0.45) det = 'denied'; else det = 'disputed';
        c.liability.determination = det;
        c.liability.evidenceAtDet = Object.keys(c.liability.evidence).length;
        C.log(state, c, det === before ? `Carrier reviewed the new evidence and kept its position (${det}).` : `Carrier revised its liability position from ${before} to ${det}.`, det === before ? 'warn' : 'good');
        return true;
      }
      case 'file': return C.fileSuit(state, c);
      case 'reopen': c.negotiation.awaiting = true; c.negotiation.responseWeek = state.week + R.int(2, 4); if (payload.amount) { c.negotiation.lastCounter = payload.amount; c.negotiation.offers.push({ day: state.day, from: 'firm', amount: payload.amount }); } C.log(state, c, `Renewed demand sent to defense counsel${payload.amount ? ` at ${PI.money(payload.amount)}` : ''}.`); return true;
      case 'accept': {
        const amt = c.negotiation.currentOffer;
        if (amt <= 0) return false;
        C.acceptOffer(state, c, amt);
        if (c.litigation && c.litigation.filed) { C.log(state, c, 'Stipulation of dismissal to be filed on receipt of funds.'); }
        return true;
      }
      case 'counter': C.counter(state, c, Math.round(payload.amount)); if (c.litigation && c.litigation.afterMediation && c.stage === 'litigation' && c.litigation.stageIndex === 7) { c.litigation.afterMediation = false; advanceLit(state, c); } if (c.litigation && c.litigation.stepsOffer && c.litigation.stageIndex === 8) { c.litigation.stepsOffer = false; advanceLit(state, c); } return true;
      case 'reject': {
        c.pending = null; c.negotiation.awaiting = false;
        C.log(state, c, `Rejected the ${PI.money(c.negotiation.currentOffer)} offer.`);
        if (c.litigation && c.litigation.filed) { if (c.litigation.afterMediation && c.litigation.stageIndex === 7) { c.litigation.afterMediation = false; advanceLit(state, c); } if (c.litigation.stepsOffer && c.litigation.stageIndex === 8) { c.litigation.stepsOffer = false; advanceLit(state, c); } }
        return true;
      }
      case 'liens': if (payload.negotiate) C.negotiateLiens(state, c); else C.payLiensFull(state, c); return true;
      case 'toggle_delegate': c.delegated = !c.delegated; if (c.delegated && c.pending) C.autoPilot(state, c); return true;
      case 'withdraw': C.kill(state, c, 'dropped', 'Firm withdrew from representation.'); PI.Firm.adjustRep(state, -0.5); return true;
    }
    return false;
  };

  // ---------- Auto-pilot (delegated files) ----------
  C.autoPilot = function (state, c) {
    const att = attorney(state, c);
    const neg = att ? att.skills.negotiation : 5;
    const lit = att ? att.skills.litigation : 5;
    const T = D.CASE_TYPES[c.type];
    const phil = (state.strategy && state.strategy.philosophy) || 'balanced';
    const acceptMult = phil === 'volume' ? 0.72 : phil === 'value' ? 0.97 : 0.85;
    // Volume shops demand on the bills to date as soon as liability is settled.
    if (phil === 'volume' && ['investigation', 'treatment'].includes(c.stage) && c.liability.determination && c.liability.determination !== 'denied' && !c.treatment.mmi && C.specials(c) > 2000 && c.weeksInStage >= 3) { C.act(state, c, 'demand_early'); return; }
    if (phil === 'value' && ['investigation', 'treatment'].includes(c.stage)) { const acts0 = C.actions(state, c); if (acts0.find((x) => x.id === 'refer_specialist') && c.liability.determination !== 'denied') C.act(state, c, 'refer_specialist'); if (acts0.find((x) => x.id === 'investigator')) C.act(state, c, 'investigator'); if (acts0.find((x) => x.id === 'scene')) C.act(state, c, 'scene'); }
    if (C.actions(state, c).find((x) => x.id === 'reeval')) C.act(state, c, 'reeval');
    // Routine investigation tasks happen automatically.
    if (['investigation', 'treatment'].includes(c.stage)) {
      const acts = C.actions(state, c).filter((x) => ['notice', 'police', 'photos', 'spoliation', 'limits', 'um', 'health', 'medpay', 'uim'].includes(x.id) || (x.id === 'investigator' && c.severity >= 2) || (x.id === 'scene' && T.cat === 'premises'));
      for (const x of acts) if (!x.disabled && state.cash > x.cost + 2000) C.act(state, c, x.id);
      if (c.treatment.surgeryIndicated && !c.treatment.surgeryDeclined && !c.treatment.surgeryDone && c.severity >= 3) C.act(state, c, 'surgery');
    }
    if (state.week - c.client.lastContactWeek > 4 && c.stage !== 'disbursement') C.act(state, c, 'call');
    if (c.noticeDay && !c.noticeServed) C.act(state, c, 'notice');
    const acts2 = C.actions(state, c);
    if (acts2.find((x) => x.id === 'uim')) C.act(state, c, 'uim');
    if (c.stage === 'demand' && c.demand && c.demand.ready && !c.demand.sent) {
      const exp = C.expectedValue(state, c);
      const cap = C.collectible(state, c);
      const aggressive = 1.6 + neg * 0.08;
      let amount = Math.min(exp * aggressive, cap === Infinity ? exp * 3 : cap);
      const tl = c.known.limits && exp >= cap * 0.85 && C.effectiveLiability(c) >= 0.7 && cap !== Infinity;
      if (tl) amount = cap;
      C.sendDemand(state, c, Math.round(amount / 1000) * 1000, tl);
    }
    if (c.pending && c.pending.type === 'offer') {
      const n = c.negotiation;
      const exp = C.expectedValue(state, c);
      const cap = C.collectible(state, c);
      const load = state.loads && state.loads[c.attorneyId] ? state.loads[c.attorneyId] : { speed: 1 };
      const busy = load.speed < 0.75;
      const target = Math.min(cap, exp * (0.62 + neg * 0.03) * (busy ? 0.85 : 1) * acceptMult);
      const offer = n.currentOffer;
      const solWeeks = (c.solDay - state.day) / 7;
      const inLit = c.stage === 'litigation';
      if (offer >= target || (n.finalOffer && offer >= target * 0.85) || (inLit && c.litigation.stageIndex >= 8 && offer >= target * 0.8)) C.act(state, c, 'accept');
      else if (inLit) {
        const steps = c.litigation.stageIndex >= 8;
        if (offer > 0 && c.litigation.stageIndex >= 7 && offer >= target * 0.7 && lit < 7) C.act(state, c, 'accept');
        else if (steps && offer >= target * (phil === 'value' ? 0.75 : 0.6) && (lit < 8 || R.chance(phil === 'value' ? 0.35 : 0.7))) C.act(state, c, 'accept');
        else C.act(state, c, 'reject');
      }
      else if (n.finalOffer || n.round >= n.patience + 1 || solWeeks < 10) {
        const needExpert = T.expertRequired && !(c.litigation && c.litigation.experts.some((e) => D.EXPERTS[e].required));
        if (needExpert && state.cash > 40000) { const req = Object.keys(D.EXPERTS).find((k) => D.EXPERTS[k].required && D.EXPERTS[k].types.includes(c.type)); C.retainExpert(state, c, req); }
        const sueFloor = phil === 'volume' ? 0.45 : phil === 'value' ? 0.9 : 0.75;
        const worthSuing = exp > (busy ? 60000 : phil === 'volume' ? 50000 : 20000) && offer < target * sueFloor && state.cash > 5000 && !(T.expertRequired && !(c.litigation && c.litigation.experts.some((e) => D.EXPERTS[e].required)));
        if (worthSuing) { if (!C.fileSuit(state, c)) C.act(state, c, 'accept'); }
        else if (offer > 0) C.act(state, c, 'accept'); else if (solWeeks < 10) C.kill(state, c, 'dropped', 'Associate withdrew: no offer, no viable suit before the statute ran.');
        else C.act(state, c, 'counter', { amount: Math.round(Math.max(target * 1.3, offer * 1.4) / 500) * 500 });
      } else if (!n.escalated && n.round >= 2 && R.chance(0.5)) C.act(state, c, 'escalate');
      else C.act(state, c, 'counter', { amount: Math.round(Math.max(target * 1.25, offer * 1.3) / 500) * 500 });
    }
    if (c.pending && c.pending.type === 'liens') C.act(state, c, 'liens', { negotiate: true });
    if (c.stage === 'negotiation' && !c.pending && !c.negotiation.awaiting && c.negotiation.round > 0) {
      // Deadlock: file if there's time and value, otherwise take what is on the table.
      if (C.expectedValue(state, c) > 25000 && c.negotiation.currentOffer < C.expectedValue(state, c) * 0.5) C.fileSuit(state, c); else if (c.negotiation.currentOffer > 0) C.act(state, c, 'accept');
    }
    // Statute protection: file before the deadline, or get out in time if filing is impossible.
    if (!(c.litigation && c.litigation.filed) && c.solDay - state.day < 60 && ['investigation', 'treatment', 'records', 'demand', 'negotiation'].includes(c.stage)) {
      if (T.expertRequired && !(c.litigation && c.litigation.experts.some((e) => D.EXPERTS[e].required))) {
        const req = Object.keys(D.EXPERTS).find((k) => D.EXPERTS[k].required && D.EXPERTS[k].types.includes(c.type));
        if (state.cash > D.EXPERTS[req].cost + 20000 && C.expectedValue(state, c) > 150000) C.retainExpert(state, c, req);
      }
      if (!C.fileSuit(state, c)) {
        if (c.negotiation && c.negotiation.currentOffer > 0) C.act(state, c, 'accept');
        else if (c.solDay - state.day < 45) { C.kill(state, c, 'dropped', 'Withdrew before the statute ran: the firm could not fund suit on this file. Client advised in writing to find new counsel immediately.'); PI.Firm.adjustRep(state, -0.5); }
      }
    }
    // Experts in litigation.
    if (c.stage === 'litigation' && c.litigation.stageIndex <= 5 && state.cash > 60000) {
      const exp = C.expectedValue(state, c);
      for (const x of C.actions(state, c).filter((y) => y.group === 'experts')) { if (x.cost < exp * 0.06 && state.cash > x.cost + 40000) C.act(state, c, x.id); }
    }
  };

  // Weekly attorney work demand for capacity planning.
  C.workNeed = function (c) {
    switch (c.stage) {
      case 'investigation': return 1.0;
      case 'treatment': return 0.3;
      case 'records': return 0.4;
      case 'demand': return 1.5;
      case 'negotiation': return 1.0;
      case 'litigation': { const st = D.LIT_STAGES[c.litigation.stageIndex]; return st ? st.work * 0.5 : 1.5; }
      case 'disbursement': return 0.5;
      default: return 0;
    }
  };
})();
