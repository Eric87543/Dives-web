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
  assert.equal(st.period.all.day.best.amount, 250);   // 03-04 大漲
  assert.equal(st.period.all.day.best.date, '2026-03-04');
  assert.equal(st.period.all.day.worst.amount, -50);  // 03-03 大跌
  assert.equal(st.period.all.day.worst.date, '2026-03-03');
  assert.ok(!('year' in st.period.thisYear));         // 今年不含年度
});

test('全部上漲 → 最大虧損為 null（虧損必須為負）', () => {
  S.setSnapshots([
    { date: '2026-03-01', totalPnl: 0 },
    { date: '2026-03-02', totalPnl: 100 },
    { date: '2026-03-03', totalPnl: 250 },
  ]);
  const st = C.tradingStats();
  assert.ok(st.period.all.day.best);          // 有獲利
  assert.equal(st.period.all.day.worst, null); // 無虧損 → null
});

test('賣出全賺 → 最賠一筆為 null；持倉全賺 → 虧損王 null', () => {
  S.setRealized([{ id: '1', symbol: '2330', realizedPnl: 5000, time: T('2026-05-01') }]);
  const st = C.tradingStats();
  assert.equal(st.bestTrade.symbol, '2330');
  assert.equal(st.worstTrade, null);
});

test('單筆交易之最：最賺 / 最賠（依 realizedPnl，含股數/價格）', () => {
  S.setRealized([
    { id: '1', symbol: '2330', shares: 100, sellPrice: 2500, avgCost: 1802, realizedPnl: 69800, time: T('2026-05-01') },
    { id: '2', symbol: 'TSLA', shares: 30, sellPrice: 300, avgCost: 700, realizedPnl: -12000, time: T('2026-05-10') },
    { id: '3', symbol: 'NVDA', shares: 10, sellPrice: 200, avgCost: 100, realizedPnl: 3000, time: T('2026-05-20') },
  ]);
  const st = C.tradingStats();
  assert.equal(st.bestTrade.symbol, '2330');
  assert.equal(st.bestTrade.amount, 69800);
  assert.equal(st.bestTrade.shares, 100);   // 成交股數
  assert.equal(st.bestTrade.price, 2500);    // 成交價
  assert.equal(st.worstTrade.symbol, 'TSLA');
  assert.equal(st.worstTrade.amount, -12000);
});

test('區間獲利之最：忽略第一個期間（第一天的變化不計入）', () => {
  S.setSnapshots([
    { date: '2026-03-01', totalPnl: 0 },
    { date: '2026-03-02', totalPnl: 1000 }, // 第一個變化 +1000 → 應忽略
    { date: '2026-03-03', totalPnl: 1200 }, // +200
    { date: '2026-03-04', totalPnl: 1100 }, // -100
  ]);
  const st = C.tradingStats();
  assert.equal(st.period.all.day.best.amount, 200);   // 不是 1000
  assert.equal(st.period.all.day.best.date, '2026-03-03');
  assert.equal(st.period.all.day.worst.amount, -100);
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
