/* App.Calc.buildGroupSeries — 依交易 + 成員歷史收盤回推群組每日市值。SPEC §6.5 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store, U = App.Util;

beforeEach(() => resetStore());

const T = iso => Date.parse(iso + 'T00:00:00+08:00'); // 台北零時

test('空成員 / 無交易 → []', () => {
  assert.deepEqual(C.buildGroupSeries([], {}, 30), []);
  assert.deepEqual(C.buildGroupSeries(['2330'], {}, 30), []);
});

test('每日群組市值 = Σ 持股 × 歷史收盤（美股 × 匯率）', () => {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }, { code: 'TSLA', name: 'Tesla', market: 'us' }]);
  S.setTransactions([
    { id: '1', symbol: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, time: T('2026-01-05') },
    { id: '2', symbol: 'TSLA', type: 'BUY', shares: 10, price: 300, fee: 0, time: T('2026-01-06') },
  ]);
  const hist = {
    '2330': [{ date: '2026-01-05', close: 500 }, { date: '2026-01-06', close: 520 }],
    TSLA: [{ date: '2026-01-06', close: 310 }],
  };
  const series = C.buildGroupSeries(['2330', 'TSLA'], hist, 30);
  const at = ds => series.find(s => s.date === ds);

  assert.equal(at('2026-01-05').mv, 50000);              // 僅 2330：100 × 500
  assert.equal(Math.round(at('2026-01-06').mv), 145000); // 2330 100×520 + TSLA 10×310×30
  // 日期升冪、連續，且延伸到今天
  assert.equal(series[0].date, '2026-01-05');
  assert.ok(series.length > 1);
  for (let i = 1; i < series.length; i++) assert.ok(series[i].date > series[i - 1].date);
});

test('賣出後持股歸零 → 該日之後市值為 0', () => {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }]);
  S.setTransactions([
    { id: '1', symbol: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, time: T('2026-01-05') },
    { id: '2', symbol: '2330', type: 'SELL', shares: 100, price: 600, fee: 0, time: T('2026-01-08') },
  ]);
  const hist = { '2330': [{ date: '2026-01-05', close: 500 }, { date: '2026-01-08', close: 600 }] };
  const series = C.buildGroupSeries(['2330'], hist, 30);
  const at = ds => series.find(s => s.date === ds);
  assert.equal(at('2026-01-06').mv, 50000); // 持有中
  assert.equal(at('2026-01-09').mv, 0);      // 賣光後
});

test('無歷史價的成員以成本估算，不為 NaN', () => {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }]);
  S.setTransactions([{ id: '1', symbol: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, time: T('2026-01-05') }]);
  const series = C.buildGroupSeries(['2330'], {}, 30); // 無 hist
  assert.equal(series[0].mv, 50000); // 用成本 500
  for (const s of series) assert.ok(isFinite(s.mv));
});
