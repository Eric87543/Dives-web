/* =========================================================================
 * store.js — 本機資料持久層（localStorage），取代 iOS 的 SwiftData
 * 實體：transactions / meta / realized / snapshots / account / pricesCache
 * ======================================================================= */
window.App = window.App || {};

App.Store = (function () {
  const K = {
    tx: 'dives_transactions',
    meta: 'dives_meta',
    realized: 'dives_realized',
    snapshots: 'dives_snapshots',
    account: 'dives_account',
    prices: 'dives_prices_cache',
    pricesTs: 'dives_prices_ts',
    fxRate: 'dives_fx_rate',
    fxTs: 'dives_fx_ts',
    twUniverse: 'dives_tw_universe',
    twUniverseTs: 'dives_tw_universe_ts',
    proxy: 'dives_cors_proxy',
    cash: 'dives_cash_accounts',
    liab: 'dives_liabilities',
    groups: 'dives_groups',
    groupMap: 'dives_group_map',
    recurring: 'dives_recurring',
    dividends: 'dives_dividends',
    pctBasis: 'dives_pct_basis',
    dayMode: 'dives_day_mode',
    privacy: 'dives_privacy',
    chartRange: 'dives_chart_range',
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  // ---- Transactions ----  {id, symbol, type, shares, price, fee, time(ms)}
  function getTransactions() { return read(K.tx, []); }
  function setTransactions(arr) { write(K.tx, arr); }

  // ---- Meta ----  {code, name, market}
  function getMeta() { return read(K.meta, []); }
  function setMeta(arr) { write(K.meta, arr); }
  function metaMap() {
    const m = {};
    for (const x of getMeta()) m[x.code] = x;
    return m;
  }
  function upsertMeta(list) {
    const map = metaMap();
    for (const it of list) {
      if (map[it.code]) { map[it.code].name = it.name; map[it.code].market = it.market; }
      else map[it.code] = { code: it.code, name: it.name, market: it.market };
    }
    setMeta(Object.values(map));
  }
  // 自訂顯示名稱（存於 meta.alias；留空＝清除，回到市場預設）
  function setAlias(code, alias) {
    const map = metaMap();
    if (map[code]) { if (alias) map[code].alias = alias; else delete map[code].alias; }
    else if (alias) map[code] = { code, name: code, market: '', alias };
    else return;
    setMeta(Object.values(map));
  }

  // ---- Realized ----  {id, symbol, shares, sellPrice, avgCost, realizedPnl, time(ms)}
  function getRealized() { return read(K.realized, []); }
  function setRealized(arr) { write(K.realized, arr); }

  // ---- Snapshots ----  {date 'YYYY-MM-DD', ...metrics}
  function getSnapshots() { return read(K.snapshots, []); }
  function setSnapshots(arr) { write(K.snapshots, arr); }

  // ---- Account ----  {initialCash: number|null}
  function getAccount() { return read(K.account, { initialCash: null }); }
  function setAccount(a) { write(K.account, a); }

  // ---- Prices cache ----  {code: {price, dailyChange, prevClose}}
  function getPrices() { return read(K.prices, {}); }
  function setPrices(p) { write(K.prices, p); localStorage.setItem(K.pricesTs, String(Date.now())); }
  function getPricesTs() { const t = +localStorage.getItem(K.pricesTs); return t || null; }

  // ---- FX ----
  function getFxRate() { return read(K.fxRate, null); }
  function setFxRate(r) { write(K.fxRate, r); localStorage.setItem(K.fxTs, String(Date.now())); }
  function getFxTs() { const t = +localStorage.getItem(K.fxTs); return t || null; }

  // ---- TW universe（代碼→{name,market,price,change}）----
  function getTwUniverse() { return read(K.twUniverse, null); }
  function setTwUniverse(u) { write(K.twUniverse, u); localStorage.setItem(K.twUniverseTs, App.Util.isoDate()); }
  function twUniverseFresh() { return localStorage.getItem(K.twUniverseTs) === App.Util.isoDate(); }

  // ---- CORS proxy ----
  function getProxy() {
    return localStorage.getItem(K.proxy) || 'https://corsproxy.io/?url=';
  }
  function setProxy(p) { localStorage.setItem(K.proxy, p || ''); }

  // ---- 現金帳戶 ----  {id, name, currency('TWD'|'USD'), balance}
  function getCashAccounts() { return read(K.cash, []); }
  function setCashAccounts(a) { write(K.cash, a); }
  function adjustCashBalance(id, delta) {
    const list = getCashAccounts();
    const a = list.find(x => x.id === id);
    if (!a) return false;
    a.balance = (a.balance || 0) + delta;
    setCashAccounts(list);
    return true;
  }

  // ---- 負債 ----  {id, name, currency, balance}
  function getLiabilities() { return read(K.liab, []); }
  function setLiabilities(a) { write(K.liab, a); }

  // ---- 股利帳本 ----  {id, symbol, market, amount(淨額,原幣別), date, accountId?, note?, createdAt}
  function getDividends() { return read(K.dividends, []); }
  function setDividends(a) { write(K.dividends, a); }

  // ---- 定期定額 / 定期繳款計畫 ----
  // {id, kind:'dca'|'liability', enabled, freq:'monthly'|'biweekly'|'weekly', day,
  //  startDate, endDate|null, lastRun|null, createdAt,
  //  dca: symbol,market,name,amount,priceBasis:'close'|'open',accountId,feeMode,feeVal
  //  liability: liabilityId,amount,accountId}
  function getRecurringPlans() { return read(K.recurring, []); }
  function setRecurringPlans(a) { write(K.recurring, a); }

  // ---- 投資群組（一層）----  groups: [{id, name}]；groupMap: {symbol: groupId}
  function getGroups() { return read(K.groups, []); }
  function setGroups(g) { write(K.groups, g); }
  function getGroupMap() { return read(K.groupMap, {}); }
  function setGroupMap(m) { write(K.groupMap, m); }

  // ---- 佔比基準：'group' | 'invest' | 'net' ----
  function getPctBasis() { return localStorage.getItem(K.pctBasis) || 'invest'; }
  function setPctBasis(b) { localStorage.setItem(K.pctBasis, b); }
  // 當日漲跌計算方式：native=各市場當日(預設) | twday=以台股開盤起算(美股凌晨算昨天)
  function getDayMode() { return localStorage.getItem(K.dayMode) === 'twday' ? 'twday' : 'native'; }
  function setDayMode(m) { localStorage.setItem(K.dayMode, m === 'twday' ? 'twday' : 'native'); }
  // ---- 隱藏金額（本機偏好，不上雲同步）----
  function getPrivacy() { return localStorage.getItem(K.privacy) === '1'; }
  function setPrivacy(v) { localStorage.setItem(K.privacy, v ? '1' : '0'); }
  // ---- 走勢圖時間區間（所有走勢圖共用、持久化；本機偏好，不上雲）----
  function getChartRange() { const r = read(K.chartRange, null); return { range: (r && r.range) || 'all', from: (r && r.from) || null, to: (r && r.to) || null }; }
  function setChartRange(r) { write(K.chartRange, { range: (r && r.range) || 'all', from: (r && r.from) || null, to: (r && r.to) || null }); }

  // ---- 清空所有資料（同步清除快照與資產頁資料）----
  function clearAll() {
    setTransactions([]);
    setRealized([]);
    setSnapshots([]);
    setAccount({ initialCash: null });
    setPrices({});
    setCashAccounts([]);
    setLiabilities([]);
    setGroups([]);
    setGroupMap({});
    setRecurringPlans([]);
    setDividends([]);
  }

  return {
    uuid,
    getTransactions, setTransactions,
    getMeta, setMeta, metaMap, upsertMeta, setAlias,
    getRealized, setRealized,
    getSnapshots, setSnapshots,
    getAccount, setAccount,
    getPrices, setPrices, getPricesTs,
    getFxRate, setFxRate, getFxTs,
    getTwUniverse, setTwUniverse, twUniverseFresh,
    getProxy, setProxy,
    getCashAccounts, setCashAccounts, adjustCashBalance,
    getLiabilities, setLiabilities,
    getRecurringPlans, setRecurringPlans,
    getDividends, setDividends,
    getGroups, setGroups, getGroupMap, setGroupMap,
    getPctBasis, setPctBasis, getDayMode, setDayMode,
    getPrivacy, setPrivacy, getChartRange, setChartRange,
    clearAll,
  };
})();
