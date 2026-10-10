/* Contingency: utilities, RNG, formatting. Everything hangs off a single global namespace (PI). */
(function () {
  const PI = (globalThis.PI = globalThis.PI || {});

  // Seeded RNG (mulberry32). The seed state lives in game state so saves are reproducible.
  let _s = 123456789;
  const rng = {
    seed(v) { _s = v >>> 0; },
    state() { return _s; },
    next() {
      _s = (_s + 0x6D2B79F5) >>> 0;
      let t = _s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    chance(p) { return rng.next() < p; },
    int(lo, hi) { return lo + Math.floor(rng.next() * (hi - lo + 1)); },
    range(lo, hi) { return lo + rng.next() * (hi - lo); },
    pick(arr) { return arr[Math.floor(rng.next() * arr.length)]; },
    weighted(items) {
      // items: [{w, v}] or objects with .weight
      let total = 0;
      for (const it of items) total += (it.w != null ? it.w : it.weight) || 0;
      let r = rng.next() * total;
      for (const it of items) {
        r -= (it.w != null ? it.w : it.weight) || 0;
        if (r <= 0) return it.v !== undefined ? it.v : it;
      }
      const last = items[items.length - 1];
      return last.v !== undefined ? last.v : last;
    },
    gauss(mean, sd) {
      let u = 0, v = 0;
      while (u === 0) u = rng.next();
      while (v === 0) v = rng.next();
      return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    },
    lognormal(median, sigma) {
      return median * Math.exp(rng.gauss(0, sigma));
    },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  };
  PI.rng = rng;

  PI.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  PI.round = (v, step) => Math.round(v / step) * step;
  PI.sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);

  let _uid = 1;
  PI.uid = (prefix) => `${prefix || 'id'}_${(_uid++).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;

  PI.money = function (n, opts) {
    opts = opts || {};
    const neg = n < 0;
    const a = Math.abs(n);
    let s;
    if (opts.short) {
      if (a >= 1e9) s = (a / 1e9).toFixed(2) + 'B';
      else if (a >= 1e6) s = (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
      else if (a >= 1e3) s = (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
      else s = Math.round(a).toString();
    } else {
      s = Math.round(a).toLocaleString('en-US');
    }
    return (neg ? '-$' : '$') + s;
  };
  PI.pct = (v, d) => (v * 100).toFixed(d == null ? 0 : d) + '%';

  // Game calendar: day 0 = Monday, January 1, 2024. Weeks are 7 days.
  const EPOCH = Date.UTC(2024, 0, 1);
  PI.dateOf = (day) => new Date(EPOCH + day * 86400000);
  PI.fmtDate = function (day, long) {
    const d = PI.dateOf(day);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (long) {
      const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return `${full[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
    }
    return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  };
  PI.yearOf = (day) => PI.dateOf(day).getUTCFullYear();
  PI.monthOf = (day) => PI.dateOf(day).getUTCMonth();
  PI.weeksToText = function (weeks) {
    if (weeks < 0) weeks = 0;
    if (weeks < 8) return `${weeks} wk${weeks === 1 ? '' : 's'}`;
    const m = Math.round(weeks / 4.33);
    if (m < 18) return `${m} mo`;
    return `${(weeks / 52).toFixed(1)} yr`;
  };
  PI.daysToText = function (days) {
    if (days <= 0) return 'expired';
    if (days < 14) return `${days} days`;
    return PI.weeksToText(Math.round(days / 7));
  };

  PI.escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
})();
