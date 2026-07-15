/* feesSummary — 報表統計的手續費彙總（TWD，美股/加密以匯率換算），可依時間區間過濾 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store;

beforeEach(() => resetStore());

const t = d => new Date(d + 'T12:00:00+08:00').getTime();

function seed() {
  S.setFxRate(30);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 10, market: 'tse', name: '台積電', time: t('2026-01-10') });
  C.addTransaction({ symbolInput: '2330', type: 'SELL', shares: 40, price: 600, fee: 3, market: 'tse', name: '台積電', time: t('2026-02-15') });
  C.addTransaction({ symbolInput: 'AAPL', type: 'BUY', shares: 10, price: 200, fee: 5, market: 'us', name: 'Apple', time: t('2026-02-10') }); // 5 × 30 = 150 TWD
}

test('全部歷史：total/buy/sell/count（美股手續費換算 TWD）', () => {
  seed();
  const f = C.feesSummary(null, null);
  assert.equal(Math.round(f.total), 163); // 10 + 3 + 150
  assert.equal(Math.round(f.buy), 160);   // 10 + 150
  assert.equal(Math.round(f.sell), 3);
  assert.equal(f.count, 3);
});

test('依區間過濾（含頭尾）', () => {
  seed();
  const jan = C.feesSummary('2026-01-01', '2026-01-31');
  assert.deepEqual([Math.round(jan.total), jan.count], [10, 1]);
  const feb = C.feesSummary('2026-02-01', '2026-02-28');
  assert.deepEqual([Math.round(feb.total), Math.round(feb.buy), Math.round(feb.sell), feb.count], [153, 150, 3, 2]);
  const mar = C.feesSummary('2026-03-01', '2026-03-31');
  assert.deepEqual([mar.total, mar.count], [0, 0]); // 無交易
});

test('無交易 → 全為 0', () => {
  const f = C.feesSummary(null, null);
  assert.deepEqual([f.total, f.buy, f.sell, f.count], [0, 0, 0, 0]);
});
