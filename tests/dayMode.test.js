/* 當日漲跌計算方式：native(各市場當日) vs twday(台股日：台股 09:00 起算、美股白天算 0) */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store, U = App.Util;

beforeEach(() => { resetStore(); S.setDayMode('native'); });

function setup() {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }, { code: 'TSLA', name: 'Tesla', market: 'us' }]);
  // 昨日買入：本檔測 gating 語意；今日買入的當日損益調整由 dayPnl.test.js 涵蓋
  const YESTERDAY = Date.now() - 2 * 86400000;
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電', time: YESTERDAY });
  C.addTransaction({ symbolInput: 'TSLA', type: 'BUY', shares: 10, price: 300, fee: 0, market: 'us', name: 'Tesla', time: YESTERDAY });
  S.setPrices({ '2330': { price: 520, dailyChange: 5, prevClose: 515 }, TSLA: { price: 310, dailyChange: 2, prevClose: 308 } });
}

// 以固定的市場開盤狀態執行 fn（避免依賴真實時間）
function withMarkets(us, tw, fn) {
  const ou = U.usCountsTowardToday, ot = U.twCountsTowardToday;
  U.usCountsTowardToday = () => us; U.twCountsTowardToday = () => tw;
  try { return fn(); } finally { U.usCountsTowardToday = ou; U.twCountsTowardToday = ot; }
}

test('native：當日漲跌含美股（各市場當日相加），不受開盤狀態影響', () => {
  setup();
  S.setDayMode('native');
  const s = withMarkets(false, false, () => C.buildSummary(C.buildPositions())); // native 應忽略 gating
  assert.equal(Math.round(s.twDayPnl), 500);          // 5 × 100
  assert.equal(Math.round(s.usDayPnlTwd), 600);        // 2 × 10 × 30
  assert.equal(Math.round(s.dayPnl), 1100);
});

test('twday + 美股未開盤 + 台股盤中 → 美股當日=0、台股照算', () => {
  setup();
  S.setDayMode('twday');
  const s = withMarkets(false, true, () => C.buildSummary(C.buildPositions()));
  assert.equal(Math.round(s.usDayPnlTwd), 0);
  assert.equal(Math.round(s.twDayPnl), 500);
  assert.equal(Math.round(s.dayPnl), 500);
});

test('twday + 美股盤中 + 台股盤中 → 兩者照算', () => {
  setup();
  S.setDayMode('twday');
  const s = withMarkets(true, true, () => C.buildSummary(C.buildPositions()));
  assert.equal(Math.round(s.usDayPnlTwd), 600);
  assert.equal(Math.round(s.twDayPnl), 500);
  assert.equal(Math.round(s.dayPnl), 1100);
});

test('twday + 台股開盤前/週末 → 台股當日=0（不顯示前一交易日漲跌）', () => {
  setup();
  S.setDayMode('twday');
  const s = withMarkets(false, false, () => C.buildSummary(C.buildPositions()));
  assert.equal(Math.round(s.twDayPnl), 0);
  assert.equal(Math.round(s.usDayPnlTwd), 0);
  assert.equal(Math.round(s.dayPnl), 0);
});

test('twday + 台股盤前但美股仍在盤 → 台股=0、美股照算（凌晨情境）', () => {
  setup();
  S.setDayMode('twday');
  const s = withMarkets(true, false, () => C.buildSummary(C.buildPositions()));
  assert.equal(Math.round(s.twDayPnl), 0);
  assert.equal(Math.round(s.usDayPnlTwd), 600);
  assert.equal(Math.round(s.dayPnl), 600);
});

test('twCountsTowardToday：平日 09:00 後 true；盤前/週末 false', () => {
  assert.equal(U.twCountsTowardToday({ weekday: 'Mon', hour: 8, minute: 59 }), false); // 開盤前
  assert.equal(U.twCountsTowardToday({ weekday: 'Mon', hour: 9, minute: 0 }), true);   // 開盤
  assert.equal(U.twCountsTowardToday({ weekday: 'Wed', hour: 13, minute: 40 }), true); // 收盤後同日
  assert.equal(U.twCountsTowardToday({ weekday: 'Fri', hour: 22, minute: 0 }), true);  // 平日晚上
  assert.equal(U.twCountsTowardToday({ weekday: 'Sat', hour: 10, minute: 0 }), false); // 週六
  assert.equal(U.twCountsTowardToday({ weekday: 'Sun', hour: 11, minute: 0 }), false); // 週日
});
