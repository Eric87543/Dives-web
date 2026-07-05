/* App.Calc.repairFees — 修正舊版編輯 bug 造成的異常手續費（fee > 成交金額） */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store;

beforeEach(() => resetStore());

// 舊 bug：把絕對金額 fee 當費率% 重算 → fee = amount×(oldFee/100)
const corruptOnce = (amt, f0) => amt * (f0 / 100);

test('台股賣出：單次損毀（fee 遠大於成交金額）→ 精確還原原始手續費', () => {
  S.setFxRate(31.5);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 500, price: 1800, fee: 1282.5, market: 'tse', name: '台積電' });
  C.addTransaction({ symbolInput: '2330', type: 'SELL', shares: 500, price: 2000, fee: 1425, market: 'tse', name: '台積電' });
  const txs = S.getTransactions();
  const sell = txs.find(t => t.type === 'SELL');
  sell.fee = corruptOnce(500 * 2000, 1425); // 14,250,000
  S.setTransactions(txs);

  const rep = C.repairFees();
  assert.equal(rep.fixed.length, 1);
  assert.equal(S.getTransactions().find(t => t.type === 'SELL').fee, 1425);
});

test('多次儲存複利損毀 → 迭代收斂回原值', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 500, price: 1800, fee: 1282.5, market: 'tse', name: '台積電' });
  C.addTransaction({ symbolInput: '2330', type: 'SELL', shares: 500, price: 2000, fee: 1425, market: 'tse', name: '台積電' });
  const txs = S.getTransactions();
  const sell = txs.find(t => t.type === 'SELL');
  const amt = 500 * 2000;
  sell.fee = corruptOnce(amt, corruptOnce(amt, 1425) / 1); // 連損兩次
  // 明確兩次：amt*(amt*14.25/100)/100
  sell.fee = amt * (amt * (1425 / 100) / 100);
  S.setTransactions(txs);
  C.repairFees();
  assert.equal(S.getTransactions().find(t => t.type === 'SELL').fee, 1425);
});

test('合法手續費（fee ≤ 成交金額）一律不動，零誤傷', () => {
  // 零股 1 股 @ 30，手續費 20（比例高但 ≤ 成交金額）→ 不應被修正
  C.addTransaction({ symbolInput: '2603', type: 'BUY', shares: 1, price: 30, fee: 20, market: 'tse', name: '長榮' });
  C.addTransaction({ symbolInput: 'TSLA', type: 'BUY', shares: 10, price: 250, fee: 2, market: 'us', name: 'Tesla' });
  const rep = C.repairFees();
  assert.equal(rep.fixed.length, 0);
  assert.equal(S.getTransactions().find(t => t.symbol === '2603').fee, 20);
  assert.equal(S.getTransactions().find(t => t.symbol === 'TSLA').fee, 2);
});

test('修正後重算賣出已實現損益（用還原的手續費）', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 500, price: 1800, fee: 0, market: 'tse', name: '台積電' });
  C.addTransaction({ symbolInput: '2330', type: 'SELL', shares: 500, price: 2000, fee: 1425, market: 'tse', name: '台積電' });
  const txs = S.getTransactions();
  txs.find(t => t.type === 'SELL').fee = corruptOnce(500 * 2000, 1425);
  S.setTransactions(txs);
  C.repairFees();
  const rz = S.getRealized().find(r => r.symbol === '2330');
  // 買 fee=0 → avgCost=1800；已實現 = (2000−1800)×500 − 1425 = 98575
  assert.equal(Math.round(rz.realizedPnl), 98575);
});
