/* 台股日(twday)模式的當日漲跌歸零時點：
 *   台股當日：09:00(台股開盤)起算，一路顯示到「隔天 09:00 台股開盤」才重置。
 *            → 傍晚美股開盤不歸零；夜間/凌晨(隔天 09:00 前)仍顯示當日。
 *   美股當日：美股開盤起算，至 隔日 09:00(台股開盤) 歸零。
 *   兩者皆錨定台股開盤 09:00；09:00 前仍屬「前一個台股日」。
 * 美股測試以 usOpenMin=1290(21:30，夏令) 注入避免依賴真實 DST。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { App } = require('./harness');
const U = App.Util;
const US_OPEN = 21 * 60 + 30; // 1290
const P = (weekday, hour, minute = 0) => ({ weekday, hour, minute });

// ---- 台股：09:00 → 隔天 09:00 持續顯示 ----
test('台股：平日盤中 10:00 → 顯示', () => {
  assert.equal(U.twCountsTowardToday(P('Mon', 10)), true);
});

test('台股：美股開盤後 22:00 仍顯示(不因美股開盤歸零)', () => {
  assert.equal(U.twCountsTowardToday(P('Mon', 22)), true);
});

test('台股：隔天凌晨 02:00(前一日為平日) 仍顯示當日', () => {
  assert.equal(U.twCountsTowardToday(P('Tue', 2)), true);
});

test('台股：隔天開盤前 08:59(前一日為平日) 仍顯示', () => {
  assert.equal(U.twCountsTowardToday(P('Tue', 8, 59)), true);
});

test('台股：週一開盤前 08:00(前一日為週日) → 歸零(避免顯示上週五)', () => {
  assert.equal(U.twCountsTowardToday(P('Mon', 8)), false);
});

test('台股：週六白天 10:00 → 歸零', () => {
  assert.equal(U.twCountsTowardToday(P('Sat', 10)), false);
});

test('台股：週日白天 11:00 → 歸零', () => {
  assert.equal(U.twCountsTowardToday(P('Sun', 11)), false);
});

test('台股：週六凌晨 02:00(前一日為週五) → 顯示(週五夜盤延續)', () => {
  assert.equal(U.twCountsTowardToday(P('Sat', 2)), true);
});

// ---- 美股：以台股開盤 09:00 歸零(維持原行為) ----
test('美股：台股盤中 10:00 → 歸零', () => {
  assert.equal(U.usCountsTowardToday(P('Mon', 10), US_OPEN), false);
});

test('美股：開盤後 22:00 → 顯示', () => {
  assert.equal(U.usCountsTowardToday(P('Mon', 22), US_OPEN), true);
});

test('美股：凌晨 08:00(台股開盤前) → 顯示(隔夜盤歸今日)', () => {
  assert.equal(U.usCountsTowardToday(P('Mon', 8), US_OPEN), true);
});
