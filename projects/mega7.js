/* Dashboard for projects/mega7.html.
   Data: data/mega7.json, summary statistics only, exported by scripts/export_site_data.py in
   github.com/xm0207/mega7-decomposition from the CSVs in its results/ folder. The charts are drawn as SVG. */
(function () {
  'use strict';

  var STOCKS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December'];
  var NS = 'http://www.w3.org/2000/svg';

  // text and grid colours follow the site theme; the series colours were checked for colour-vision deficiency
  var C = {};
  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) { return cs.getPropertyValue(name).trim() || fallback; }
    C = { ink: v('--ink', '#1f1e1d'), body: v('--body', '#3d3a35'), muted: v('--muted', '#77716a'),
      grid: v('--line', '#e4dccd'), surface: v('--card', '#fffdf8'),
      clay: '#c4532f', blue: '#3b6db3', teal: '#1c9a7c', gold: '#d19a1c', grey: '#8f877c', pale: '#d6cdbf',
      reference: '#b3aa9c' };
  }
  var FONT = 11;

  /* ---------- formatting ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fixed(v, d) { var s = Math.abs(v).toFixed(d); return (v < 0 && Number(s) !== 0 ? '−' : '') + s; }
  function signed(v, d) { var s = Math.abs(v).toFixed(d); return Number(s) === 0 ? s : (v < 0 ? '−' : '+') + s; }
  function pct(v, d) { return fixed(v * 100, d === undefined ? 1 : d) + '%'; }
  function spct(v, d) { return signed(v * 100, d === undefined ? 1 : d) + '%'; }
  function pts(v) { return signed(v * 100, 1); }
  function count(v) { return v >= 1 ? v.toFixed(1) : v.toFixed(2); }
  function monthOf(iso) { return MONTHS[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4); }
  function dayOf(iso) { return Number(iso.slice(8, 10)) + ' ' + MONTHS[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4); }
  function longDay(iso) { return Number(iso.slice(8, 10)) + ' ' + MONTHS_LONG[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4); }
  function n0(v) { return Math.round(v).toLocaleString('en-GB'); }
  function niceStep(range, target) {
    var raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  }
  function r1(v) { return Math.round(v * 10) / 10; }

  /* ---------- SVG pieces ---------- */
  function svgOpen(w, h, label) {
    return '<svg xmlns="' + NS + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h +
      '" role="img" aria-label="' + esc(label) + '">';
  }
  function text(x, y, s, o) {
    o = o || {};
    return '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + (o.size || FONT) + '" fill="' + (o.fill || C.muted) +
      '" text-anchor="' + (o.anchor || 'start') + '"' + (o.weight ? ' font-weight="' + o.weight + '"' : '') +
      (o.baseline ? ' dominant-baseline="' + o.baseline + '"' : '') +
      (o.rotate ? ' transform="rotate(' + o.rotate + ' ' + r1(x) + ' ' + r1(y) + ')"' : '') + '>' + esc(s) + '</text>';
  }
  function line(x1, y1, x2, y2, stroke, width, extra) {
    return '<line x1="' + r1(x1) + '" y1="' + r1(y1) + '" x2="' + r1(x2) + '" y2="' + r1(y2) + '" stroke="' + stroke +
      '" stroke-width="' + (width || 1) + '"' + (extra || '') + '/>';
  }
  // a bar from a baseline to a data end, square at the baseline and rounded (4px) at the data end
  function hbar(x0, x1, y, h, fill, attrs) {
    var a = Math.abs(x1 - x0);
    if (a < 0.5) return '';
    var r = Math.min(4, a, h / 2), d = x1 > x0 ? 1 : -1, xe = x1 - d * r;
    return '<path d="M' + r1(x0) + ',' + r1(y) + 'H' + r1(xe) + 'Q' + r1(x1) + ',' + r1(y) + ' ' + r1(x1) + ',' + r1(y + r) +
      'V' + r1(y + h - r) + 'Q' + r1(x1) + ',' + r1(y + h) + ' ' + r1(xe) + ',' + r1(y + h) + 'H' + r1(x0) + 'Z" fill="' + fill +
      '"' + (attrs || '') + '/>';
  }
  function vbar(x, w, y0, y1, fill, rounded, attrs) {
    var a = Math.abs(y1 - y0);
    if (a < 0.5) return '';
    if (!rounded) return '<rect x="' + r1(x) + '" y="' + r1(Math.min(y0, y1)) + '" width="' + r1(w) + '" height="' + r1(a) +
      '" fill="' + fill + '"' + (attrs || '') + '/>';
    var r = Math.min(4, a, w / 2), d = y1 < y0 ? -1 : 1, ye = y1 - d * r;
    return '<path d="M' + r1(x) + ',' + r1(y0) + 'V' + r1(ye) + 'Q' + r1(x) + ',' + r1(y1) + ' ' + r1(x + r) + ',' + r1(y1) +
      'H' + r1(x + w - r) + 'Q' + r1(x + w) + ',' + r1(y1) + ' ' + r1(x + w) + ',' + r1(ye) + 'V' + r1(y0) + 'Z" fill="' + fill +
      '"' + (attrs || '') + '/>';
  }
  function dot(x, y, fill, r) {
    return '<circle cx="' + r1(x) + '" cy="' + r1(y) + '" r="' + (r || 4.5) + '" fill="' + fill + '" stroke="' + C.surface +
      '" stroke-width="2"/>';
  }
  function legend(id, items) {
    $(id).innerHTML = items.map(function (it) {
      return '<span><i class="' + (it[2] || '') + '" style="background:' + it[1] + '"></i>' + esc(it[0]) + '</span>';
    }).join('');
  }

  /* ---------- hover tooltips ---------- */
  function mount(box, svg) {
    box.innerHTML = svg + '<div class="m7-tip" aria-hidden="true"></div>';
    if (!box.m7Bound) {
      box.m7Bound = true;
      var move = function (ev) { if (box.m7Move) box.m7Move(ev); };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerdown', move);
      box.addEventListener('pointerleave', function (ev) {
        if (ev.pointerType === 'touch') return;
        hideTip(box);
        if (box.m7Leave) box.m7Leave();
      });
    }
    box.m7Leave = null;
    return box.querySelector('svg');
  }
  function showTip(box, html, ev) {
    var tip = box.querySelector('.m7-tip');
    tip.innerHTML = html;
    tip.classList.add('on');
    var r = box.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = x + 14;
    if (left + tw > r.width) left = Math.max(0, x - 14 - tw);
    var top = y - th - 12;
    if (top < -20) top = y + 18;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip(box) { var t = box.querySelector('.m7-tip'); if (t) t.classList.remove('on'); }
  // marks carry data-i; html(i) gives the tooltip for mark i
  function markTips(box, html) {
    box.m7Move = function (ev) {
      var m = ev.target && ev.target.closest ? ev.target.closest('[data-i]') : null;
      if (!m || !box.contains(m)) { hideTip(box); return; }
      showTip(box, html(m.getAttribute('data-i')), ev);
    };
  }
  function swatch(color) { return '<i style="background:' + color + '"></i>'; }

  /* ---------- line chart over month ends ---------- */
  function lineChart(box, o) {
    var w = Math.max(280, box.clientWidth);
    var h = Math.round(Math.max(230, Math.min(330, w * 0.42)));
    var pad = { l: 38, r: 14, t: 16, b: 28 };
    var times = o.dates.map(function (d) { return Date.parse(d); });
    var t0 = times[0], t1 = times[times.length - 1], pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    function X(t) { return pad.l + (t - t0) / (t1 - t0) * pw; }
    function Y(v) { return pad.t + (o.yMax - v) / (o.yMax - o.yMin) * ph; }
    var s = svgOpen(w, h, o.label);
    for (var v = o.yMin; v <= o.yMax + 1e-9; v += o.yStep) {
      s += line(pad.l, Y(v), w - pad.r, Y(v), C.grid, 1);
      s += text(pad.l - 7, Y(v) + 4, v.toFixed(1), { anchor: 'end' });
    }
    var yearStep = pw < 360 ? 3 : pw < 620 ? 2 : 1;
    for (var yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) {
      if (yr % yearStep) continue;
      var x = X(Date.UTC(yr, 0, 1));
      s += line(x, h - pad.b, x, h - pad.b + 4, C.muted, 1);
      s += text(x, h - pad.b + 17, String(yr), { anchor: 'middle' });
    }
    o.series.forEach(function (se) {
      var d = se.values.map(function (val, i) { return (i ? 'L' : 'M') + r1(X(times[i])) + ',' + r1(Y(val)); }).join('');
      s += '<path d="' + d + '" fill="none" stroke="' + se.color + '" stroke-width="' + (se.width || 2) +
        '" stroke-linejoin="round" stroke-linecap="round"/>';
    });
    (o.marks || []).forEach(function (m) {
      var mx = X(times[m.i]), my = Y(m.value), above = m.below ? h - pad.b - my < 24 : my - pad.t > 26;
      var anchor = mx < pad.l + 40 ? 'start' : mx > w - pad.r - 40 ? 'end' : 'middle';
      s += dot(mx, my, m.color);
      s += text(mx + (anchor === 'start' ? -4 : anchor === 'end' ? 4 : 0), above ? my - 10 : my + 19, m.text,
        { anchor: anchor, fill: C.ink, weight: 600 });
    });
    s += '<g class="m7-hover" style="display:none">' + line(0, pad.t, 0, h - pad.b, C.muted, 1) +
      o.series.map(function (se) { return dot(0, 0, se.color, 4); }).join('') + '</g>';
    s += '<rect x="' + pad.l + '" y="' + pad.t + '" width="' + pw + '" height="' + ph + '" fill="transparent"/></svg>';
    var svg = mount(box, s);
    var hover = svg.querySelector('.m7-hover'), hl = hover.querySelector('line'), hd = hover.querySelectorAll('circle');
    box.m7Move = function (ev) {
      var rect = svg.getBoundingClientRect(), px = (ev.clientX - rect.left) * w / rect.width;
      if (px < pad.l - 6 || px > w - pad.r + 6) { hover.style.display = 'none'; hideTip(box); return; }
      var t = t0 + (px - pad.l) / pw * (t1 - t0), i = 0;
      for (var k = 1; k < times.length; k++) if (Math.abs(times[k] - t) < Math.abs(times[i] - t)) i = k;
      var cx = X(times[i]);
      hl.setAttribute('x1', cx); hl.setAttribute('x2', cx);
      o.series.forEach(function (se, j) { hd[j].setAttribute('cx', cx); hd[j].setAttribute('cy', Y(se.values[i])); });
      hover.style.display = '';
      showTip(box, o.tip(i), ev);
    };
    box.m7Leave = function () { hover.style.display = 'none'; };
  }

  /* ---------- 1. risk and return ---------- */
  var METRICS = {
    sharpe: { label: 'Sharpe ratio', fmt: function (v) { return v.toFixed(2); }, axis: function (v) { return v.toFixed(1); } },
    volatility: { label: 'Volatility', fmt: function (v) { return pct(v); }, axis: function (v) { return pct(v, 0); } },
    max_drawdown: { label: 'Max drawdown', fmt: function (v) { return pct(v); }, axis: function (v) { return pct(v, 0); } },
    beta: { label: 'Beta to SPY', fmt: function (v) { return v.toFixed(2); }, axis: function (v) { return v.toFixed(1); } }
  };
  var GROUP_COLOR = function (g) { return g === 'stock' ? C.clay : g === 'basket' ? C.teal : C.grey; };

  function initRisk(data) {
    var rows = data.risk, state = { key: 'sharpe', dir: -1 };
    legend('rk-legend', [['The seven', C.clay], ['Equal-weight basket', C.teal], ['Index funds', C.grey]]);

    function sorted() {
      return rows.slice().sort(function (a, b) {
        var x = a[state.key], y = b[state.key];
        if (x === null) return 1;
        if (y === null) return -1;
        return state.dir * (x - y) || (a.ticker < b.ticker ? -1 : 1);
      });
    }
    function label(r) { return r.group === 'basket' ? 'Mega 7 EW' : r.ticker; }

    function draw() {
      var m = METRICS[state.key], list = sorted(), box = $('rk-chart');
      var w = Math.max(280, box.clientWidth), rowH = 26, pad = { l: 74, r: 52, t: 18, b: 26 };
      var h = pad.t + list.length * rowH + pad.b, pw = w - pad.l - pad.r;
      var max = Math.max.apply(null, list.map(function (r) { return r[state.key] || 0; }));
      var step = niceStep(max, pw < 300 ? 3 : 5), top = Math.ceil(max / step) * step;
      function X(v) { return pad.l + v / top * pw; }
      var s = svgOpen(w, h, m.label + ' of the seven, the equal-weight basket and three index funds, sorted ' +
        (state.dir < 0 ? 'from highest' : 'from lowest'));
      for (var v = 0; v <= top + 1e-9; v += step) {
        s += line(X(v), pad.t - 4, X(v), h - pad.b, C.grid, 1);
        s += text(X(v), h - pad.b + 16, m.axis(v), { anchor: 'middle' });
      }
      var spy = rows.filter(function (r) { return r.ticker === 'SPY'; })[0];
      if (spy && spy[state.key] !== null) {
        s += line(X(spy[state.key]), pad.t - 6, X(spy[state.key]), h - pad.b, C.ink, 1, ' stroke-dasharray="3 3" opacity="0.55"');
        s += text(X(spy[state.key]), pad.t - 9, 'SPY ' + m.fmt(spy[state.key]), { anchor: 'middle', fill: C.body, size: 10 });
      }
      list.forEach(function (r, i) {
        var y = pad.t + i * rowH, val = r[state.key];
        s += '<g data-i="' + rows.indexOf(r) + '"><rect x="0" y="' + y + '" width="' + w + '" height="' + rowH + '" fill="transparent"/>';
        s += text(pad.l - 8, y + rowH / 2 + 4, label(r), { anchor: 'end', fill: C.ink, weight: r.group === 'basket' ? 700 : 400 });
        if (val === null) s += text(pad.l + 4, y + rowH / 2 + 4, 'n/a (the reference)', { fill: C.muted });
        else {
          s += hbar(X(0), X(val), y + 6, rowH - 12, GROUP_COLOR(r.group));
          s += text(X(val) + 6, y + rowH / 2 + 4, m.fmt(val), { fill: C.body });
        }
        s += '</g>';
      });
      s += line(X(0), pad.t - 4, X(0), h - pad.b, C.muted, 1) + '</svg>';
      mount(box, s);
      markTips(box, function (i) {
        var r = rows[i];
        return '<b>' + esc(r.group === 'basket' ? 'Mega 7 EW, rebalanced monthly' : r.name) + '</b>' +
          'Annualised return ' + pct(r.ann_return) + '<br>Volatility ' + pct(r.volatility) + '<br>Sharpe ratio ' +
          r.sharpe.toFixed(2) + '<br>Max drawdown ' + pct(r.max_drawdown) + '<br>Beta to SPY ' +
          (r.beta === null ? 'n/a' : r.beta.toFixed(2));
      });
    }

    function table() {
      var tb = $('rk-table').querySelector('tbody');
      tb.innerHTML = sorted().map(function (r) {
        return '<tr class="' + (r.group === 'basket' ? 'm7-basket' : r.group === 'index' ? 'm7-index' : '') + '"><td>' +
          esc(label(r)) + '</td><td class="m7-num">' + pct(r.ann_return) + '</td><td class="m7-num">' + pct(r.volatility) +
          '</td><td class="m7-num">' + r.sharpe.toFixed(2) + '</td><td class="m7-num">' + pct(r.max_drawdown) +
          '</td><td class="m7-num">' + (r.beta === null ? 'n/a' : r.beta.toFixed(2)) + '</td><td class="m7-num">' +
          pct(r.alpha) + ' (' + fixed(r.alpha_t, 1) + ')' + (r.group === 'basket' ? '*' : '') + '</td></tr>';
      }).join('');
      $('rk-table').querySelectorAll('th[data-key]').forEach(function (th) {
        if (th.dataset.key === state.key) th.setAttribute('aria-sort', state.dir < 0 ? 'descending' : 'ascending');
        else th.removeAttribute('aria-sort');
      });
      $('rk-sort').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === state.key)); });
    }

    function set(key, toggle) {
      if (toggle && key === state.key) state.dir = -state.dir;
      else { state.key = key; state.dir = -1; }
      draw(); table();
    }
    $('rk-sort').addEventListener('click', function (ev) { var b = ev.target.closest('button'); if (b) set(b.dataset.value, false); });
    $('rk-table').querySelector('thead').addEventListener('click', function (ev) { var b = ev.target.closest('.m7-sort'); if (b) set(b.dataset.value, true); });
    set('sharpe', false);
    return draw;
  }

  /* ---------- 2. rolling correlation ---------- */
  function initRolling(data) {
    var ro = data.rolling, state = { key: 'avg' };
    var wrap = $('rc-series');
    wrap.innerHTML = '<button type="button" data-value="avg" aria-pressed="true">Average of the 21 pairs</button>' +
      STOCKS.map(function (t) { return '<button type="button" data-value="' + t + '" aria-pressed="false">' + t + '&ndash;SPY</button>'; }).join('');
    function when(i) { return i === ro.dates.length - 1 ? dayOf(ro.dates[i]) : 'End of ' + monthOf(ro.dates[i]); }

    function draw() {
      var avg = { values: ro.avg_corr, color: state.key === 'avg' ? C.clay : C.reference, width: state.key === 'avg' ? 2 : 1.5,
        name: 'Average of the 21 pairs' };
      var series = state.key === 'avg' ? [avg] :
        [avg, { values: ro.corr_to_spy[state.key], color: C.clay, width: 2, name: state.key + ' with SPY' }];
      var main = series[series.length - 1], vals = main.values, lo = 0, hi = 0;
      vals.forEach(function (v, i) { if (v < vals[lo]) lo = i; if (v > vals[hi]) hi = i; });
      var last = vals.length - 1;
      lineChart($('rc-chart'), {
        dates: ro.dates, series: series, yMin: 0, yMax: 1, yStep: 0.2,
        label: 'Trailing one-year correlation at month ends, ' + main.name + ', May 2013 to November 2026, with the low (' +
          vals[lo].toFixed(2) + ', ' + monthOf(ro.dates[lo]) + ') and the peak (' + vals[hi].toFixed(2) + ', ' +
          monthOf(ro.dates[hi]) + ') marked',
        marks: [{ i: lo, value: vals[lo], color: C.blue, text: 'Low ' + vals[lo].toFixed(2), below: true },
          { i: hi, value: vals[hi], color: C.ink, text: 'Peak ' + vals[hi].toFixed(2) }],
        tip: function (i) {
          return '<b>' + when(i) + '</b>' + series.slice().reverse().map(function (se) {
            return swatch(se.color) + esc(se.name) + ' ' + se.values[i].toFixed(2);
          }).join('<br>');
        }
      });
      legend('rc-legend', series.length > 1 ? series.slice().reverse().map(function (se) { return [se.name, se.color, 'm7-line']; }) :
        [['Low', C.blue, 'm7-dot'], ['Peak', C.ink, 'm7-dot']]);
      if (series.length > 1) $('rc-legend').innerHTML += '<span><i class="m7-dot" style="background:' + C.blue + '"></i>Low</span>' +
        '<span><i class="m7-dot" style="background:' + C.ink + '"></i>Peak</span>';
      $('rc-summary').textContent = main.name + ': low ' + vals[lo].toFixed(2) + ' (' + monthOf(ro.dates[lo]) + '), peak ' +
        vals[hi].toFixed(2) + ' (' + monthOf(ro.dates[hi]) + '), ' + vals[last].toFixed(2) + ' on ' + dayOf(ro.dates[last]) + '.';
    }
    wrap.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.key = b.dataset.value;
      wrap.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      draw();
    });
    draw();
    return draw;
  }

  /* ---------- 3. correlation matrix, and calm versus stressed days ---------- */
  var VIEWS = {
    daily: { name: 'Daily returns', note: function (m) { return n0(m.observations) + ' daily returns, 21 May 2012 to 10 November 2026.'; } },
    weekly: { name: 'Weekly returns', note: function (m) { return n0(m.observations) + ' weekly returns (ISO weeks), from May 2012 to the week of 2 November 2026.'; } },
    monthly: { name: 'Monthly returns', note: function (m) {
      return n0(m.observations) + ' monthly returns, June 2012 to October 2026. With this many observations a correlation ' +
        'of 0.4 has a standard error of about 0.06, so differences between single pairs are not significant.'; } },
    resid_spy: { name: 'Daily residuals beyond SPY', note: function () {
      return 'Correlation of daily residuals after removing each stock’s beta to SPY, 21 May 2012 to 10 November 2026. ' +
        'GOOGL, AMZN and META share the most beyond the market.'; } },
    resid_ff6: { name: 'Daily residuals beyond six factors', note: function () {
      return 'Correlation of daily residuals after removing the Fama–French five factors and momentum, 21 May 2012 to 30 ' +
        'September 2026, when the factor files end. These factors contain the seven, which flatters how much they explain.'; } }
  };
  var DIV_POS = [[0, [244, 239, 231]], [0.25, [239, 205, 185]], [0.5, [225, 154, 120]], [0.75, [196, 83, 47]], [1, [142, 58, 32]]];
  var DIV_NEG = [[0, [244, 239, 231]], [0.25, [201, 214, 234]], [0.5, [142, 171, 211]], [1, [47, 90, 150]]];
  function heat(v) {
    var stops = v < 0 ? DIV_NEG : DIV_POS, t = Math.min(1, Math.abs(v)), k = 1;
    while (k < stops.length - 1 && stops[k][0] < t) k++;
    var a = stops[k - 1], b = stops[k], f = (t - a[0]) / (b[0] - a[0]);
    var c = a[1].map(function (x, j) { return Math.round(x + (b[1][j] - x) * f); });
    var lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
    return { fill: 'rgb(' + c.join(',') + ')', text: lum < 0.55 ? '#ffffff' : C.ink };
  }

  function initMatrix(data) {
    var state = { view: 'daily' };
    function draw() {
      var m = data.correlation[state.view], tk = m.tickers, n = tk.length, box = $('cm-chart');
      var w = Math.max(280, box.clientWidth), labelW = 50;
      var cell = Math.floor(Math.min(64, (w - labelW - 4) / (n - 1)));
      var rotate = cell < 46, bottom = rotate ? 44 : 24, top = 6;
      var gw = labelW + cell * (n - 1), h = top + cell * (n - 1) + bottom + 34;
      var x0 = labelW, cells = [];
      var s = svgOpen(w, h, 'Correlation matrix of the seven' + (n > 7 ? ' and SPY' : '') + ', ' +
        VIEWS[state.view].name.toLowerCase() + ', lower triangle with each pair’s correlation printed');
      for (var i = 1; i < n; i++) {
        var y = top + (i - 1) * cell;
        s += text(x0 - 8, y + cell / 2 + 4, tk[i], { anchor: 'end', fill: C.ink });
        for (var j = 0; j < i; j++) {
          var v = m.values[i][j], c = heat(v), x = x0 + j * cell;
          cells.push([tk[i], tk[j], v]);
          s += '<g data-i="' + (cells.length - 1) + '"><rect x="' + (x + 1) + '" y="' + (y + 1) + '" width="' + (cell - 2) +
            '" height="' + (cell - 2) + '" rx="3" fill="' + c.fill + '"/>' +
            text(x + cell / 2, y + cell / 2 + 4, fixed(v, 2), { anchor: 'middle', fill: c.text, size: cell < 38 ? 10 : 11 }) + '</g>';
        }
      }
      var yb = top + (n - 1) * cell;
      for (j = 0; j < n - 1; j++) {
        var cx = x0 + j * cell + cell / 2;
        s += rotate ? text(cx + 3, yb + 10, tk[j], { anchor: 'end', fill: C.ink, rotate: -45, size: 10 }) :
          text(cx, yb + 16, tk[j], { anchor: 'middle', fill: C.ink });
      }
      // colour key from -0.5 to 1
      var ky = h - 22, kx0 = x0, kw = Math.min(220, gw - x0), steps = 30;
      for (var q = 0; q < steps; q++) {
        var val = -0.5 + 1.5 * (q + 0.5) / steps;
        s += '<rect x="' + r1(kx0 + q * kw / steps) + '" y="' + ky + '" width="' + r1(kw / steps + 0.5) + '" height="8" fill="' + heat(val).fill + '"/>';
      }
      [-0.5, 0, 0.5, 1].forEach(function (tv) {
        s += text(kx0 + (tv + 0.5) / 1.5 * kw, ky + 20, fixed(tv, 1), { anchor: 'middle', size: 10 });
      });
      s += text(x0 - 8, ky + 8, 'Scale', { anchor: 'end', size: 10 });
      mount(box, s + '</svg>');
      markTips(box, function (k) {
        var c = cells[k];
        return '<b>' + c[1] + '–' + c[0] + '</b>' + VIEWS[state.view].name + ': ' + fixed(c[2], 2);
      });
      // average, highest and lowest of the 21 pairs among the seven
      var pairs = [];
      for (i = 1; i < n; i++) for (j = 0; j < i; j++) if (tk[i] !== 'SPY') pairs.push([tk[j] + '–' + tk[i], m.values[i][j]]);
      pairs.sort(function (a, b) { return b[1] - a[1]; });
      $('cm-stats').innerHTML = [['Average of the 21 pairs', fixed(m.avg, 2), VIEWS[state.view].name],
        ['Highest pair', fixed(pairs[0][1], 2), pairs[0][0]],
        ['Lowest pair', fixed(pairs[pairs.length - 1][1], 2), pairs[pairs.length - 1][0]]].map(function (c) {
        return '<div class="stat"><span>' + c[0] + '</span><b>' + c[1] + '</b><small>' + esc(c[2]) + '</small></div>';
      }).join('');
      $('cm-note').textContent = VIEWS[state.view].note(m);
    }
    var wrap = $('cm-view');
    wrap.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.view = b.dataset.value;
      wrap.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      draw();
    });
    draw();
    return draw;
  }

  function drawConditional(data) {
    var rows = data.tails.conditional, box = $('cc-chart');
    var w = Math.max(280, box.clientWidth), stacked = w < 560;
    var labelW = stacked ? 0 : 190, rowH = stacked ? 44 : 30, pad = { l: stacked ? 8 : labelW, r: 16, t: 6, b: 26 };
    var h = pad.t + rows.length * rowH + pad.b, pw = w - pad.l - pad.r, top = 0.6;
    function X(v) { return pad.l + v / top * pw; }
    var s = svgOpen(w, h, 'Average pairwise correlation on six sets of days, actual against a one-factor benchmark in which only SPY’s variance changes');
    for (var v = 0; v <= top + 1e-9; v += 0.1) {
      s += line(X(v), pad.t, X(v), h - pad.b, C.grid, 1);
      s += text(X(v), h - pad.b + 16, v.toFixed(1), { anchor: 'middle' });
    }
    rows.forEach(function (r, i) {
      var y = pad.t + i * rowH, cy = stacked ? y + 31 : y + rowH / 2;
      s += '<g data-i="' + i + '"><rect x="0" y="' + y + '" width="' + w + '" height="' + rowH + '" fill="transparent"/>';
      s += stacked ? text(pad.l, y + 15, r.condition, { fill: C.ink, size: 11.5 }) :
        text(pad.l - 12, cy + 4, r.condition, { anchor: 'end', fill: C.ink });
      s += line(X(Math.min(r.actual, r.benchmark)), cy, X(Math.max(r.actual, r.benchmark)), cy, C.pale, 3);
      s += dot(X(r.benchmark), cy, C.blue) + dot(X(r.actual), cy, C.clay) + '</g>';
    });
    mount(box, s + '</svg>');
    markTips(box, function (i) {
      var r = rows[i];
      return '<b>' + esc(r.condition) + '</b>' + n0(r.days) + ' days<br>' + swatch(C.clay) + 'Actual ' + r.actual.toFixed(2) +
        '<br>' + swatch(C.blue) + 'If only SPY’s variance changed ' + r.benchmark.toFixed(2);
    });
    legend('cc-legend', [['Average pairwise correlation', C.clay, 'm7-dot'], ['If only SPY’s variance changed', C.blue, 'm7-dot']]);
  }

  /* ---------- 4. concentration and risk contributions ---------- */
  function drawConcentration(data) {
    var cn = data.concentration;
    var series = [{ values: cn.r2_spy, color: C.clay, name: 'SPY (cap-weighted)' }, { values: cn.r2_rsp, color: C.blue, name: 'RSP (equal-weighted)' }];
    lineChart($('cn-chart'), {
      dates: cn.dates, series: series, yMin: 0, yMax: 1, yStep: 0.2,
      label: 'Share of SPY’s and RSP’s daily variance explained by the equal-weight seven, trailing one-year R squared at month ends, May 2013 to November 2026',
      tip: function (i) {
        return '<b>' + (i === cn.dates.length - 1 ? dayOf(cn.dates[i]) : 'End of ' + monthOf(cn.dates[i])) + '</b>R² on the seven<br>' +
          series.map(function (se) { return swatch(se.color) + se.name + ' ' + se.values[i].toFixed(2); }).join('<br>');
      }
    });
    legend('cn-legend', series.map(function (se) { return [se.name + ': R² on the equal-weight seven', se.color, 'm7-line']; }));
  }

  function initRiskShares(data) {
    var cn = data.concentration, state = { key: 'ew_full' };
    var NAMES = { ew_full: 'equal weights, full-sample covariance', ew_year: 'equal weights, covariance of the last 252 days',
      cap_year: 'current market-cap weights, covariance of the last 252 days' };
    function draw() {
      var set = cn.risk_sets.filter(function (s) { return s.key === state.key; })[0], box = $('rcn-chart');
      var w = Math.max(280, box.clientWidth), rowH = 34, pad = { l: 56, r: 50, t: 6, b: 26 };
      var h = pad.t + cn.tickers.length * rowH + pad.b, pw = w - pad.l - pad.r;
      var max = Math.max.apply(null, set.share.concat(set.weight)), step = niceStep(max, pw < 300 ? 3 : 5);
      var top = Math.ceil(max / step) * step;
      function X(v) { return pad.l + v / top * pw; }
      var s = svgOpen(w, h, 'Each stock’s weight and share of the basket’s volatility, ' + NAMES[state.key]);
      for (var v = 0; v <= top + 1e-9; v += step) {
        s += line(X(v), pad.t, X(v), h - pad.b, C.grid, 1);
        s += text(X(v), h - pad.b + 16, pct(v, 0), { anchor: 'middle' });
      }
      cn.tickers.forEach(function (t, i) {
        var y = pad.t + i * rowH;
        s += '<g data-i="' + i + '"><rect x="0" y="' + y + '" width="' + w + '" height="' + rowH + '" fill="transparent"/>';
        s += text(pad.l - 8, y + rowH / 2 + 4, t, { anchor: 'end', fill: C.ink });
        s += hbar(X(0), X(set.weight[i]), y + 6, 10, C.pale);
        s += hbar(X(0), X(set.share[i]), y + 18, 10, C.clay);
        s += text(X(set.share[i]) + 6, y + 27, pct(set.share[i]), { fill: C.body, size: 10.5 });
        s += '</g>';
      });
      s += line(X(0), pad.t, X(0), h - pad.b, C.muted, 1);
      mount(box, s + '</svg>');
      markTips(box, function (i) {
        return '<b>' + cn.tickers[i] + '</b>' + swatch(C.pale) + 'Weight ' + pct(set.weight[i]) + '<br>' + swatch(C.clay) +
          'Share of volatility ' + pct(set.share[i]) + '<br>Own volatility ' + pct(set.volatility[i]);
      });
      legend('rcn-legend', [['Weight', C.pale], ['Share of the basket’s volatility', C.clay]]);
      $('rcn-stats').innerHTML = [['Basket volatility', pct(set.portfolio_vol), 'annualised'],
        ['Weighted average stock volatility', pct(set.weighted_avg_vol), 'annualised'],
        ['Diversification ratio', set.diversification_ratio.toFixed(2), 'the second over the first']].map(function (c) {
        return '<div class="stat"><span>' + c[0] + '</span><b>' + c[1] + '</b><small>' + c[2] + '</small></div>';
      }).join('');
    }
    var wrap = $('cn-set');
    wrap.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.key = b.dataset.value;
      wrap.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      draw();
    });
    draw();
    return draw;
  }

  /* ---------- 5. joint tail moves ---------- */
  function initTails(data) {
    var jm = data.tails.joint_moves, state = { key: '-0.05' };
    function name(key) { var v = Number(key); return (v < 0 ? 'fell' : 'rose') + ' more than ' + Math.abs(v * 100).toFixed(0) + '%'; }
    function draw() {
      var d = jm[state.key], box = $('jt-chart'), n = d.at_least.length;
      var w = Math.max(280, box.clientWidth), h = Math.round(Math.max(240, Math.min(300, w * 0.38)));
      var pad = { l: 46, r: 14, t: 14, b: 40 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      var vals = d.observed.concat(d.copula).filter(function (v) { return v > 0; });
      var lo = Math.pow(10, Math.floor(Math.log10(Math.min.apply(null, vals)))), hi = Math.pow(10, Math.ceil(Math.log10(Math.max.apply(null, vals))));
      function Y(v) { return pad.t + (Math.log10(hi) - Math.log10(v)) / (Math.log10(hi) - Math.log10(lo)) * ph; }
      function X(i) { return pad.l + (i + 0.5) / n * pw; }
      var s = svgOpen(w, h, 'Days on which at least k of the seven ' + name(state.key) + ', observed against the number a Gaussian copula expects, k from 1 to 5, on a log scale');
      for (var p = lo; p <= hi * 1.001; p *= 10) {
        s += line(pad.l, Y(p), w - pad.r, Y(p), C.grid, 1);
        s += text(pad.l - 7, Y(p) + 4, p >= 1 ? n0(p) : String(p), { anchor: 'end' });
      }
      ['observed', 'copula'].forEach(function (key) {
        var color = key === 'observed' ? C.clay : C.blue;
        var path = d[key].map(function (v, i) { return (i ? 'L' : 'M') + r1(X(i)) + ',' + r1(Y(Math.max(v, lo))); }).join('');
        s += '<path d="' + path + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round"/>';
      });
      for (var i = 0; i < n; i++) {
        s += '<g data-i="' + i + '"><rect x="' + r1(X(i) - pw / n / 2) + '" y="' + pad.t + '" width="' + r1(pw / n) + '" height="' + ph + '" fill="transparent"/>';
        s += dot(X(i), Y(Math.max(d.copula[i], lo)), C.blue) + dot(X(i), Y(Math.max(d.observed[i], lo)), C.clay) + '</g>';
        s += text(X(i), h - pad.b + 16, 'at least ' + d.at_least[i], { anchor: 'middle', fill: C.body });
      }
      s += text(pad.l + pw / 2, h - 6, 'Number of the seven moving on the same day (log scale for days)', { anchor: 'middle', size: 10 });
      mount(box, s + '</svg>');
      markTips(box, function (i) {
        return '<b>At least ' + d.at_least[i] + ' of the seven ' + name(state.key) + '</b>' + swatch(C.clay) + 'Observed ' +
          d.observed[i] + ' days<br>' + swatch(C.blue) + 'Gaussian copula ' + count(d.copula[i]) + '<br>Independent stocks ' +
          count(d.independent[i]) + '<br>Observed / copula ' + (d.observed[i] / d.copula[i]).toFixed(2);
      });
      legend('jt-legend', [['Observed days', C.clay, 'm7-dot'], ['Expected under a Gaussian copula', C.blue, 'm7-dot']]);
      $('jt-table').querySelector('tbody').innerHTML = d.at_least.map(function (k, j) {
        return '<tr><td>' + k + '</td><td class="m7-num">' + d.observed[j] + '</td><td class="m7-num">' + count(d.copula[j]) +
          '</td><td class="m7-num">' + count(d.independent[j]) + '</td><td class="m7-num">' + (d.observed[j] / d.copula[j]).toFixed(2) + '</td></tr>';
      }).join('');
    }
    var wrap = $('jt-threshold');
    wrap.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.key = b.dataset.value;
      wrap.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      draw();
    });
    draw();
    return draw;
  }

  function drawCrashYears(data) {
    var y = data.tails.crash_days_by_year, box = $('jy-chart'), n = y.years.length;
    var w = Math.max(280, box.clientWidth), h = 210, pad = { l: 34, r: 8, t: 18, b: 26 };
    var pw = w - pad.l - pad.r, ph = h - pad.t - pad.b, max = Math.max.apply(null, y.days_3plus_down_5pct);
    var top = Math.ceil(max / 5) * 5, slot = pw / n, bw = Math.min(24, slot * 0.62);
    function Y(v) { return pad.t + (top - v) / top * ph; }
    var s = svgOpen(w, h, 'Days on which at least three of the seven fell more than 5%, by calendar year, 2012 to 2026');
    for (var v = 0; v <= top; v += 5) {
      s += line(pad.l, Y(v), w - pad.r, Y(v), C.grid, 1);
      s += text(pad.l - 7, Y(v) + 4, String(v), { anchor: 'end' });
    }
    y.years.forEach(function (yr, i) {
      var x = pad.l + i * slot + (slot - bw) / 2, d = y.days_3plus_down_5pct[i];
      s += '<g data-i="' + i + '"><rect x="' + r1(pad.l + i * slot) + '" y="' + pad.t + '" width="' + r1(slot) + '" height="' + ph + '" fill="transparent"/>';
      s += vbar(x, bw, Y(0), Y(d), C.clay, true);
      if (d >= 4) s += text(x + bw / 2, Y(d) - 5, String(d), { anchor: 'middle', fill: C.body, size: 10.5 });
      s += '</g>';
      var show = slot >= 34 || i % 2 === 0;
      if (show) s += text(x + bw / 2, h - pad.b + 16, slot >= 34 ? String(yr) : '’' + String(yr).slice(2), { anchor: 'middle', size: 10.5 });
    });
    s += line(pad.l, Y(0), w - pad.r, Y(0), C.muted, 1);
    mount(box, s + '</svg>');
    markTips(box, function (i) {
      var yr = y.years[i];
      return '<b>' + yr + (i === 0 ? ' (from 21 May)' : i === n - 1 ? ' (to 10 November)' : '') + '</b>' +
        y.days_3plus_down_5pct[i] + ' day' + (y.days_3plus_down_5pct[i] === 1 ? '' : 's') + ' with at least three of the seven down more than 5%<br>' +
        n0(y.trading_days[i]) + ' trading days';
    });
  }

  /* ---------- 6. event study ---------- */
  var PARTS = [['market', 'Market'], ['sector', 'Sector beyond SPY'], ['alpha', 'Alpha'], ['specific', 'Company-specific']];
  function partColor(k) { return { market: C.blue, sector: C.teal, alpha: C.gold, specific: C.clay }[k]; }

  function initEvent(data) {
    var es = data.event_study, state = { sector: 'smh' };
    var SECTOR_NAME = { smh: 'SMH', peers: 'peers without Nvidia' };
    function day(date) { return es.days.filter(function (d) { return d.date === date; })[0]; }
    function rank(date) { return es.ranks.filter(function (r) { return r.date === date && r.sector === state.sector; })[0]; }
    function est(event) { return es.estimation.filter(function (e) { return e.event === event && e.sector === state.sector; })[0]; }

    function draw() {
      var days = es.days, box = $('es-chart'), sec = state.sector;
      var w = Math.max(280, box.clientWidth), h = Math.round(Math.max(280, Math.min(360, w * 0.44)));
      var pad = { l: 40, r: 10, t: 28, b: 48 }, pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
      var groups = [], lo = 0, hi = 0;
      days.forEach(function (d) {
        if (!groups.length || groups[groups.length - 1].event !== d.event) groups.push({ event: d.event, days: [] });
        groups[groups.length - 1].days.push(d);
        var up = 0, dn = 0;
        PARTS.forEach(function (p) { var v = d[sec][p[0]]; if (v > 0) up += v; else dn += v; });
        hi = Math.max(hi, up, d.nvda); lo = Math.min(lo, dn, d.nvda);
      });
      var step = niceStep(hi - lo, 5), top = Math.ceil(hi / step) * step, bot = Math.floor(lo / step) * step;
      function Y(v) { return pad.t + (top - v) / (top - bot) * ph; }
      var gap = 0.7, slots = days.length + gap * (groups.length - 1), slot = pw / slots, bw = Math.min(24, slot * 0.5);
      var s = svgOpen(w, h, 'Nvidia’s return on each event day split into market, sector, alpha and company-specific parts, with ' +
        (sec === 'smh' ? 'SMH' : 'an equal-weight basket of eight semiconductor peers without Nvidia') + ' as the sector factor; November 2026 and 27 to 28 January 2025');
      for (var v = bot; v <= top + 1e-9; v += step) {
        s += line(pad.l, Y(v), w - pad.r, Y(v), C.grid, 1);
        s += text(pad.l - 7, Y(v) + 4, signed(v * 100, 0), { anchor: 'end' });
      }
      s += text(0, 11, 'Percentage points', { size: 10.5 });
      var slotPos = 0, wide = slot >= 46;
      groups.forEach(function (g, gi) {
        var gx0 = pad.l + slotPos * slot;
        g.days.forEach(function (d) {
          var cx = pad.l + (slotPos + 0.5) * slot, x = cx - bw / 2, i = days.indexOf(d);
          s += '<g data-i="' + i + '"><rect x="' + r1(cx - slot / 2) + '" y="' + pad.t + '" width="' + r1(slot) + '" height="' + ph + '" fill="transparent"/>';
          ['up', 'down'].forEach(function (dir) {
            var segs = PARTS.map(function (p) { return [p[0], d[sec][p[0]]]; }).filter(function (p) {
              return dir === 'up' ? p[1] > 0 : p[1] < 0;
            }).filter(function (p) { return Math.abs(Y(p[1]) - Y(0)) >= 0.5; });
            var acc = 0;
            segs.forEach(function (p, k) {
              var y0 = Y(acc), y1 = Y(acc + p[1]), outer = k === segs.length - 1;
              // a 2px surface gap between touching segments
              var yy0 = k === 0 ? y0 : y0 + (dir === 'up' ? -1 : 1), yy1 = outer ? y1 : y1 - (dir === 'up' ? -1 : 1);
              if (dir === 'up' ? yy1 < yy0 : yy1 > yy0) s += vbar(x, bw, yy0, yy1, partColor(p[0]), outer);
              acc += p[1];
            });
          });
          s += line(x - 5, Y(d.nvda), x + bw + 5, Y(d.nvda), C.ink, 3, ' stroke-linecap="round"');
          s += '</g>';
          var dd = Number(d.date.slice(8, 10));
          s += text(cx, h - pad.b + 16, wide ? dd + ' ' + MONTHS[Number(d.date.slice(5, 7)) - 1] : String(dd), { anchor: 'middle', fill: C.ink });
          slotPos += 1;
        });
        var gx1 = pad.l + slotPos * slot;
        var gl = g.event === 'November 2026' ? (wide ? 'November 2026' : 'Nov 2026') : (wide ? 'DeepSeek, January 2025' : 'Jan 2025');
        s += line(gx0 + 4, h - pad.b + 24, gx1 - 4, h - pad.b + 24, C.grid, 1);
        s += text((gx0 + gx1) / 2, h - pad.b + 38, gl, { anchor: 'middle', size: 10.5 });
        slotPos += gi < groups.length - 1 ? gap : 0;
      });
      s += line(pad.l, Y(0), w - pad.r, Y(0), C.muted, 1);
      mount(box, s + '</svg>');
      markTips(box, function (i) {
        var d = days[i], p = d[sec];
        return '<b>' + longDay(d.date) + '</b>' + esc(d.label.replace(/'/g, '’')) + '<br>NVDA ' + spct(d.nvda) + ', SPY ' + spct(d.spy) + ', ' +
          (sec === 'smh' ? 'SMH ' + spct(d.smh_return) : 'peers ' + spct(d.peer_return)) + '<br>' +
          PARTS.map(function (q) {
            return swatch(partColor(q[0])) + q[1] + ' ' + pts(p[q[0]]) + (q[0] === 'specific' ? ' (z\u00a0' + signed(p.z, 1) + ')' : '');
          }).join('<br>');
      });
      legend('es-legend', PARTS.map(function (p) { return [p[1], partColor(p[0])]; }).concat([['NVDA’s return, the sum of the parts', C.ink, 'm7-tick']]));

      var nov5 = day('2026-11-05'), nov9 = day('2026-11-09'), jan27 = day('2025-01-27'), rk = rank('2026-11-09');
      var tiles = [
        ['5 Nov 2026: NVDA', spct(nov5.nvda), 'market part ' + pts(nov5[sec].market) + ' pts'],
        ['5 Nov: company-specific', spct(nov5[sec].specific), 'z\u00a0' + signed(nov5[sec].z, 1)],
        ['9 Nov: company-specific', spct(nov9[sec].specific), 'z\u00a0' + signed(nov9[sec].z, 1) + '; NVDA ' + spct(nov9.nvda)],
        ['Rank of 9 Nov’s z', ordinal(rk.rank_z) + ' lowest', 'of ' + n0(rk.days_ranked) + ' days since July 2001'],
        ['27 Jan 2025: sector part', pts(jan27[sec].sector) + ' pts', 'NVDA ' + spct(jan27.nvda)],
        ['27 Jan 2025: company-specific', spct(jan27[sec].specific), 'z\u00a0' + signed(jan27[sec].z, 1)]
      ];
      $('es-stats').innerHTML = tiles.map(function (c) {
        return '<div class="stat"><span>' + c[0] + '</span><b>' + c[1] + '</b><small>' + esc(c[2]) + '</small></div>';
      }).join('');

      $('es-table').querySelector('tbody').innerHTML = es.windows.map(function (wd) {
        var p = wd[sec];
        return '<tr><td>' + esc(wd.label.replace(/(\d)-(\d)/g, '$1–$2').replace(/'/g, '’')) + '</td><td class="m7-num">' + wd.days + '</td><td class="m7-num">' +
          spct(wd.nvda) + '</td><td class="m7-num">' + spct(wd.spy) + '</td><td class="m7-num">' + pts(p.market) +
          '</td><td class="m7-num">' + pts(p.sector) + '</td><td class="m7-num">' + pts(p.alpha) + '</td><td class="m7-num">' +
          pts(p.specific) + ' (' + signed(p.z, 1) + ')</td><td class="m7-num">' + pts(wd.compounding) + '</td></tr>';
      }).join('');

      var e26 = est('November 2026'), e25 = est('DeepSeek, January 2025');
      $('es-note').textContent = 'Parts in percentage points; z is the company-specific part over the residual standard ' +
        'deviation, and for a window of L days the sum over σ√L. Coefficients with ' + SECTOR_NAME[sec] + ' as the sector ' +
        'factor: beta to SPY ' + e26.beta_market.toFixed(2) + ', sector beta ' + e26.beta_sector.toFixed(2) +
        ' and residual sd ' + pct(e26.residual_sd, 2) + ' a day (8 Oct 2025 – 6 Oct 2026); ' + e25.beta_market.toFixed(2) + ', ' +
        e25.beta_sector.toFixed(2) + ' and ' + pct(e25.residual_sd, 2) + ' (27 Dec 2023 – 23 Dec 2024). ' +
        (sec === 'smh' ? 'SMH holds Nvidia, so part of Nvidia’s own move is counted as sector. ' :
          'The peers are AVGO, AMD, TSM, MU, QCOM, ASML, INTC and TXN in equal weights, rebalanced daily. ') +
        'The rank comes from a rolling version of the model estimated for every day since 2 July 2001. The company-specific ' +
        'parts of 4 and 10 November are not attributed to a cause here.';
    }
    function ordinal(k) { var s = ['th', 'st', 'nd', 'rd'], v = k % 100; return k + (s[(v - 20) % 10] || s[v] || s[0]); }
    var seg = $('es-sector');
    seg.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.sector = b.dataset.value;
      seg.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
      draw();
    });
    draw();
    return draw;
  }

  /* ---------- start ---------- */
  function init(data) {
    readColors();
    var conditional = function () { drawConditional(data); };
    var concentration = function () { drawConcentration(data); };
    var crashYears = function () { drawCrashYears(data); };
    conditional(); concentration(); crashYears();
    // the init functions draw once and return their own redraw
    var redraw = [initRisk(data), initRolling(data), initMatrix(data), conditional, concentration, initRiskShares(data),
      initTails(data), crashYears, initEvent(data)];
    // on touch screens a tooltip stays until the next tap outside its chart
    document.addEventListener('pointerdown', function (ev) {
      document.querySelectorAll('.m7-chart').forEach(function (b) {
        if (!b.contains(ev.target)) { hideTip(b); if (b.m7Leave) b.m7Leave(); }
      });
    });
    var timer, lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(timer);
      timer = setTimeout(function () { redraw.forEach(function (f) { f(); }); }, 150);
    });
  }

  fetch('data/mega7.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch(function (err) {
      if (window.console) console.error(err);
      document.querySelectorAll('.tool').forEach(function (el) {
        el.insertAdjacentHTML('beforeend', '<p class="tool-note">The data for this panel could not be loaded.</p>');
      });
    });
})();
