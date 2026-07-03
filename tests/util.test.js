/* util.js — 純工具函式（市場判斷、格式化、日期）。SPEC §2 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { App } = require('./harness');
const U = App.Util;

test('normalizeMarketKey 正規化各種別名', () => {
  assert.equal(U.normalizeMarketKey('TWSE'), 'tse');
  assert.equal(U.normalizeMarketKey('上市'), 'tse');
  assert.equal(U.normalizeMarketKey('tpex'), 'otc');
  assert.equal(U.normalizeMarketKey('興櫃'), 'rotc');
  assert.equal(U.normalizeMarketKey('美股'), 'us');
  assert.equal(U.normalizeMarketKey('虛擬貨幣'), 'crypto');
  assert.equal(U.normalizeMarketKey('coin'), 'crypto');
  assert.equal(U.normalizeMarketKey('???'), 'unknown');
  assert.equal(U.normalizeMarketKey(''), 'unknown');
  assert.equal(U.normalizeMarketKey(null), 'unknown');
});

test('guessMarketBySymbol：純數字台股 / 美股字母 / 台股 ETF (SPEC I5)', () => {
  assert.equal(U.guessMarketBySymbol('2330'), 'tse');
  assert.equal(U.guessMarketBySymbol('0050'), 'tse');
  assert.equal(U.guessMarketBySymbol('AAPL'), 'us');
  assert.equal(U.guessMarketBySymbol('TSLA'), 'us');
  assert.equal(U.guessMarketBySymbol('00679B'), 'tse'); // 4+位數字 + 恰1字母 = 台股
  assert.equal(U.guessMarketBySymbol('123'), 'unknown'); // 太短
});

test('sanitizeSymbol：去後綴、大寫、短數字補零至 4 碼', () => {
  assert.equal(U.sanitizeSymbol('2330.TW'), '2330');
  assert.equal(U.sanitizeSymbol('aapl'), 'AAPL');
  assert.equal(U.sanitizeSymbol('50'), '0050');
  assert.equal(U.sanitizeSymbol('  6  '), '0006');
  // 取第一段（whitespace 切分）後，非 A-Z0-9.- 的字元被清除；純中文 → 空字串
  assert.equal(U.sanitizeSymbol('台積電 2330'), '');
});

test('canonicalizeTwCode：去 .TW / TSE_ 前後綴並補零', () => {
  assert.equal(U.canonicalizeTwCode('2330.TW'), '2330');
  assert.equal(U.canonicalizeTwCode('TSE_2330'), '2330');
  assert.equal(U.canonicalizeTwCode('OTC_6488'), '6488');
  assert.equal(U.canonicalizeTwCode('6'), '0006');
});

test('fmtKMBB：萬 / 億 縮寫', () => {
  assert.equal(U.fmtKMBB(0), '0');
  assert.equal(U.fmtKMBB(5000), '5,000');
  assert.equal(U.fmtKMBB(12345), '1.2萬');
  assert.equal(U.fmtKMBB(123456789), '1.23億');
  assert.equal(U.fmtKMBB(-12345), '-1.2萬');
});

test('fmtBannerSigned：帶正負號', () => {
  assert.equal(U.fmtBannerSigned(0), '+0');
  assert.equal(U.fmtBannerSigned(12345), '+1.2萬');
  assert.equal(U.fmtBannerSigned(-12345), '-1.2萬');
});

test('fmtPct：兩位小數帶號，非數字回 --', () => {
  assert.equal(U.fmtPct(1.234), '+1.23%');
  assert.equal(U.fmtPct(-5), '-5.00%');
  assert.equal(U.fmtPct(NaN), '--');
  assert.equal(U.fmtPct(null), '--');
});

test('parseNum：處理逗號，拒絕空/破折號/非正數', () => {
  assert.equal(U.parseNum('1,234.5'), 1234.5);
  assert.equal(U.parseNum('  88 '), 88);
  assert.equal(U.parseNum(''), null);
  assert.equal(U.parseNum('-'), null);
  assert.equal(U.parseNum('0'), null);   // > 0 才算有效
  assert.equal(U.parseNum('abc'), null);
});

test('isoDate：台北時區 YYYY-MM-DD', () => {
  // 2026-07-03 08:00Z → 台北 16:00 同日
  assert.equal(U.isoDate(new Date('2026-07-03T08:00:00Z')), '2026-07-03');
  // 2026-07-03 17:00Z → 台北 01:00 隔日
  assert.equal(U.isoDate(new Date('2026-07-03T17:00:00Z')), '2026-07-04');
});

test('taipeiParts：拆出台北年月日時分', () => {
  const p = U.taipeiParts(new Date('2026-07-03T02:30:00Z')); // 台北 10:30
  assert.equal(p.year, 2026);
  assert.equal(p.month, 7);
  assert.equal(p.day, 3);
  assert.equal(p.hour, 10);
  assert.equal(p.minute, 30);
});
