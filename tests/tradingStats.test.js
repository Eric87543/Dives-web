/* App.Calc.tradingStats — 統計頁：區間/交易/持倉之最。SPEC §10 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store, U = App.Util;

beforeEach(() => resetStore());
const T = iso => Date.parse(iso + 'T00:00:00+08:00');

test('區間最佳/最差獲利：以 totalPnl 的期間變化計算', () => {
  // 每日累計損益：+0 → +100 → +50(−50) → +300(+250) → +280(−20)
  S.setSnapshots([
    { date: '2026-03-01', totalPnl: 0 },
    { date: '2026-03-02', totalPnl: 100 },
    { date: '2026-03-03', totalPnl: 50 },
    { date: '2026-03-04', totalPnl: 300 },
    { date: '2026-03-05', totalPnl: 280 },
  ]);
  const st = C.tradingStats();
  assert.equal(st.period.day.best.amount, 250);   // 03-04 大漲
  assert.equal(st.period.day.best.date, '2026-03-04');
  assert.equal(st.period.day.worst.amount, -50);  // 03-03 大跌
  assert.equal(st.period.day.worst.date, '2026-03-03');
});

test('單筆交易之最：最賺 / 最賠（依 realizedPnl）', () => {
  S.setRealized([
    { id: '1', symbol: '2330', realizedPnl: 69800, time: T('2026-05-01') },
    { id: '2', symbol: 'TSLA', realizedPnl: -12000, time: T('2026-05-10') },
    { id: '3', symbol: 'NVDA', realizedPnl: 3000, time: T('2026-05-20') },
  ]);
  const st = C.tradingStats();
  assert.equal(st.bestTrade.symbol, '2330');
  assert.equal(st.bestTrade.amount, 69800);
  assert.equal(st.worstTrade.symbol, 'TSLA');
  assert.equal(st.worstTrade.amount, -12000);
});

test('目前持倉之最：未實現獲利/虧損/報酬率（無資料回 null）', () => {
  const empty = C.tradingStats();
  assert.equal(empty.bestTrade, null);
  assert.equal(empty.topGain, null);

  // 建持倉 + 報價：2330 大賺、TSLA 小賠
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }, { code: 'TSLA', name: 'Tesla', market: 'us' }]);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電' });
  C.addTransaction({ symbolInput: 'TSLA', type: 'BUY', shares: 10, price: 300, fee: 0, market: 'us', name: 'Tesla' });
  S.setPrices({ '2330': { price: 800, dailyChange: 0, prevClose: 800 }, TSLA: { price: 290, dailyChange: 0, prevClose: 290 } });
  const st = C.tradingStats();
  assert.equal(st.topGain.symbol, '2330');           // +30000 TWD
  assert.equal(Math.round(st.topGain.amount), 30000);
  assert.equal(st.topLoss.symbol, 'TSLA');           // −100 USD ×30 = −3000
  assert.equal(Math.round(st.topLoss.amount), -3000);
  assert.equal(st.topPct.symbol, '2330');            // +60%
  assert.equal(Math.round(st.topPct.pct), 60);
});
