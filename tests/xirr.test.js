/* XIRR 年化報酬率（資金加權，v135）：
 *   xirrRate(flows)：解 Σ amountᵢ/(1+r)^yearsᵢ = 0；Newton + 二分備援；無解回 null。
 *   flows: [{time(ms), amount}]，負=投入、正=收回；年 = 365.25 天。
 *   portfolioXirr(nowMs)：交易(BUY/SELL 含手續費)+現金股利+目前市值終值 → {rate(%), days, since}。
 *   STOCK_DIV 無現金流；美股/加密以現行匯率換 TWD。 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store;

beforeEach(() => resetStore());

const DAY = 86400000;
const YEAR = 365.25 * DAY;
const NOW = 1800000000000; // 固定「現在」(2027-01),避免測試依賴真實時鐘

// ---- xirrRate 純函式 ----
test('xirrRate：一年前投入 100、今值 200 → 年化 ~100%', () => {
  const r = C.xirrRate([{ time: NOW - YEAR, amount: -100 }, { time: NOW, amount: 200 }]);
  assert.ok(Math.abs(r - 1.0) < 0.005, `expect ~1.0, got ${r}`);
});

test('xirrRate：半年 +10% → 年化 ~21%（複利）', () => {
  const r = C.xirrRate([{ time: NOW - YEAR / 2, amount: -100 }, { time: NOW, amount: 110 }]);
  assert.ok(Math.abs(r - 0.21) < 0.005, `expect ~0.21, got ${r}`);
});

test('xirrRate：定期定額且價格不動（終值=投入總和） → ~0%', () => {
  const flows = [];
  for (let i = 12; i >= 1; i--) flows.push({ time: NOW - i * 30 * DAY, amount: -1000 });
  flows.push({ time: NOW, amount: 12000 });
  const r = C.xirrRate(flows);
  assert.ok(Math.abs(r) < 0.002, `expect ~0, got ${r}`);
});

test('xirrRate：虧損也能解（一年 −20% → ~−20%）', () => {
  const r = C.xirrRate([{ time: NOW - YEAR, amount: -100 }, { time: NOW, amount: 80 }]);
  assert.ok(Math.abs(r - (-0.2)) < 0.005, `expect ~-0.2, got ${r}`);
});

test('xirrRate：全同號 / 少於 2 筆 → null', () => {
  assert.equal(C.xirrRate([{ time: NOW - YEAR, amount: -100 }, { time: NOW, amount: -50 }]), null);
  assert.equal(C.xirrRate([{ time: NOW, amount: 100 }]), null);
  assert.equal(C.xirrRate([]), null);
  assert.equal(C.xirrRate(null), null);
});

// ---- portfolioXirr 組合層 ----
test('portfolioXirr：一年前買台股、現值翻倍 → rate ~100%,days ~365', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 100, fee: 0, market: 'tse', name: '台積電', time: NOW - YEAR });
  S.setPrices({ '2330': { price: 200, dailyChange: 0, prevClose: 200 } });
  const x = C.portfolioXirr(NOW);
  assert.ok(x, 'should not be null');
  assert.ok(Math.abs(x.rate - 100) < 0.5, `expect ~100, got ${x.rate}`);
  assert.ok(x.days >= 364 && x.days <= 367, `days ${x.days}`);
});

test('portfolioXirr：現金股利計入（提高報酬率）', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 100, fee: 0, market: 'tse', time: NOW - YEAR });
  S.setPrices({ '2330': { price: 100, dailyChange: 0, prevClose: 100 } }); // 價格不動
  const noDiv = C.portfolioXirr(NOW);
  assert.ok(Math.abs(noDiv.rate) < 0.2, `no-div ~0, got ${noDiv.rate}`);
  // 半年前收 500 股利 → 報酬率轉正
  const d = new Date(NOW - YEAR / 2);
  const iso = d.toISOString().slice(0, 10);
  C.addDividend({ symbolInput: '2330', amount: 500, date: iso, market: 'tse' });
  const withDiv = C.portfolioXirr(NOW);
  assert.ok(withDiv.rate > 4 && withDiv.rate < 7, `expect ~5%, got ${withDiv.rate}`); // 500/10000 半年入帳
});

test('portfolioXirr：美股以現行匯率換算(買入與終值同幣別基準)', () => {
  S.setFxRate(30);
  C.addTransaction({ symbolInput: 'TSLA', type: 'BUY', shares: 10, price: 100, fee: 0, market: 'us', time: NOW - YEAR });
  S.setPrices({ TSLA: { price: 150, dailyChange: 0, prevClose: 150 } });
  const x = C.portfolioXirr(NOW);
  assert.ok(Math.abs(x.rate - 50) < 0.5, `expect ~50, got ${x.rate}`); // 匯率同乘不影響比率
});

test('portfolioXirr：配股(STOCK_DIV)不產生現金流,但市值反映在終值', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 100, fee: 0, market: 'tse', time: NOW - YEAR });
  C.addStockDividend({ symbolInput: '2330', shares: 10, date: new Date(NOW - YEAR / 2).toISOString().slice(0, 10) });
  S.setPrices({ '2330': { price: 100, dailyChange: 0, prevClose: 100 } });
  const x = C.portfolioXirr(NOW);
  // 投入 10000 → 終值 110 股 × 100 = 11000,一年 → ~10%
  assert.ok(Math.abs(x.rate - 10) < 0.5, `expect ~10, got ${x.rate}`);
});

test('portfolioXirr：賣出含手續費為正流;全數出清後仍可計算(無終值)', () => {
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 100, fee: 100, market: 'tse', time: NOW - YEAR });
  C.addTransaction({ symbolInput: '2330', type: 'SELL', shares: 100, price: 120, fee: 100, market: 'tse', time: NOW });
  const x = C.portfolioXirr(NOW);
  // −10100 → +11900,一年 → ~17.8%
  assert.ok(Math.abs(x.rate - 17.8) < 0.5, `expect ~17.8, got ${x.rate}`);
});

test('portfolioXirr：無任何交易 → null', () => {
  assert.equal(C.portfolioXirr(NOW), null);
});
