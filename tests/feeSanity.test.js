/* 手續費防呆 — findAbsurdFees + importCsv 警告。SPEC I7
 * 背景：手續費被計入成本(computeAvgCostPosition)。若某筆交易的手續費被誤填成
 * 天文數字(實例：0050 交易 249.5 萬、手續費 8,870 萬)，重建歷史後整份報表會被毒到
 * (總報酬 -84%)。防呆：fee > 成交金額 25% 視為異常，匯入/重建時警告使用者。 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store, Csv = App.Csv;

beforeEach(() => resetStore());

test('findAbsurdFees：手續費 > 成交金額 25% 才視為異常', () => {
  const txs = [
    { symbol: '0050', type: 'BUY', shares: 50000, price: 49.9, fee: 88706481.5 }, // 35.5 倍 → 異常
    { symbol: '2330', type: 'BUY', shares: 700, price: 1417.64, fee: 14032793 },  // 14 倍 → 異常
    { symbol: '2454', type: 'BUY', shares: 100, price: 1100, fee: 156.75 },       // 0.1425% → 正常
    { symbol: 'AAPL', type: 'BUY', shares: 10, price: 180, fee: 1.44 },           // 0.08% → 正常
    { symbol: 'VT', type: 'BUY', shares: 100, price: 153.9, fee: 12.31 },         // 正常
  ];
  const bad = C.findAbsurdFees(txs);
  assert.deepEqual(bad.map(b => b.symbol).sort(), ['0050', '2330']);
});

test('findAbsurdFees：零股數/零金額/無 fee 不誤報，空陣列回 []', () => {
  assert.deepEqual(C.findAbsurdFees([]), []);
  assert.deepEqual(C.findAbsurdFees([
    { symbol: 'X', type: 'BUY', shares: 0, price: 100, fee: 999 },   // 金額 0 → 略過
    { symbol: 'Y', type: 'BUY', shares: 10, price: 100, fee: 0 },    // fee 0 → 正常
    { symbol: 'Z', type: 'SELL', shares: 10, price: 100, fee: 250 }, // 25% 邊界 → 不算異常(>25% 才算)
  ]), []);
});

test('importCsv：匯入含異常手續費的交易 → 回傳 feeWarnSymbols (SPEC I7)', () => {
  const csv = [
    '# TRANSACTIONS',
    'Symbol,Market,Type,Shares,Price,Fee,Time',
    '0050,tse,BUY,50000,49.9,88706481.5,1753243200000',
    '2330,tse,BUY,700,1417.64,1414.1,1761537600000', // 已修正 → 正常
  ].join('\n');
  const res = Csv.importCsv(csv);
  assert.equal(res.ok, true);
  assert.deepEqual(res.feeWarnSymbols, ['0050']);
});

test('importCsv：手續費全部正常 → feeWarnSymbols 為空陣列', () => {
  const csv = [
    '# TRANSACTIONS',
    'Symbol,Market,Type,Shares,Price,Fee,Time',
    '2330,tse,BUY,700,1417.64,1414.1,1761537600000',
  ].join('\n');
  const res = Csv.importCsv(csv);
  assert.equal(res.ok, true);
  assert.deepEqual(res.feeWarnSymbols, []);
});