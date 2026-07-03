/* csv.js — 匯出/匯入 round-trip。SPEC §9 / I6 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store, Csv = App.Csv;

beforeEach(() => resetStore());

test('exportCsv → importCsv round-trip：交易筆數一致 (SPEC I6)', () => {
  S.setFxRate(30);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 71, market: 'tse', name: '台積電' });
  C.addTransaction({ symbolInput: 'AAPL', type: 'BUY', shares: 10, price: 180, fee: 1, market: 'us', name: 'Apple' });
  const before = S.getTransactions().length;
  assert.equal(before, 2);

  const csv = Csv.exportCsv();
  assert.ok(typeof csv === 'string' && csv.length > 0);

  resetStore();
  assert.equal(S.getTransactions().length, 0);

  const res = Csv.importCsv(csv);
  assert.equal(res.ok, true);
  assert.equal(res.txCount, before);
  assert.equal(S.getTransactions().length, before);
});

test('importCsv：空內容回 ok:false', () => {
  const res = Csv.importCsv('');
  assert.equal(res.ok, false);
});
