/* App.Calc.netWorthBuckets — 淨資產長條圖分桶（純函式）。SPEC §6 / I3 / I4 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { App } = require('./harness');
const C = App.Calc;
const noCL = { cashTwd: 0, liabTwd: 0 };

const daily = (start, vals) => vals.map((nw, i) => ({
  date: `2026-07-${String(start + i).padStart(2, '0')}`, netWorth: nw,
}));

test('空快照 → []', () => {
  assert.deepEqual(C.netWorthBuckets([], 'year', noCL), []);
  assert.deepEqual(C.netWorthBuckets(null, 'day', noCL), []);
});

test('nwOf 回填：無 netWorth 用 市值+現金−負債；有 netWorth 直接用 (SPEC I4)', () => {
  const b1 = C.netWorthBuckets([{ date: '2026-07-01', totalMarketValueTwd: 1000 }], 'day', { cashTwd: 500, liabTwd: 200 });
  assert.equal(b1[0].nw, 1300); // 1000 + 500 − 200

  const b2 = C.netWorthBuckets([{ date: '2026-07-01', netWorth: 9999, totalMarketValueTwd: 1000 }], 'day', { cashTwd: 500, liabTwd: 200 });
  assert.equal(b2[0].nw, 9999); // 有 netWorth → 忽略回填
});

test('day：取最後 7 天，逐日漲跌（首桶對全序列前一日）', () => {
  const snaps = daily(1, [100, 110, 120, 130, 140, 150, 160, 170, 180, 190]); // 10 天
  const b = C.netWorthBuckets(snaps, 'day', noCL);
  assert.equal(b.length, 7);
  assert.equal(b[0].nw, 130);
  assert.equal(b[6].nw, 190);
  assert.equal(b[0].change, 10); // 130 − 120（前一日仍在全序列內）
  assert.equal(b[6].change, 10);
});

test('單一年份 → change 為期間內漲幅，不得為 0 (SPEC I3 迴歸)', () => {
  const snaps = [
    { date: '2026-01-05', netWorth: 6000000 },
    { date: '2026-06-30', netWorth: 7500000 },
    { date: '2026-12-28', netWorth: 9000000 },
  ];
  const b = C.netWorthBuckets(snaps, 'year', noCL);
  assert.equal(b.length, 1);
  assert.equal(b[0].nw, 9000000);          // 期末（同桶取最後一筆）
  assert.notEqual(b[0].change, 0);
  assert.equal(b[0].change, 3000000);      // 期末 − 期初 = 9,000,000 − 6,000,000
});

test('多年份 → 首年用期間內漲幅、其後對前一年期末', () => {
  const snaps = [
    { date: '2024-01-10', netWorth: 1000000 },
    { date: '2024-12-20', netWorth: 2000000 },
    { date: '2025-12-20', netWorth: 3500000 },
  ];
  const b = C.netWorthBuckets(snaps, 'year', noCL);
  assert.equal(b.length, 2);
  assert.deepEqual(b.map(x => x.nw), [2000000, 3500000]);
  assert.equal(b[0].change, 1000000); // 首年：2,000,000 − 1,000,000（期末−期初）
  assert.equal(b[1].change, 1500000); // 次年：3,500,000 − 2,000,000（對前一年期末）
});

test('month：以 YYYY-MM 分桶、同桶取最後一筆', () => {
  const snaps = [
    { date: '2026-05-10', netWorth: 100 },
    { date: '2026-05-28', netWorth: 150 }, // 5 月最後
    { date: '2026-06-15', netWorth: 200 }, // 6 月最後
    { date: '2026-07-02', netWorth: 260 }, // 7 月最後
  ];
  const b = C.netWorthBuckets(snaps, 'month', noCL);
  assert.deepEqual(b.map(x => x.nw), [150, 200, 260]);
  assert.deepEqual(b.map(x => x.change), [50, 50, 60]); // 首月 intra 150−100
});

test('week：同一週取最後一筆、跨週分開', () => {
  const snaps = [
    { date: '2026-07-01', netWorth: 100 },
    { date: '2026-07-02', netWorth: 130 }, // 與 07-01 同週 → 週值 130
    { date: '2026-07-10', netWorth: 160 }, // 下一週
  ];
  const b = C.netWorthBuckets(snaps, 'week', noCL);
  assert.equal(b.length, 2);
  assert.deepEqual(b.map(x => x.nw), [130, 160]);
  assert.deepEqual(b.map(x => x.change), [30, 30]);
});

test('視窗上限：day=7 / week=5 / month=12 / year=10', () => {
  const many = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(Date.UTC(2020, 0, 1 + i * 20)); // 每 20 天一筆，橫跨多年多月多週
    return { date: d.toISOString().slice(0, 10), netWorth: 1000 + i };
  });
  assert.ok(C.netWorthBuckets(many, 'day', noCL).length <= 7);
  assert.ok(C.netWorthBuckets(many, 'week', noCL).length <= 5);
  assert.ok(C.netWorthBuckets(many, 'month', noCL).length <= 12);
  assert.ok(C.netWorthBuckets(many, 'year', noCL).length <= 10);
});
