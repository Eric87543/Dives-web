/* recurring.js — 定期定額/繳款排程、價格取值、手續費、負債繳款、addTransaction 擴充 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store;

beforeEach(() => resetStore());

// ---- recurringDueDates（每月）----
test('每月：從過去起始日一次補齊到今天（clamp 到執行日）', () => {
  const plan = { freq: 'monthly', day: 6, startDate: '2026-01-06', lastRun: null };
  const dues = C.recurringDueDates(plan, '2026-07-10');
  assert.deepEqual(dues, ['2026-01-06', '2026-02-06', '2026-03-06', '2026-04-06', '2026-05-06', '2026-06-06', '2026-07-06']);
});

test('每月：執行日 31 於短月自動夾到月底', () => {
  const plan = { freq: 'monthly', day: 31, startDate: '2026-01-31', lastRun: null };
  const dues = C.recurringDueDates(plan, '2026-03-31');
  assert.deepEqual(dues, ['2026-01-31', '2026-02-28', '2026-03-31']);
});

test('每月：lastRun 之後才算（不重複執行已完成期）', () => {
  const plan = { freq: 'monthly', day: 6, startDate: '2026-01-06', lastRun: '2026-03-06' };
  const dues = C.recurringDueDates(plan, '2026-05-10');
  assert.deepEqual(dues, ['2026-04-06', '2026-05-06']);
});

test('每月：endDate 之後不再產生', () => {
  const plan = { freq: 'monthly', day: 6, startDate: '2026-01-06', endDate: '2026-03-06', lastRun: null };
  const dues = C.recurringDueDates(plan, '2026-07-10');
  assert.deepEqual(dues, ['2026-01-06', '2026-02-06', '2026-03-06']);
});

test('每月：起始日在未來 → 無到期', () => {
  const plan = { freq: 'monthly', day: 6, startDate: '2026-08-06', lastRun: null };
  assert.deepEqual(C.recurringDueDates(plan, '2026-07-10'), []);
});

test('每月：起始日晚於執行日 → 首期落到次月', () => {
  const plan = { freq: 'monthly', day: 6, startDate: '2026-01-20', lastRun: null };
  const dues = C.recurringDueDates(plan, '2026-03-10');
  assert.deepEqual(dues, ['2026-02-06', '2026-03-06']);
});

// ---- recurringDueDates（每週 / 雙週）----
test('每週：全部同一星期幾、間隔 7 天、落在區間內', () => {
  const plan = { freq: 'weekly', day: 1, startDate: '2026-01-01', lastRun: null };
  const dues = C.recurringDueDates(plan, '2026-03-01');
  assert.ok(dues.length >= 7);
  const wd = C.isoAddDays; // 使用內部日期加法驗證間隔
  for (let i = 1; i < dues.length; i++) assert.equal(wd(dues[i - 1], 7), dues[i]);
  assert.ok(dues[0] >= '2026-01-01');
  assert.ok(dues[dues.length - 1] <= '2026-03-01');
});

test('雙週：間隔 14 天', () => {
  const plan = { freq: 'biweekly', day: 3, startDate: '2026-01-01', lastRun: null };
  const dues = C.recurringDueDates(plan, '2026-04-01');
  assert.ok(dues.length >= 3);
  for (let i = 1; i < dues.length; i++) assert.equal(C.isoAddDays(dues[i - 1], 14), dues[i]);
});

// ---- priceOnOrBefore ----
test('priceOnOrBefore：假日取前一交易日；open/close 分別；區間前回 null', () => {
  const series = [
    { date: '2026-07-03', open: 10, close: 11 },
    { date: '2026-07-06', open: 12, close: 13 },
  ];
  assert.equal(C.priceOnOrBefore(series, '2026-07-05', 'close'), 11); // 週末 → 7/3 收
  assert.equal(C.priceOnOrBefore(series, '2026-07-05', 'open'), 10);
  assert.equal(C.priceOnOrBefore(series, '2026-07-06', 'close'), 13);
  assert.equal(C.priceOnOrBefore(series, '2026-07-02', 'close'), null); // 早於最早資料
  assert.equal(C.priceOnOrBefore([], '2026-07-06', 'close'), null);
});

test('priceOnOrBefore：open 缺漏時退回 close', () => {
  const series = [{ date: '2026-07-06', close: 13 }];
  assert.equal(C.priceOnOrBefore(series, '2026-07-06', 'open'), 13);
});

// ---- planFee ----
test('planFee：費率 / 固定 / 無，皆四捨五入到 2 位', () => {
  assert.equal(C.planFee({ feeMode: 'rate', feeVal: 0.1425 }, 10000), 14.25);
  assert.equal(C.planFee({ feeMode: 'rate', feeVal: 0.1425 }, 12345), 17.59); // 17.591625 → 17.59
  assert.equal(C.planFee({ feeMode: 'fixed', feeVal: 5 }, 10000), 5);
  assert.equal(C.planFee({ feeMode: 'none' }, 10000), 0);
});

// ---- applyLiabilityPayment ----
test('applyLiabilityPayment：扣負債餘額 + 同步扣現金帳戶', () => {
  const acc = { id: S.uuid(), name: '台幣', currency: 'TWD', balance: 500 };
  S.setCashAccounts([acc]);
  const liab = { id: S.uuid(), name: '信貸', currency: 'TWD', balance: 1000 };
  S.setLiabilities([liab]);
  const r = C.applyLiabilityPayment(liab.id, 300, acc.id);
  assert.equal(r.ok, true);
  assert.equal(r.paid, 300);
  assert.equal(S.getLiabilities()[0].balance, 700);
  assert.equal(S.getCashAccounts()[0].balance, 200);
});

test('applyLiabilityPayment：不超付（餘額不足只付到 0）', () => {
  const liab = { id: S.uuid(), name: '信貸', currency: 'TWD', balance: 700 };
  S.setLiabilities([liab]);
  const r = C.applyLiabilityPayment(liab.id, 800, null);
  assert.equal(r.paid, 700);
  assert.equal(S.getLiabilities()[0].balance, 0);
});

test('applyLiabilityPayment：找不到負債 → 不動作', () => {
  const r = C.applyLiabilityPayment('nope', 100, null);
  assert.equal(r.ok, false);
});

// ---- addTransaction 擴充：fee 2 位、time、source ----
test('addTransaction：手續費存到小數第 2 位、time/source 生效', () => {
  const t = new Date('2026-03-06T12:00:00+08:00').getTime();
  const r = C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 10, price: 100, fee: 14.2567, market: 'tse', name: '台積電', time: t, source: 'dca' });
  assert.equal(r.ok, true);
  const tx = S.getTransactions().find(x => x.symbol === '2330');
  assert.equal(tx.fee, 14.26);   // 四捨五入 2 位
  assert.equal(tx.time, t);      // 指定成交時間
  assert.equal(tx.source, 'dca');
});

test('addTransaction：未給 time 時預設現在、無 source 欄位', () => {
  const before = Date.now();
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 1, price: 100, fee: 0, market: 'tse' });
  const tx = S.getTransactions()[0];
  assert.ok(tx.time >= before);
  assert.equal('source' in tx, false);
});
