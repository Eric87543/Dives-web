/* investedBetween — 報表「本期投入」改由交易計算（FX 中性），修正無交易期間的假投入 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store;

beforeEach(() => resetStore());

const t = d => new Date(d + 'T12:00:00+08:00').getTime();

test('只計期間內買入；無交易期間 = 0（且不受匯率變動影響）', () => {
  S.setFxRate(31);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 10, market: 'tse', name: '台積電', time: t('2026-01-10') }); // 台股 50010
  C.addTransaction({ symbolInput: 'AAPL', type: 'BUY', shares: 10, price: 200, fee: 0, market: 'us', name: 'Apple', time: t('2026-02-10') });   // 美股 10×200×31 = 62000

  assert.equal(Math.round(C.investedBetween('2025-12-31', '2026-01-31')), 50010); // 1 月：只有台股
  assert.equal(Math.round(C.investedBetween('2026-01-31', '2026-02-28')), 62000); // 2 月：只有美股

  // 3 月沒有任何交易 → 0（改匯率也一樣，重點修正）
  S.setFxRate(29);
  assert.equal(Math.round(C.investedBetween('2026-02-28', '2026-03-31')), 0);
});

test('自始累計 = 目前總成本基礎（同一匯率）', () => {
  S.setFxRate(29);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電', time: t('2026-01-10') });
  C.addTransaction({ symbolInput: 'AAPL', type: 'BUY', shares: 10, price: 200, fee: 0, market: 'us', name: 'Apple', time: t('2026-02-10') });
  const total = C.investedBetween(null, '2026-12-31');
  const sm = C.buildSummary(C.buildPositions());
  assert.equal(Math.round(total), Math.round(sm.totalCostBasisTwd)); // 50000 + 10×200×29 = 108000
});

test('賣出以賣出時均價扣除成本（該期淨投入可為負）', () => {
  S.setFxRate(1);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電', time: t('2026-01-10') }); // 成本 50000
  C.addTransaction({ symbolInput: '2330', type: 'SELL', shares: 40, price: 600, fee: 0, market: 'tse', name: '台積電', time: t('2026-02-10') }); // 移除 40×500 = 20000

  assert.equal(Math.round(C.investedBetween('2026-01-31', '2026-02-28')), -20000); // 2 月淨投入 = −20000
  assert.equal(Math.round(C.investedBetween(null, '2026-12-31')), 30000);          // 自始 = 50000 − 20000
});

test('to 為 null → 0', () => {
  assert.equal(C.investedBetween(null, null), 0);
});
