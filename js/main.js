/* Contingency: controller. Wires clicks to the engine, runs the clock, saves and loads. */
(function () {
  const PI = (globalThis.PI = globalThis.PI || {});
  const D = PI.DATA, F = PI.Firm, C = PI.Cases, U = PI.UI;
  const Main = (PI.Main = { playing: false, speed: 1, timer: null });
  const SAVE_KEY = 'contingency-save-v1';
  const $ = (sel) => document.querySelector(sel);

  function shell() {
    $('#app').innerHTML = `<header class="topbar" id="topbar"></header><div class="body"><nav class="rail" id="rail" aria-label="Departments"></nav><main class="content" id="content"></main></div>`;
    if (globalThis.ResizeObserver) { new ResizeObserver(() => { const tb = $('#topbar'); if (tb) document.documentElement.style.setProperty('--topbar-h', Math.ceil(tb.getBoundingClientRect().height) + 'px'); }).observe($('#topbar')); }
  }

  // ---------- Save / load ----------
  Main.save = function (silent) {
    if (!U.state) return;
    try { localStorage.setItem(SAVE_KEY, F.serialize(U.state)); if (!silent) U.toast('Saved.'); } catch (e) { if (!silent) U.toast('Could not save in this browser.'); }
  };
  Main.hasSave = function () { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } };
  Main.load = function () {
    try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return false; U.state = F.deserialize(raw); return true; } catch (e) { console.error(e); return false; }
  };

  // ---------- Clock ----------
  Main.needsPlayer = function (s) {
    if (!s.policy.pauseOnDecision) return false;
    return s.events.length > 0 || U.pendingCases(s).length > 0;
  };
  Main.advance = function () {
    const s = U.state;
    if (!s || s.gameOver) return;
    F.tick(s);
    Main.save(true);
    if (s.gameOver) { Main.stop(); U.modal = { type: 'gameover' }; }
    else if (Main.playing && Main.needsPlayer(s)) { Main.stop(); U.toast('Paused: a decision needs you.'); }
    // Surface the first event automatically when the player is idle.
    if (!U.modal && s.events.length && !U.openCaseId) U.modal = { type: 'event', uid: s.events[0].uid };
    U.renderAll();
  };
  Main.start = function () {
    if (Main.playing) return;
    const s = U.state;
    if (s && Main.needsPlayer(s)) { U.toast('Resolve the pending decisions first, or turn off pausing in Firm policies.'); U.renderTopbar(); return; }
    Main.playing = true;
    const ms = { 1: 2200, 2: 1100, 4: 450 }[Main.speed] || 2200;
    Main.timer = setInterval(Main.advance, ms);
    U.renderTopbar();
  };
  Main.stop = function () { Main.playing = false; clearInterval(Main.timer); Main.timer = null; U.renderTopbar(); };
  Main.setSpeed = function (x) { Main.speed = x; if (Main.playing) { Main.stop(); Main.start(); } else U.renderTopbar(); };

  // ---------- Actions ----------
  const num = (id, fallback) => { const el = document.getElementById(id); const v = el ? parseFloat(el.value) : NaN; return isNaN(v) ? fallback : v; };
  function openCase(id) { U.openCaseId = id; const c = U.state.cases.find((x) => x.id === id); if (c && c.pending && !c.delegated) U.modal = { type: c.pending.type, caseId: id }; U.renderAll(); }
  function afterAction() { Main.save(true); U.renderAll(); }
  function result(r, okMsg) { if (r && r.ok === false) U.toast(r.msg || 'Not possible right now.'); else if (okMsg) U.toast(okMsg); }

  const handlers = {
    tab(arg) { U.tab = arg; U.openCaseId = null; U.renderAll(); },
    advance() { if (Main.playing) Main.stop(); Main.advance(); },
    'toggle-play'() { Main.playing ? Main.stop() : Main.start(); },
    speed(arg) { Main.setSpeed(parseInt(arg, 10)); },
    menu() { U.modal = { type: 'menu' }; U.renderModal(); },
    'close-modal'() { U.modal = null; U.renderModal(); },
    'close-drawer'() { U.openCaseId = null; U.renderDrawer(); },
    'close-drawer-bg'(arg, el, ev) { if (ev.target === el) { U.openCaseId = null; U.renderDrawer(); } },
    'open-case'(arg) { openCase(arg); },
    'cases-filter'(arg) { U.caseFilter = arg; U.tab = 'cases'; U.renderAll(); },
    'log-filter'(arg) { U.logFilter = arg; U.renderTab(); },
    'show-event'(arg) { U.modal = { type: 'event', uid: arg }; U.renderModal(); },
    'event-opt'(arg, el) { F.resolveEvent(U.state, arg, parseInt(el.dataset.arg2, 10)); U.modal = null; afterAction(); },
    policy(arg, el) { const s = U.state; s.policy[arg] = el.checked; if (arg === 'autoIntake' && el.checked) F.autoIntake(s); afterAction(); },
    strategy(arg, el) { U.state.strategy[arg] = el.dataset.arg2; afterAction(); },
    help() { U.modal = { type: 'help' }; U.renderModal(); },
    // Intake
    'sign-lead'(arg) { const s = U.state; const sel = document.querySelector(`select[data-role="assign-${arg}"]`); const c = F.signLead(s, arg, sel ? sel.value : null); if (c) { U.toast(`${c.clientName} signed. Assigned to ${F.staffById(s, c.attorneyId).name}.`); } afterAction(); },
    'decline-lead'(arg) { F.declineLead(U.state, arg); afterAction(); },
    'refer-lead'(arg) { F.referLead(U.state, arg); afterAction(); },
    'investigate-lead'(arg) { F.investigateLead(U.state, arg); afterAction(); },
    // Case actions
    'case-act'(arg) {
      const s = U.state; const c = s.cases.find((x) => x.id === U.openCaseId); if (!c) return;
      if (arg === 'demand' || arg === 'respond' || arg === 'liens') { U.modal = { type: arg === 'respond' ? 'offer' : arg, caseId: c.id }; U.renderModal(); return; }
      if (arg === 'withdraw') { U.modal = { type: 'confirm', title: 'Withdraw from representation?', text: `Drop ${c.clientName}'s case. ${PI.money(c.costs)} in advanced costs is written off.`, yes: 'Withdraw', onYes: () => { C.act(s, c, 'withdraw'); U.openCaseId = null; } }; U.renderModal(); return; }
      if (arg === 'file') { U.modal = { type: 'confirm', title: 'File suit?', text: `File a complaint for ${c.clientName}. The fee converts to 40%, you pay the filing fee, and litigation typically runs one to two years before trial.`, yes: 'File the complaint', onYes: () => { if (!C.fileSuit(s, c)) U.toast('Cannot file yet.'); } }; U.renderModal(); return; }
      if (arg === 'reopen') { const est = C.estimate(s, c); C.act(s, c, 'reopen', { amount: Math.round(est.mid * 1.4 / 1000) * 1000 }); afterAction(); return; }
      const ok = C.act(s, c, arg);
      if (!ok) U.toast('That is not available right now.');
      afterAction();
    },
    'assign-case'(arg, el) { F.assignCase(U.state, arg, el.value); afterAction(); },
    preset(arg) { const i = document.getElementById('demand-amt'); if (i) i.value = arg; },
    'send-demand'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); const amt = num('demand-amt', 0); if (!c || amt < 1000) { U.toast('Enter a demand amount.'); return; } const tl = document.getElementById('demand-tl'); C.act(s, c, 'demand', { amount: amt, timeLimited: !!(tl && tl.checked) }); U.modal = null; afterAction(); },
    'offer-accept'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); C.act(s, c, 'accept'); U.modal = c.pending && c.pending.type === 'liens' ? { type: 'liens', caseId: c.id } : null; afterAction(); },
    'offer-counter'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); const amt = num('counter-amt', 0); if (amt <= (c.negotiation.currentOffer || 0)) { U.toast('A counter has to be above the offer.'); return; } C.act(s, c, 'counter', { amount: amt }); U.modal = null; afterAction(); },
    'offer-escalate'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); C.act(s, c, 'escalate'); U.modal = null; afterAction(); },
    'offer-file'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); if (C.fileSuit(s, c)) { U.modal = null; U.toast('Complaint filed.'); } else U.toast('Cannot file yet.'); afterAction(); },
    'offer-reject'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); C.act(s, c, 'reject'); U.modal = null; afterAction(); },
    'liens-negotiate'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); C.act(s, c, 'liens', { negotiate: true }); U.modal = null; afterAction(); },
    'liens-pay'(arg) { const s = U.state; const c = s.cases.find((x) => x.id === arg); C.act(s, c, 'liens', { negotiate: false }); U.modal = null; afterAction(); },
    'confirm-yes'() { const m = U.modal; U.modal = null; if (m && m.onYes) m.onYes(); afterAction(); },
    // Staff
    hire(arg) { result(F.hire(U.state, arg)); afterAction(); },
    fire(arg) { const st = F.staffById(U.state, arg); U.modal = { type: 'confirm', title: `Let ${st.name} go?`, text: `One month of severance (${PI.money(Math.round(st.salary / 12))}). Their cases are reassigned and the rest of the team notices.`, yes: 'Let go', onYes: () => F.fire(U.state, arg) }; U.renderModal(); },
    raise(arg) { F.raise(U.state, arg, 0.1); afterAction(); },
    bonus(arg) { F.bonus(U.state, arg, 2500); afterAction(); },
    train(arg) { U.modal = { type: 'train', staffId: arg }; U.renderModal(); },
    'train-skill'(arg, el) { result(F.train(U.state, arg, el.dataset.arg2)); U.modal = null; afterAction(); },
    promote(arg) { F.promote(U.state, arg); afterAction(); },
    successor(arg) { result(F.nameSuccessor(U.state, arg)); afterAction(); },
    retire() { U.modal = { type: 'confirm', title: 'Retire now?', text: 'You hand the firm to your successor and the next generation begins. You keep playing as the new managing partner.', yes: 'Retire', onYes: () => F.retireNow(U.state) }; U.renderModal(); },
    'delegate-all'() { for (const c of F.openCases(U.state)) { c.delegated = true; if (c.pending) C.autoPilot(U.state, c); } afterAction(); },
    'handson-all'() { for (const c of F.openCases(U.state)) c.delegated = false; afterAction(); },
    // Marketing / office / finance
    channel(arg, el) { result(F.setChannel(U.state, arg, parseInt(el.dataset.arg2, 10))); afterAction(); },
    office(arg) { result(F.upgradeOffice(U.state, parseInt(arg, 10))); afterAction(); },
    'open-office'(arg) { result(F.openOffice(U.state, arg)); afterAction(); },
    borrow() { F.borrow(U.state, num('loan-amt', 0)); afterAction(); },
    repay() { F.repay(U.state, num('loan-amt', 0)); afterAction(); },
    'set-draw'() { U.state.founderDraw = Math.max(0, num('draw-amt', 0)); afterAction(); },
    // Menu
    save() { Main.save(); },
    export() { const text = F.serialize(U.state); const done = () => U.toast('Save copied to clipboard.'); const fallback = () => { const ta = document.getElementById('import-text'); if (ta) { ta.value = text; ta.select(); } U.toast('Clipboard blocked; the save is in the text box below. Copy it from there.'); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback(); },
    'show-import'() { const ta = document.getElementById('import-text'); if (ta) ta.focus(); },
    import() { const ta = document.getElementById('import-text'); try { U.state = F.deserialize(ta.value.trim()); U.modal = null; U.openCaseId = null; Main.save(true); U.renderAll(); U.toast('Save imported.'); } catch (e) { U.toast('That is not a valid save.'); } },
    'new-game-confirm'() { U.modal = { type: 'confirm', title: 'Start a new firm?', text: 'The current game is abandoned. The autosave is replaced when the new firm plays its first week.', yes: 'New firm', onYes: () => Main.newGameScreen() }; U.renderModal(); },
    'new-game'() { Main.stop(); U.modal = null; Main.newGameScreen(); },
    continue() { if (Main.load()) Main.enterGame(); },
    'ng-bg'(arg) { U.ng.backgroundId = arg; captureNg(); U.renderNewGame(Main.hasSave()); },
    'ng-city'(arg) { U.ng.cityId = arg; captureNg(); U.renderNewGame(Main.hasSave()); },
    'ng-start'() {
      captureNg();
      const founder = U.ng.founderName.trim() || 'Jordan Reyes';
      const firm = U.ng.firmName.trim() || `${founder.split(' ').slice(-1)[0]} Injury Law`;
      U.state = F.newGame({ founderName: founder, firmName: firm, backgroundId: U.ng.backgroundId, cityId: U.ng.cityId, seed: Math.floor(Math.random() * 2 ** 31) });
      U.tab = 'dashboard'; U.caseFilter = 'attention'; U.openCaseId = null; U.modal = null;
      Main.save(true);
      Main.enterGame();
      U.modal = { type: 'help' }; U.renderModal(); U.toast('Welcome to the practice of law. Three files came with you.');
    }
  };
  function captureNg() { const f = document.getElementById('ng-founder'), fi = document.getElementById('ng-firm'); if (f) U.ng.founderName = f.value; if (fi) U.ng.firmName = fi.value; }

  Main.newGameScreen = function () { Main.stop(); U.state = null; U.modal = null; U.openCaseId = null; $('#drawer-root').hidden = true; $('#drawer-root').innerHTML = ''; $('#modal-root').hidden = true; $('#modal-root').innerHTML = ''; U.renderNewGame(Main.hasSave()); };
  Main.enterGame = function () { shell(); Main.playing = false; U.renderAll(); if (U.state.gameOver) { U.modal = { type: 'gameover' }; U.renderModal(); } };

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return; // handled on change
    const act = el.dataset.act;
    const fn = handlers[act];
    if (!fn) return;
    if (el.tagName === 'BUTTON' && el.disabled) return;
    try { fn(el.dataset.arg, el, ev); } catch (e) { console.error(e); U.toast('Something went wrong: ' + e.message); }
  });
  document.addEventListener('change', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || !(el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
    const fn = handlers[el.dataset.act];
    if (fn) { try { fn(el.dataset.arg, el, ev); } catch (e) { console.error(e); U.toast('Something went wrong: ' + e.message); } }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, textarea, select')) return;
    if (ev.key === 'Escape') { if (U.modal && U.modal.type !== 'gameover') { U.modal = null; U.renderModal(); } else if (U.openCaseId) { U.openCaseId = null; U.renderDrawer(); } }
    if (ev.key === 'n' && U.state && !U.modal) handlers.advance();
    if (ev.key === ' ' && U.state && !U.modal) { ev.preventDefault(); handlers['toggle-play'](); }
  });

  Main.boot = function () {
    const start = () => {
      if (Main.load()) { shell(); U.renderAll(); if (U.state.gameOver) { U.modal = { type: 'gameover' }; U.renderModal(); } }
      else U.renderNewGame(false);
    };
    if (globalThis.claude && globalThis.claude.hot && globalThis.claude.hot.ready) globalThis.claude.hot.ready(start); else start();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', Main.boot); else Main.boot();
})();
