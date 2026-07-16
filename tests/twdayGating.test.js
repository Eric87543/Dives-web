/* 台股日(twday)模式的當日漲跌時段切分：
 *   台股當日：09:00(台股開盤) 起算，至 美股開盤 歸零
 *   美股當日：美股開盤 起算，至 隔日 09:00(台股開盤) 歸零
 *   → 任一時刻只有一個市場「計入今日」，彼此以對方開盤為歸零點。
 * 以 usOpenMin=1290(21:30，夏令) 注入避免依賴真實 DST。 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { App } = require('./harness');
const U = App.Util;
const US_OPEN = 21 * 60 + 30; // 1290
const P = (weekday, hour, minute = 0) => ({ weekday, hour, minute });

test('台股：平日盤中 10:00 → 計入', () => {
  assert.equal(U.twCountsTowardToday(P('Mon', 10), US_OPEN), true);
});

test('台股：平日開盤前 08:00 → 不計入(歸零)', () => {
  assert.equal(U.twCountsTowardToday(P('Mon', 8), US_OPEN), false);
});

test('台股：美股開盤 21:30 起歸零(新規則)', () => {
  assert.equal(U.twCountsTowardToday(P('Mon', 21, 30), US_OPEN), false);
});

test('台股：美股開盤後 22:00 仍歸零', () => {
  assert.equal(U.twCountsTowardToday(P('Mon', 22), US_OPEN), false);
});

test('台股：週末 → 不計入', () => {
  assert.equal(U.twCountsTowardToday(P('Sat', 10), US_OPEN), false);
});

test('美股：台股盤中 10:00 → 不計入(歸零)', () => {
  assert.equal(U.usCountsTowardToday(P('Mon', 10), US_OPEN), false);
});

test('美股：開盤後 22:00 → 計入', () => {
  assert.equal(U.usCountsTowardToday(P('Mon', 22), US_OPEN), true);
});

test('美股：凌晨 08:00(台股開盤前) → 計入(隔夜盤歸今日)', () => {
  assert.equal(U.usCountsTowardToday(P('Mon', 8), US_OPEN), true);
});

test('切分不變式：平日任一時刻只有一個市場計入今日', () => {
  for (const h of [0, 8, 9, 10, 13, 20, 21, 22, 23]) {
    const m = h === 21 ? 30 : 0; // 涵蓋美股開盤點
    const tw = U.twCountsTowardToday(P('Mon', h, m), US_OPEN);
    const us = U.usCountsTowardToday(P('Mon', h, m), US_OPEN);
    assert.notEqual(tw, us, `weekday ${h}:${m} 應恰好一個計入 (tw=${tw}, us=${us})`);
  }
});
