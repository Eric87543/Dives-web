/* =========================================================================
 * store.js (v2) — 淨資產管理資料層（localStorage，key 前綴 d2_）
 * 帳戶模型:類別 + 種類 + 餘額 / 持股
 * ======================================================================= */
window.App = window.App || {};

App.Store = (function () {
  const K = {
    accounts: 'd2_accounts',
    snapshots: 'd2_snapshots',
    prices: 'd2_prices', pricesTs: 'd2_prices_ts',
    fxRate: 'd2_fx', fxTs: 'd2_fx_ts',
    twUniverse: 'd2_tw_universe', twUniverseTs: 'd2_tw_universe_ts',
    proxy: 'd2_proxy', hide: 'd2_hide',
  };

  // 類別定義（順序即顯示順序）
  const CATS = [
    { key: 'liquid', label: '流動資金', color: '#34C759', asset: true },
    { key: 'investment', label: '投資', color: '#7C6CF0', asset: true },
    { key: 'fixed', label: '固定資產', color: '#3B5BDB', asset: true },
    { key: 'receivable', label: '應收款', color: '#9DA9F5', asset: true },
    { key: 'liability', label: '負債', color: '#C7D0F7', asset: false },
  ];
  function cat(key) { return CATS.find(c => c.key === key) || CATS[0]; }

  function read(k, f) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : f; } catch (e) { return f; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxxxxxx4xxxyxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }

  // ---- Accounts ----
  // {id,name,category,kind,currency('TWD'|'USD'),balance,symbol,shares,costBasis,group,exclude,updatedAt}
  function getAccounts() { return read(K.accounts, []); }
  function setAccounts(a) { write(K.accounts, a); }
  function addAccount(acc) {
    const list = getAccounts();
    acc.id = uuid(); acc.updatedAt = Date.now();
    list.push(acc); setAccounts(list); return acc;
  }
  function updateAccount(id, patch) {
    const list = getAccounts();
    const a = list.find(x => x.id === id); if (!a) return;
    Object.assign(a, patch); a.updatedAt = Date.now(); setAccounts(list);
  }
  function deleteAccount(id) { setAccounts(getAccounts().filter(a => a.id !== id)); }

  // ---- Snapshots（每日淨資產快照，供統計圖）----
  function getSnapshots() { return read(K.snapshots, []); }
  function setSnapshots(s) { write(K.snapshots, s); }

  // ---- Prices / FX ----
  function getPrices() { return read(K.prices, {}); }
  function setPrices(p) { write(K.prices, p); localStorage.setItem(K.pricesTs, String(Date.now())); }
  function getPricesTs() { return +localStorage.getItem(K.pricesTs) || null; }
  function getFxRate() { return read(K.fxRate, null); }
  function setFxRate(r) { write(K.fxRate, r); localStorage.setItem(K.fxTs, String(Date.now())); }
  function getFxTs() { return +localStorage.getItem(K.fxTs) || null; }

  function getTwUniverse() { return read(K.twUniverse, null); }
  function setTwUniverse(u) { write(K.twUniverse, u); localStorage.setItem(K.twUniverseTs, App.Util.isoDate()); }
  function twUniverseFresh() { return localStorage.getItem(K.twUniverseTs) === App.Util.isoDate(); }

  function getProxy() { return localStorage.getItem(K.proxy) || 'https://corsproxy.io/?url='; }
  function setProxy(p) { localStorage.setItem(K.proxy, p || ''); }

  function getHide() { return localStorage.getItem(K.hide) === '1'; }
  function setHide(v) { localStorage.setItem(K.hide, v ? '1' : '0'); }

  function clearAll() { setAccounts([]); setSnapshots([]); setPrices({}); }

  return {
    CATS, cat, uuid,
    getAccounts, setAccounts, addAccount, updateAccount, deleteAccount,
    getSnapshots, setSnapshots,
    getPrices, setPrices, getPricesTs, getFxRate, setFxRate, getFxTs,
    getTwUniverse, setTwUniverse, twUniverseFresh,
    getProxy, setProxy, getHide, setHide, clearAll,
  };
})();
