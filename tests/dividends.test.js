/* dividends — 股息帳本 + 配股 + 統計整合 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store;

beforeEach(() => resetStore());

test('Store：getDividends 預設空陣列、可讀寫、clearAll 清空', () => {
  assert.deepEqual(S.getDividends(), []);
  S.setDividends([{ id: 'a', symbol: '2330', amount: 100, date: '2026-01-10' }]);
  assert.equal(S.getDividends().length, 1);
  S.clearAll();
  assert.deepEqual(S.getDividends(), []);
});

const t = d => new Date(d + 'T12:00:00+08:00').getTime();

test('配股：股數增加、平均成本下降、總成本不變', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電', time: t('2026-01-10') });
  const r = C.addStockDividend({ symbolInput: '2330', market: 'tse', name: '台積電', shares: 10, date: '2026-02-10' });
  assert.equal(r.ok, true);
  const pos = C.buildPositions().find(p => p.symbol === '2330');
  assert.equal(pos.shares, 110);
  assert.equal(Math.round(pos.cost), 50000);
  assert.ok(Math.abs(pos.avgCost - 50000 / 110) < 1e-6);
});

test('配股後賣出：以稀釋均價算已實現', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電', time: t('2026-01-10') });
  C.addStockDividend({ symbolInput: '2330', market: 'tse', name: '台積電', shares: 10, date: '2026-02-10' });
  C.addTransaction({ symbolInput: '2330', type: 'SELL', shares: 110, price: 600, fee: 0, market: 'tse', name: '台積電', time: t('2026-03-10') });
  const rz = S.getRealized().filter(r => r.symbol === '2330');
  const pnl = rz.reduce((s, r) => s + r.realizedPnl, 0);
  assert.equal(Math.round(pnl), 16000);
});

test('addStockDividend：股數需 > 0', () => {
  assert.equal(C.addStockDividend({ symbolInput: '2330', shares: 0 }).ok, false);
});

test('feesSummary：配股不計入筆數與手續費', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 10, market: 'tse', name: '台積電', time: t('2026-01-10') });
  C.addStockDividend({ symbolInput: '2330', market: 'tse', name: '台積電', shares: 10, date: '2026-02-10' });
  const f = C.feesSummary(null, null);
  assert.equal(f.count, 1);
  assert.equal(Math.round(f.total), 10);
});

test('dividendsTotalTwd / dividendsBetween：TWD 彙總、台美拆分、區間過濾', () => {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }, { code: 'AAPL', name: 'Apple', market: 'us' }]);
  S.setDividends([
    { id: '1', symbol: '2330', market: 'tse', amount: 1000, date: '2026-03-10' },
    { id: '2', symbol: 'AAPL', market: 'us', amount: 20, date: '2026-06-10' },
  ]);
  assert.equal(Math.round(C.dividendsTotalTwd()), 1600);
  const all = C.dividendsBetween(null, null);
  assert.deepEqual([Math.round(all.total), Math.round(all.tw), Math.round(all.us), all.count], [1600, 1000, 600, 2]);
  const mar = C.dividendsBetween('2026-03-01', '2026-03-31');
  assert.deepEqual([Math.round(mar.total), mar.count], [1000, 1]);
  const none = C.dividendsBetween('2026-04-01', '2026-04-30');
  assert.deepEqual([none.total, none.count], [0, 0]);
});

test('addDividend：寫入帳本；有帳戶則入帳(原幣別)', () => {
  const acct = { id: S.uuid(), name: '台幣', currency: 'TWD', balance: 1000 };
  S.setCashAccounts([acct]);
  const r = C.addDividend({ symbolInput: '2330', market: 'tse', name: '台積電', amount: 500, date: '2026-03-10', accountId: acct.id });
  assert.equal(r.ok, true);
  assert.equal(S.getDividends().length, 1);
  assert.equal(S.getCashAccounts()[0].balance, 1500);
});

test('addDividend：無帳戶 → 只記帳本、不動現金', () => {
  const acct = { id: S.uuid(), name: '台幣', currency: 'TWD', balance: 1000 };
  S.setCashAccounts([acct]);
  C.addDividend({ symbolInput: '2330', market: 'tse', amount: 500, date: '2026-03-10' });
  assert.equal(S.getCashAccounts()[0].balance, 1000);
});

test('deleteDividend：沖銷入帳現金', () => {
  const acct = { id: S.uuid(), name: '台幣', currency: 'TWD', balance: 1000 };
  S.setCashAccounts([acct]);
  const r = C.addDividend({ symbolInput: '2330', market: 'tse', amount: 500, date: '2026-03-10', accountId: acct.id });
  C.deleteDividend(r.id);
  assert.equal(S.getDividends().length, 0);
  assert.equal(S.getCashAccounts()[0].balance, 1000);
});

test('addDividend：金額需 > 0', () => {
  assert.equal(C.addDividend({ symbolInput: '2330', amount: 0 }).ok, false);
});

test('buildSummary：含息報酬 = 資本損益 + 累計股息', () => {
  S.setFxRate(30);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電' });
  S.setPrices({ '2330': { price: 550, dailyChange: 0, prevClose: 550 } });
  C.addDividend({ symbolInput: '2330', market: 'tse', amount: 1000, date: '2026-03-10' });
  const s = C.buildSummary(C.buildPositions());
  assert.equal(Math.round(s.totalDividendTwd), 1000);
  assert.equal(Math.round(s.totalPnlWithDiv), Math.round(s.totalPnl) + 1000);
  assert.ok(s.totalReturnWithDivPct > s.totalReturnPct);
});

test('buildSummary：無股利時含息 = 資本利得', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電' });
  S.setPrices({ '2330': { price: 550, dailyChange: 0, prevClose: 550 } });
  const s = C.buildSummary(C.buildPositions());
  assert.equal(s.totalDividendTwd, 0);
  assert.equal(s.totalPnlWithDiv, s.totalPnl);
});

test('buildPositions：每檔帶累計股息', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電' });
  C.addDividend({ symbolInput: '2330', market: 'tse', amount: 300, date: '2026-03-10' });
  C.addDividend({ symbolInput: '2330', market: 'tse', amount: 200, date: '2026-06-10' });
  const pos = C.buildPositions().find(p => p.symbol === '2330');
  assert.equal(pos.dividend, 500);
});

test('deleteSymbol：一併刪除該檔股利並沖銷入帳現金', () => {
  const acct = { id: S.uuid(), name: '台幣', currency: 'TWD', balance: 1000 };
  S.setCashAccounts([acct]);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電' });
  C.addDividend({ symbolInput: '2330', market: 'tse', amount: 500, date: '2026-03-10', accountId: acct.id });
  C.deleteSymbol('2330');
  assert.deepEqual(S.getDividends(), []);
  assert.equal(S.getCashAccounts()[0].balance, 1000);
});

test('dividendsUpTo：累計至指定日期(含)、美股換匯、null=全部', () => {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }, { code: 'AAPL', name: 'Apple', market: 'us' }]);
  S.setDividends([
    { id: '1', symbol: '2330', market: 'tse', amount: 1000, date: '2026-03-10' },
    { id: '2', symbol: 'AAPL', market: 'us', amount: 20, date: '2026-06-10' }, // 20×30 = 600
  ]);
  assert.equal(Math.round(C.dividendsUpTo('2026-03-31')), 1000); // 只到 3 月
  assert.equal(Math.round(C.dividendsUpTo('2026-06-10')), 1600); // 含 6/10 當日
  assert.equal(Math.round(C.dividendsUpTo('2026-02-01')), 0);    // 全部之前
  assert.equal(Math.round(C.dividendsUpTo(null)), 1600);         // null → 全部
});

test('sharesHeldBefore：除息日(不含當日)前的持股', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電', time: t('2026-01-10') });
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 50, price: 600, fee: 0, market: 'tse', name: '台積電', time: t('2026-03-20') });
  assert.equal(C.sharesHeldBefore('2330', '2026-03-17'), 100); // 3/20 那筆在除息日之後,不算
  assert.equal(C.sharesHeldBefore('2330', '2026-06-11'), 150); // 兩筆都在除息日之前
  assert.equal(C.sharesHeldBefore('2330', '2026-01-01'), 0);   // 都還沒買
});

test('scopedStats：本期損益含息 = 資本損益 + 區間股息', () => {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }]);
  S.setSnapshots([
    { date: '2025-12-31', totalPnl: 1000, totalCostBasisTwd: 50000, realizedPnl: 0 },
    { date: '2026-06-30', totalPnl: 4000, totalCostBasisTwd: 50000, realizedPnl: 0 },
  ]);
  S.setDividends([{ id: 'd1', symbol: '2330', market: 'tse', amount: 1500, date: '2026-03-10' }]);
  const st = C.scopedStats('2026-01-01', '2026-12-31', ['month']);
  assert.equal(Math.round(st.periodPnl), 3000);                 // 4000 − 1000(基準)
  assert.equal(Math.round(st.periodDividend), 1500);            // 區間股息
  assert.equal(Math.round((st.periodPnl + st.periodDividend)), 4500); // 含息損益
  assert.ok(Math.abs(st.periodReturnWithDivPct - 9) < 0.01);    // 4500/50000 = 9%
});
