/* Results by ticker for projects/ticker-risk.html.
   Data: data/tickers.json, summaries only, exported by scripts/export_ticker_results.py in github.com/xm0207/market-risk-toolkit. */
(function () {
  'use strict';

  var GROUPS = [
    ['Stocks', ['AAPL', 'MSFT', 'NVDA', 'JPM', 'XOM']],
    ['ETFs', ['SPY', 'QQQ', 'GLD']],
    ['Crude Oil Futures', ['CL=F', 'BZ=F']]
  ];
  var SHORT = { 'CL=F': 'WTI', 'BZ=F': 'Brent' };
  // Brent's latest figure includes the price gap of the 2 November 2026 contract roll (see the repository README).
  var EXTRA_NOTES = {
    'BZ=F': 'Today’s VaR for Brent is inflated by the price gap of the 2 November 2026 contract roll.'
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function $(id) { return document.getElementById(id); }
  function usd(v) { return (v < 0 ? '−' : '') + '$' + Math.round(Math.abs(v)).toLocaleString('en-US'); }
  function signedUsd(v) { return (v > 0 ? '+' : '') + usd(v); }
  function day(iso) { return Number(iso.slice(8, 10)) + ' ' + MONTHS[Number(iso.slice(5, 7)) - 1] + ' ' + iso.slice(0, 4); }
  function p(v) { return v < 0.001 ? '< 0.001' : v.toFixed(3); }

  function render(data, t, alpha) {
    var pos = t.position;
    $('tk-title').textContent = t.label.indexOf('(' + t.ticker + ')') === -1 ? t.label + ' (' + t.ticker + ')' : t.label;
    $('tk-sub').textContent = (pos.kind === 'futures'
      ? pos.contracts + ' contract of ' + Number(pos.multiplier).toLocaleString('en-US') + ' barrels'
      : '$' + (pos.notional / 1e6).toFixed(0) + 'm position held at constant value') +
      ' · data ' + day(t.data.start) + ' to ' + day(t.data.end) + ' · ' + t.backtest.days.toLocaleString('en-US') + ' days backtested';

    var fhs = t.models.filter(function (m) { return m.model.indexOf('Filtered') === 0 && m.confidence === 0.99; })[0];
    $('tk-stats').innerHTML = [
      ['Today’s 99% VaR', usd(t.today.var99), 'filtered HS, one day'],
      ['Today’s 97.5% ES', usd(t.today.es975), 'filtered HS, one day'],
      ['Exceptions at 99%', fhs.exceptions + '', 'expected ' + fhs.expected.toFixed(1)],
      ['Kupiec p', p(fhs.kupiec_p), 'filtered HS at 99%'],
      ['ES ratio', fhs.es_ratio.toFixed(2), '1 is ideal'],
      ['Days in red zone', (100 * fhs.share_red).toFixed(1) + '%', 'Basel, trailing 250 days']
    ].map(function (c) {
      return '<div class="stat"><span>' + c[0] + '</span><b>' + c[1] + '</b><small>' + c[2] + '</small></div>';
    }).join('');

    var img = $('tk-recent');
    img.src = 'img/tickers/' + t.charts.recent;
    img.alt = t.label + ': daily P&L against the filtered model’s 99% VaR over the last three years';
    $('tk-recent-cap').textContent = 'Last three years: daily P&L in $000 against the filtered model’s 99% VaR, with exceptions in red.';
    var years = $('tk-years');
    years.src = 'img/tickers/' + t.charts.exceptions_by_year;
    years.alt = t.label + ': exceptions per year at 99% for each model';
    $('tk-full').href = 'img/tickers/' + t.charts.backtest;

    var rows = t.models.filter(function (m) { return m.confidence === alpha; });
    $('tk-models').querySelector('tbody').innerHTML = rows.map(function (m) {
      return '<tr><td>' + m.model + '</td><td>' + m.exceptions + '</td><td>' + m.expected.toFixed(1) + '</td><td>' +
        p(m.kupiec_p) + '</td><td>' + p(m.independence_p) + '</td><td>' + m.es_ratio.toFixed(2) + '</td><td>' +
        (m.share_red === undefined ? '–' : (100 * m.share_red).toFixed(1) + '%') + '</td></tr>';
    }).join('');

    $('tk-stress').querySelector('tbody').innerHTML = t.stress.length ? t.stress.map(function (s) {
      return '<tr><td>' + s.name + '</td><td>' + day(s.start) + ' to ' + day(s.end) + '</td><td>' + signedUsd(s.pnl) +
        '</td><td>' + (s.pnl < 0 ? s.times_var99.toFixed(1) : '–') + '</td></tr>';
    }).join('') : '<tr><td colspan="4">No stress window falls inside this asset’s history.</td></tr>';

    var notes = (t.notes || []).slice();
    if (EXTRA_NOTES[t.ticker]) notes.push(EXTRA_NOTES[t.ticker]);
    $('tk-notes').textContent = notes.join(' ');
  }

  function init(data) {
    var byTicker = {};
    data.tickers.forEach(function (t) { byTicker[t.ticker] = t; });
    var state = { ticker: 'SPY', alpha: 0.99 };
    var wrap = $('tk-groups');
    wrap.innerHTML = GROUPS.map(function (g) {
      var buttons = g[1].filter(function (k) { return byTicker[k]; }).map(function (k) {
        return '<button type="button" data-value="' + k + '" aria-pressed="false">' + (SHORT[k] || k) + '</button>';
      }).join('');
      return '<div class="ticker-group"><span>' + g[0] + '</span><div class="presets">' + buttons + '</div></div>';
    }).join('');

    function update() {
      wrap.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.value === state.ticker)); });
      $('tk-alpha').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(Number(b.dataset.value) === state.alpha)); });
      render(data, byTicker[state.ticker], state.alpha);
    }
    wrap.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.ticker = b.dataset.value; update();
    });
    $('tk-alpha').addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) return;
      state.alpha = Number(b.dataset.value); update();
    });
    update();
  }

  fetch('data/tickers.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch(function () { $('tk-title').textContent = 'The results could not be loaded.'; });
})();
