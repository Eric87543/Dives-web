/* =========================================================================
 * calc.js (v2) — 帳戶估值、類別小計、淨資產、每日快照
 * ======================================================================= */
window.App = window.App || {};

App.Calc = (function () {
  const U = App.Util, S = App.Store;

  function isUsStock(acc) {
    return U.normalizeMarketKey(acc.market || U.guessMarketBySymbol(acc.symbol)) === U.Market.us;
  }

  // 單一帳戶市值（台幣）
  function accountValueTwd(acc, prices, fx) {
    prices = prices || S.getPrices(); fx = fx || S.getFxRate() || 31.5;
    if (acc.kind === 'stock') {
      const shares = acc.shares || 0;
      const pd = prices[acc.symbol];
      const px = pd && pd.price != null ? pd.price : (acc.lastPrice != null ? acc.lastPrice : (acc.costBasis || 0));
      const native = px * shares;
      return isUsStock(acc) ? native * fx : native;
    }
    const bal = acc.balance || 0;
    return acc.currency === 'USD' ? bal * fx : bal;
  }

  // 帳戶原幣顯示金額（供列表）
  function accountNativeValue(acc, prices) {
    prices = prices || S.getPrices();
    if (acc.kind === 'stock') {
      const shares = acc.shares || 0;
      const pd = prices[acc.symbol];
      const px = pd && pd.price != null ? pd.price : (acc.lastPrice != null ? acc.lastPrice : (acc.costBasis || 0));
      return px * shares;
    }
    return acc.balance || 0;
  }

  // 類別小計（台幣）
  function categoryTotal(catKey, prices, fx) {
    return S.getAccounts().filter(a => a.category === catKey && !a.exclude)
      .reduce((s, a) => s + accountValueTwd(a, prices, fx), 0);
  }

  // 淨資產 = 資產 − 負債
  function netWorth(prices, fx) {
    let assets = 0, liab = 0;
    for (const c of S.CATS) {
      const t = categoryTotal(c.key, prices, fx);
      if (c.asset) assets += t; else liab += t;
    }
    return assets - liab;
  }

  function summary(prices, fx) {
    const byCat = {};
    for (const c of S.CATS) byCat[c.key] = categoryTotal(c.key, prices, fx);
    const assets = S.CATS.filter(c => c.asset).reduce((s, c) => s + byCat[c.key], 0);
    const liab = byCat.liability || 0;
    return { byCat, assets, liab, netWorth: assets - liab };
  }

  // 每日快照（覆蓋同日）
  function saveTodaySnapshot() {
    const s = summary();
    const date = U.isoDate();
    const snap = { date, netWorth: s.netWorth, assets: s.assets, liab: s.liab, byCat: s.byCat, createdAt: Date.now() };
    const all = S.getSnapshots();
    const isNew = !all.some(x => x.date === date);
    const rest = all.filter(x => x.date !== date);
    rest.push(snap); rest.sort((a, b) => a.date < b.date ? -1 : 1);
    S.setSnapshots(rest);
    return isNew;
  }

  return { isUsStock, accountValueTwd, accountNativeValue, categoryTotal, netWorth, summary, saveTodaySnapshot };
})();
