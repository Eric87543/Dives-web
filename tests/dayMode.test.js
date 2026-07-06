/* 當日漲跌計算方式：native(各市場當日) vs twday(台股日，美股白天算 0) */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const C = App.Calc, S = App.Store, U = App.Util;

beforeEach(() => { resetStore(); S.setDayMode('native'); });

function setup() {
  S.setFxRate(30);
  S.upsertMeta([{ code: '2330', name: '台積電', market: 'tse' }, { code: 'TSLA', name: 'Tesla', market: 'us' }]);
  C.addTransaction({ symbolInput: '2330', type: 'BUY', shares: 100, price: 500, fee: 0, market: 'tse', name: '台積電' });
  C.addTransaction({ symbolInput: 'TSLA', type: 'BUY', shares: 10, price: 300, fee: 0, market: 'us', name: 'Tesla' });
  S.setPrices({ '2330': { price: 520, dailyChange: 5, prevClose: 515 }, TSLA: { price: 310, dailyChange: 2, prevClose: 308 } });
}

test('native：當日漲跌含美股（各市場當日相加）', () => {
  setup();
  S.setDayMode('native');
  const s = C.buildSummary(C.buildPositions());
  assert.equal(Math.round(s.twDayPnl), 500);          // 5 × 100
  assert.equal(Math.round(s.usDayPnlTwd), 600);        // 2 × 10 × 30
  assert.equal(Math.round(s.dayPnl), 1100);
});

test('twday + 美股未開盤 → 美股當日=0，台股照算', () => {
  setup();
  const orig = U.usCountsTowardToday;
  U.usCountsTowardToday = () => false;
  try {
    S.setDayMode('twday');
    const s = C.buildSummary(C.buildPositions());
    assert.equal(Math.round(s.usDayPnlTwd), 0);
    assert.equal(Math.round(s.twDayPnl), 500);
    assert.equal(Math.round(s.dayPnl), 500);
  } finally { U.usCountsTowardToday = orig; }
});

test('twday + 美股盤中 → 美股當日照算', () => {
  setup();
  const orig = U.usCountsTowardToday;
  U.usCountsTowardToday = () => true;
  try {
    S.setDayMode('twday');
    const s = C.buildSummary(C.buildPositions());
    assert.equal(Math.round(s.usDayPnlTwd), 600);
    assert.equal(Math.round(s.dayPnl), 1100);
  } finally { U.usCountsTowardToday = orig; }
});
