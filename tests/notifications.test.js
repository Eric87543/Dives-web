/* notifications — 通知中心(推播/去重/上限/已讀) + 自動匯入台股股利設定 */
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { App, resetStore } = require('./harness');
const S = App.Store;

beforeEach(() => resetStore());

test('pushNotification：新增未讀通知、unreadNotifCount、markRead', () => {
  assert.deepEqual(S.getNotifications(), []);
  assert.equal(S.pushNotification({ type: 'div', title: '2330 股息入帳', body: 'NT$ 6,000' }), true);
  assert.equal(S.getNotifications().length, 1);
  assert.equal(S.unreadNotifCount(), 1);
  S.markNotificationsRead();
  assert.equal(S.unreadNotifCount(), 0);
  assert.equal(S.getNotifications().length, 1); // 已讀仍保留
});

test('pushNotification：key 重複 → 去重不新增', () => {
  assert.equal(S.pushNotification({ type: 'exdiv', key: 'exdiv:2330:2026-08-14', title: 'A' }), true);
  assert.equal(S.pushNotification({ type: 'exdiv', key: 'exdiv:2330:2026-08-14', title: 'A again' }), false);
  assert.equal(S.getNotifications().length, 1);
});

test('pushNotification：最多保留 50 則（新的在前）', () => {
  for (let i = 0; i < 55; i++) S.pushNotification({ type: 'info', title: 'n' + i });
  const list = S.getNotifications();
  assert.equal(list.length, 50);
  assert.equal(list[0].title, 'n54'); // 最新在最前
});

test('自動匯入台股股利：預設開啟、可關閉再開啟；入帳帳戶可設可清', () => {
  assert.equal(S.getAutoDivImport(), true);   // 預設 ON
  S.setAutoDivImport(false);
  assert.equal(S.getAutoDivImport(), false);
  S.setAutoDivImport(true);
  assert.equal(S.getAutoDivImport(), true);
  assert.equal(S.getAutoDivAcct(), '');
  S.setAutoDivAcct('acct-1');
  assert.equal(S.getAutoDivAcct(), 'acct-1');
  S.setAutoDivAcct('');
  assert.equal(S.getAutoDivAcct(), '');
});

test('clearAll：一併清空通知', () => {
  S.pushNotification({ type: 'info', title: 'x' });
  S.clearAll();
  assert.deepEqual(S.getNotifications(), []);
});

test('自動匯入美股股利設定：預設開啟、帳戶、稅率預設 30 且夾在 0–100', () => {
  assert.equal(S.getAutoDivUs(), true);
  S.setAutoDivUs(false);
  assert.equal(S.getAutoDivUs(), false);
  S.setAutoDivUs(true);
  assert.equal(S.getAutoDivAcctUs(), '');
  S.setAutoDivAcctUs('usd-1');
  assert.equal(S.getAutoDivAcctUs(), 'usd-1');
  assert.equal(S.getAutoDivUsTax(), 30);        // 預設 30%
  S.setAutoDivUsTax(15);
  assert.equal(S.getAutoDivUsTax(), 15);
  S.setAutoDivUsTax(0);
  assert.equal(S.getAutoDivUsTax(), 0);          // 0 合法(記稅前全額)
  localStorage.setItem('dives_auto_div_us_tax', '999'); // 異常值 → 回預設
  assert.equal(S.getAutoDivUsTax(), 30);
});
