/* Interactive backtest explorer and stress calculator for projects/market-risk.html.
   Data: data/market-risk.json, exported by scripts/export_site_data.py in github.com/xm0207/market-risk-toolkit. */
(function () {
  'use strict';

  // chart colours come from the page's CSS variables, so the charts follow the site theme
  var COLORS = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
    COLORS = { pnl: v('--chart-pnl', '#b9c4d2'), varLine: v('--chart-var', '#12406b'), exc: v('--chart-exc', '#c0392b'),
      zero: v('--chart-zero', '#9aa9bb'), grid: v('--line', '#e6e9ef'), axis: v('--muted', '#6b7686'),
      green: v('--zone-green', '#2fbf8f'), yellow: v('--zone-yellow', '#f2b84b'), red: v('--zone-red', '#e05a4f') };
  }
  var MODEL_LABELS = { 'Historical simulation': 'Historical', 'Normal': 'Normal', 'EWMA normal': 'EWMA',
    'Filtered HS (GARCH)': 'Filtered HS' };
  var DAY = 864e5;

  function $(id) { return document.getElementById(id); }
  function money(v) {
    var s = '£' + Math.round(Math.abs(v)).toLocaleString('en-GB');
    return (v < 0 ? '−' : v > 0 ? '+' : '') + s;
  }
  function pct(v, digits) { return (v * 100).toFixed(digits === undefined ? 1 : digits) + '%'; }

  /* ---------- statistics ---------- */
  function erfc(x) {
    var z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    var r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
      t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }
  function chi2sf1(x) { return x <= 0 ? 1 : erfc(Math.sqrt(x / 2)); }
  function xlogy(x, y) { return x === 0 ? 0 : x * Math.log(y); }
  function kupiec(n, x, p) {
    var ph = x / n;
    var lr = -2 * ((xlogy(n - x, 1 - p) + xlogy(x, p)) - (xlogy(n - x, 1 - ph) + xlogy(x, ph)));
    return chi2sf1(lr);
  }
  function independence(hits) {
    var n00 = 0, n01 = 0, n10 = 0, n11 = 0;
    for (var i = 1; i < hits.length; i++) {
      if (hits[i - 1]) { if (hits[i]) n11++; else n10++; } else { if (hits[i]) n01++; else n00++; }
    }
    var pi0 = n00 + n01 ? n01 / (n00 + n01) : 0, pi1 = n10 + n11 ? n11 / (n10 + n11) : 0;
    var pi = (n01 + n11) / (n00 + n01 + n10 + n11);
    var lr = -2 * ((xlogy(n00 + n10, 1 - pi) + xlogy(n01 + n11, pi)) -
      (xlogy(n00, 1 - pi0) + xlogy(n01, pi0) + xlogy(n10, 1 - pi1) + xlogy(n11, pi1)));
    return chi2sf1(lr);
  }
  function zone(count) { return count <= 4 ? 'green' : count <= 9 ? 'yellow' : 'red'; }
  function fmtP(p) { return p < 0.001 ? '< 0.001' : p.toFixed(3); }

  /* ---------- canvas helpers ---------- */
  function setup(canvas) {
    var dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function niceStep(range, target) {
    var raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  }

  /* ---------- backtest explorer ---------- */
  function initExplorer(data) {
    var bt = data.backtest, n = bt.pnl.length;
    var dates = new Array(n);
    dates[0] = Date.parse(bt.start);
    for (var i = 1; i < n; i++) dates[i] = dates[i - 1] + bt.gaps[i - 1] * DAY;
    var models = bt.models;
    models.forEach(function (m) {
      ['99', '975'].forEach(function (a) {
        var hits = new Uint8Array(n);
        m['exc' + a].forEach(function (j) { hits[j] = 1; });
        m['hits' + a] = hits;
      });
      var cum = new Int32Array(n + 1);
      for (var j = 0; j < n; j++) cum[j + 1] = cum[j] + m.hits99[j];
      m.cum99 = cum;
    });

    var state = { model: models.length - 1, alpha: '99', period: 'all' };
    var segModel = document.querySelector('[data-control="model"]');
    models.forEach(function (m, k) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.value = String(k); b.textContent = MODEL_LABELS[m.name] || m.name;
      b.setAttribute('aria-pressed', String(k === state.model));
      segModel.appendChild(b);
    });

    function bounds() {
      function idx(iso) { var t = Date.parse(iso), k = 0; while (k < n - 1 && dates[k] < t) k++; return k; }
      if (state.period === 'gfc') return [idx('2007-06-01'), idx('2009-12-31')];
      if (state.period === 'y2020') return [idx('2020-01-01'), idx('2020-12-31')];
      if (state.period === 'y2022') return [idx('2022-01-01'), idx('2022-12-31')];
      if (state.period === 'last2') return [Math.max(0, n - 504), n - 1];
      return [0, n - 1];
    }

    function drawChart(i0, i1, m, varArr, hits) {
      var c = setup($('bt-canvas')), ctx = c.ctx, w = c.w, h = c.h;
      var pad = { l: 58, r: 10, t: 10, b: 24 };
      var lo = 0, hi = 0;
      for (var i = i0; i <= i1; i++) {
        lo = Math.min(lo, bt.pnl[i], -varArr[i]); hi = Math.max(hi, bt.pnl[i]);
      }
      var span = hi - lo; lo -= span * 0.06; hi += span * 0.06;
      var t0 = dates[i0], t1 = dates[i1];
      function X(k) { return pad.l + (dates[k] - t0) / (t1 - t0) * (w - pad.l - pad.r); }
      function Y(v) { return pad.t + (hi - v) / (hi - lo) * (h - pad.t - pad.b); }

      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
      ctx.fillStyle = COLORS.axis; ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 1;
      var step = niceStep(hi - lo, 5);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
        var y = Math.round(Y(v)) + 0.5;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
        ctx.fillText((v < 0 ? '−' : '') + '£' + Math.abs(Math.round(v)).toLocaleString('en-GB') + 'k', pad.l - 6, y);
      }
      // x ticks: years, or months for short windows
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      var years = (t1 - t0) / (365.25 * DAY);
      var d0 = new Date(t0), ticks = [];
      if (years > 3) {
        var ys = years > 20 ? 5 : years > 8 ? 2 : 1;
        for (var yr = Math.ceil((d0.getUTCFullYear() + 1) / ys) * ys; Date.UTC(yr, 0, 1) <= t1; yr += ys) {
          ticks.push([Date.UTC(yr, 0, 1), String(yr)]);
        }
      } else {
        var ms = years > 1.5 ? 6 : years > 0.8 ? 3 : 2;
        var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        for (var mt = d0.getUTCFullYear() * 12 + d0.getUTCMonth() + 1; ; mt++) {
          var tt = Date.UTC(Math.floor(mt / 12), mt % 12, 1);
          if (tt > t1) break;
          if ((mt % 12) % ms === 0) ticks.push([tt, names[mt % 12] + ' ' + Math.floor(mt / 12)]);
        }
      }
      ticks.forEach(function (tk) {
        var x = pad.l + (tk[0] - t0) / (t1 - t0) * (w - pad.l - pad.r);
        ctx.fillText(tk[1], x, h - pad.b + 7);
      });

      // daily P&L as thin bars from zero
      var y0 = Y(0);
      ctx.strokeStyle = COLORS.pnl; ctx.lineWidth = Math.max(0.6, Math.min(2, (w - pad.l) / (i1 - i0 + 1) * 0.7));
      ctx.beginPath();
      for (i = i0; i <= i1; i++) { var x = X(i); ctx.moveTo(x, y0); ctx.lineTo(x, Y(bt.pnl[i])); }
      ctx.stroke();
      ctx.strokeStyle = COLORS.zero; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, Math.round(y0) + 0.5); ctx.lineTo(w - pad.r, Math.round(y0) + 0.5); ctx.stroke();

      // minus VaR
      ctx.strokeStyle = COLORS.varLine; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (i = i0; i <= i1; i++) { if (i === i0) ctx.moveTo(X(i), Y(-varArr[i])); else ctx.lineTo(X(i), Y(-varArr[i])); }
      ctx.stroke();

      // exceptions
      ctx.fillStyle = COLORS.exc;
      var r = i1 - i0 > 3000 ? 2.2 : 3.2;
      for (i = i0; i <= i1; i++) {
        if (hits[i]) { ctx.beginPath(); ctx.arc(X(i), Y(bt.pnl[i]), r, 0, 2 * Math.PI); ctx.fill(); }
      }
    }

    function drawStrip(i0, i1, m) {
      var c = setup($('bt-strip')), ctx = c.ctx, w = c.w, h = c.h, padL = 58, padR = 10;
      if (state.alpha !== '99') {
        ctx.fillStyle = COLORS.grid; ctx.fillRect(padL, 0, w - padL - padR, h);
        return;
      }
      var t0 = dates[i0], t1 = dates[i1];
      for (var i = i0; i <= i1; i++) {
        if (i < 249) continue;
        var count = m.cum99[i + 1] - m.cum99[i - 249];
        var xa = padL + (dates[i] - t0) / (t1 - t0) * (w - padL - padR);
        var xb = i < i1 ? padL + (dates[i + 1] - t0) / (t1 - t0) * (w - padL - padR) : w - padR;
        ctx.fillStyle = COLORS[zone(count)];
        ctx.fillRect(xa, 0, Math.max(1, xb - xa + 0.5), h);
      }
    }

    function stats(i0, i1, m) {
      var hits = m['hits' + state.alpha], p = state.alpha === '99' ? 0.01 : 0.025;
      var nDays = i1 - i0 + 1, x = 0, window = [];
      for (var i = i0; i <= i1; i++) { x += hits[i]; window.push(hits[i]); }
      var cards = [
        ['Trading days', nDays.toLocaleString('en-GB')],
        ['Exceptions', x + ' <small>(expected ' + (nDays * p).toFixed(1) + ')</small>'],
        ['Exception rate', pct(x / nDays, 2) + ' <small>(target ' + pct(p, 1) + ')</small>'],
        ['Kupiec p', fmtP(kupiec(nDays, x, p))],
        ['Independence p', fmtP(independence(window))]
      ];
      if (state.alpha === '99' && i1 >= 249) {
        var count = m.cum99[i1 + 1] - m.cum99[i1 - 249], z = zone(count);
        cards.push(['Basel zone, period end', '<span class="zone zone-' + z + '">' + z.charAt(0).toUpperCase() + z.slice(1) +
          '</span> <small>(' + count + ' in 250 days)</small>']);
      } else {
        cards.push(['Basel zone, period end', '\u2013<small>Defined for 99% VaR</small>']);
      }
      $('bt-stats').innerHTML = cards.map(function (cd) {
        return '<div class="stat"><span>' + cd[0] + '</span><b>' + cd[1] + '</b></div>';
      }).join('');
    }

    function render() {
      var b = bounds(), m = models[state.model];
      drawChart(b[0], b[1], m, m['var' + state.alpha], m['hits' + state.alpha]);
      drawStrip(b[0], b[1], m);
      stats(b[0], b[1], m);
      document.querySelector('.strip-key').style.opacity = state.alpha === '99' ? 1 : 0.4;
    }

    document.querySelectorAll('[data-tool="explorer"] .seg').forEach(function (seg) {
      seg.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button');
        if (!btn) return;
        seg.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === btn)); });
        var key = seg.dataset.control;
        state[key] = key === 'model' ? Number(btn.dataset.value) : btn.dataset.value;
        render();
      });
    });
    var timer;
    window.addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(render, 120); });
    render();
  }

  /* ---------- stress calculator ---------- */
  var FACTORS = [
    { key: 'NASDAQCOM', label: 'US equities (NASDAQ)', kind: 'rel', min: -50, max: 50, step: 1, unit: '%' },
    { key: 'DGS10', label: 'US 10-year Treasury yield', kind: 'abs', min: -300, max: 300, step: 5, unit: 'bp' },
    { key: 'DBAA', label: 'Baa corporate bond yield', kind: 'abs', min: -300, max: 300, step: 5, unit: 'bp' },
    { key: 'DCOILBRENTEU', label: 'Brent crude', kind: 'rel', min: -70, max: 70, step: 1, unit: '%' },
    { key: 'DEXUSUK', label: 'Pound against the dollar', kind: 'rel', min: -25, max: 25, step: 0.5, unit: '%' }
  ];

  function bondPrice(y, c, t, f) {
    f = f || 2;
    var disc = Math.pow(1 + y / f, -f * t);
    var annuity = Math.abs(y) < 1e-12 ? t : (1 - disc) / y;
    return c * annuity + disc;
  }

  // Same revaluation as Portfolio.stressed_pnl in the Python package.
  function stressPnl(data, shocks) {
    var fx = shocks.DEXUSUK || 0;
    return data.portfolio.map(function (p) {
      var r;
      if (p.kind === 'bond') {
        var y0 = data.yields[p.series] / 100, y1 = y0 + (shocks[p.series] || 0) / 100;
        r = bondPrice(y1, y0, p.maturity) - 1;
      } else {
        r = shocks[p.series] || 0;
      }
      return { name: p.name, pnl: p.value * ((1 + r) / (1 + fx) - 1) };
    });
  }

  function initStress(data) {
    var shocks = {}, active = null;
    var sliders = $('st-sliders'), presets = $('st-presets');

    FACTORS.forEach(function (f) {
      var id = 'st-' + f.key;
      var wrap = document.createElement('div');
      wrap.className = 'slider';
      wrap.innerHTML = '<label for="' + id + '"><span>' + f.label + '</span><output id="' + id + '-out"></output></label>' +
        '<input type="range" id="' + id + '" min="' + f.min + '" max="' + f.max + '" step="' + f.step + '" value="0">' +
        '<div class="ends"><span>' + f.min + f.unit + '</span><span>+' + f.max + f.unit + '</span></div>';
      sliders.appendChild(wrap);
      wrap.querySelector('input').addEventListener('input', function (ev) {
        var v = Number(ev.target.value);
        shocks[f.key] = v / 100;
        setActive(null);
        update();
      });
    });

    function label(f, value) {
      // value in natural units: fraction for rel, percentage points for abs
      var shown = value * 100;
      var digits = f.unit === 'bp' ? 0 : Math.abs(shown) < 10 && shown % 1 !== 0 ? 1 : 0;
      return (shown > 0 ? '+' : shown < 0 ? '−' : '') + Math.abs(shown).toFixed(digits) + (f.unit === 'bp' ? ' bp' : '%');
    }

    function setActive(k) {
      active = k;
      presets.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.value === String(k)));
      });
    }

    function syncSliders() {
      FACTORS.forEach(function (f) {
        var v = shocks[f.key] || 0, input = $('st-' + f.key);
        input.value = Math.max(f.min, Math.min(f.max, Math.round(v * 100 / f.step) * f.step));
      });
    }

    data.scenarios.forEach(function (s, k) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.value = String(k); b.textContent = s.name; b.setAttribute('aria-pressed', 'false');
      presets.appendChild(b);
    });
    var clear = document.createElement('button');
    clear.type = 'button'; clear.dataset.value = 'clear'; clear.textContent = 'Reset'; clear.className = 'reset';
    presets.appendChild(clear);
    presets.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.value === 'clear') { shocks = {}; setActive(null); }
      else {
        var s = data.scenarios[Number(b.dataset.value)];
        shocks = Object.assign({}, s.shocks);
        setActive(Number(b.dataset.value));
      }
      syncSliders();
      update();
    });

    function update() {
      FACTORS.forEach(function (f) { $('st-' + f.key + '-out').textContent = label(f, shocks[f.key] || 0); });
      var rows = stressPnl(data, shocks), total = rows.reduce(function (a, r) { return a + r.pnl; }, 0);
      var scale = Math.max(250000, Math.max.apply(null, rows.map(function (r) { return Math.abs(r.pnl); })));
      $('st-bars').innerHTML = rows.map(function (r) {
        var width = Math.abs(r.pnl) / scale * 50, left = r.pnl < 0 ? 50 - width : 50;
        return '<div class="row"><span class="name">' + r.name + '</span><span class="track"><span class="mid"></span>' +
          '<span class="fill ' + (r.pnl < 0 ? 'loss' : 'gain') + '" style="left:' + left + '%;width:' + width + '%"></span></span>' +
          '<span class="val">' + money(r.pnl) + '</span></div>';
      }).join('');
      $('st-total').textContent = money(total);
      $('st-total').className = 'total ' + (total < 0 ? 'loss' : total > 0 ? 'gain' : '');
      var s = active === null ? null : data.scenarios[active];
      $('st-title').textContent = s ? s.name + ' (' + niceDate(s.start) + ' to ' + niceDate(s.end) + ')' : 'Your scenario';
      $('st-note').textContent = total < 0 ? (-total / data.today_var99).toFixed(1) + ' × today’s one-day 99% VaR' :
        total > 0 ? 'A gain for this portfolio' : 'Move a slider or pick a scenario';
    }

    function niceDate(iso) {
      var names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return Number(iso.slice(8, 10)) + ' ' + names[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4);
    }

    $('st-foot').textContent = 'Portfolio as of ' + niceDate(data.asof) + ': 10-year Treasury yield ' + data.yields.DGS10.toFixed(2) +
      '%, Baa yield ' + data.yields.DBAA.toFixed(2) + '%. Today’s one-day 99% VaR (filtered HS) is ' +
      money(data.today_var99).replace('+', '') + '. Historical scenarios apply the moves between the two closes shown.';
    // open on the Lehman month, the heaviest of the historical scenarios
    var first = data.scenarios.findIndex(function (s) { return s.name.indexOf('Lehman') === 0; });
    if (first >= 0) { shocks = Object.assign({}, data.scenarios[first].shocks); setActive(first); }
    syncSliders();
    update();
  }

  // in Node (tests), export the calculations instead of drawing
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { stressPnl: stressPnl, kupiec: kupiec, independence: independence };
    return;
  }

  fetch('data/market-risk.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { readColors(); initExplorer(data); initStress(data); })
    .catch(function () {
      document.querySelectorAll('.tool').forEach(function (el) {
        el.insertAdjacentHTML('beforeend', '<p class="tool-note">The data for this tool could not be loaded.</p>');
      });
    });

})();
