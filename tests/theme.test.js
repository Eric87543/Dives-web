/* 深色模式（v134）：主題偏好 auto|light|dark，預設 auto(跟隨系統)。 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const S = App.Store;

beforeEach(() => resetStore());

test('getTheme：預設 auto', () => {
  assert.equal(S.getTheme(), 'auto');
});

test('setTheme/getTheme：light、dark、auto 往返', () => {
  S.setTheme('dark');
  assert.equal(S.getTheme(), 'dark');
  S.setTheme('light');
  assert.equal(S.getTheme(), 'light');
  S.setTheme('auto');
  assert.equal(S.getTheme(), 'auto');
});

test('getTheme：無效值回退 auto', () => {
  localStorage.setItem('dives_theme', 'neon');
  assert.equal(S.getTheme(), 'auto');
});
