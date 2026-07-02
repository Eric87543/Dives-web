/* =========================================================================
 * api.js (v2) — 報價/匯率/搜尋（沿用 FinMind/MIS/Finnhub，對股票帳戶）
 * ======================================================================= */
window.App = window.App || {};

App.Api = (function () {
  const U = App.Util, S = App.Store;

  const FINNHUB_KEY_DEFAULT = 'd663kahr01qssgeccncgd663kahr01qssgeccnd0';
  function finnhubKey() { return localStorage.getItem('d2_finnhub_key') || FINNHUB_KEY_DEFAULT; }
  const FINMIND = 'https://api.finmindtrade.com/api/v4/data';
  function finmindToken() { return localStorage.getItem('d2_finmind_token') || ''; }
  function fmUrl(p) { const u = new URLSearchParams(p); const t = finmindToken(); if (t) u.set('token', t); return FINMIND + '?' + u.toString(); }
  function fmMarket(t) { return t === 'twse' ? U.Market.tse : t === 'tpex' ? U.Market.otc : t === 'emerging' ? U.Market.rotc : U.Market.tse; }

  async function fetchText(url) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.text(); }
    catch (e) { const proxy = S.getProxy(); if (!proxy) throw e; const r2 = await fetch(proxy + encodeURIComponent(url), { cache: 'no-store' }); if (!r2.ok) throw new Error('proxy ' + r2.status); return await r2.text(); }
  }
  async function fetchJson(url) { return JSON.parse(await fetchText(url)); }

  async function loadTwUniverse(force) {
    if (!force && S.twUniverseFresh()) { const c = S.getTwUniverse(); if (c) return c; }
    const map = {};
    try {
      const j = await fetchJson(fmUrl({ dataset: 'TaiwanStockInfo' }));
      for (const r of (j.data || [])) { const code = (r.stock_id || '').trim(); if (code) map[code] = { name: r.stock_name || code, market: fmMarket(r.type) }; }
    } catch (e) { console.warn('universe', e); }
    if (Object.keys(map).length) S.setTwUniverse(map);
    return map || {};
  }

  async function fetchTwPrice(code) {
    const start = U.isoDate(new Date(Date.now() - 12 * 86400000));
    try {
      const j = await fetchJson(fmUrl({ dataset: 'TaiwanStockPrice', data_id: code, start_date: start }));
      const rows = j.data || []; if (!rows.length) return null;
      const last = rows[rows.length - 1]; const close = U.parseNum(last.close); if (close == null) return null;
      const chg = typeof last.spread === 'number' ? last.spread : 0;
      return { price: close, dailyChange: chg, prevClose: close - chg };
    } catch (e) { return null; }
  }

  async function fetchTwRealtime(metas) {
    const exch = metas.map(m => (U.normalizeMarketKey(m.market) === U.Market.otc ? 'otc' : 'tse') + '_' + m.code + '.tw');
    const out = {};
    for (let i = 0; i < exch.length; i += 50) {
      try {
        const j = await fetchJson('https://mis.twse.com.tw/stock/api/getStockInfo.jsp?json=1&delay=0&ex_ch=' + encodeURIComponent(exch.slice(i, i + 50).join('|')));
        for (const it of (j.msgArray || [])) {
          const code = (it.c || ((it.key || '').split('_')[1] || '').split('.')[0] || '').trim(); if (!code) continue;
          let price = U.parseNum(it.z); if (price == null) price = U.parseNum(it.pz); if (price == null) price = U.parseNum(it.o); if (price == null) continue;
          const prev = U.parseNum(it.y);
          out[code] = { price, dailyChange: prev != null ? price - prev : 0, prevClose: prev };
        }
      } catch (e) { console.warn('MIS', e); }
    }
    return out;
  }

  async function fetchUsQuote(symbol) {
    try {
      const j = await fetchJson('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + encodeURIComponent(finnhubKey()));
      const c = j.c; if (!(c > 0)) return null;
      const pc = typeof j.pc === 'number' ? j.pc : null;
      return { price: c, dailyChange: typeof j.d === 'number' ? j.d : (pc != null ? c - pc : 0), prevClose: pc };
    } catch (e) { return null; }
  }

  async function fetchFx() {
    const cached = S.getFxRate(), ts = S.getFxTs();
    if (cached && ts && Date.now() - ts < 6 * 3600 * 1000) return cached;
    try { const j = await fetchJson('https://open.er-api.com/v6/latest/USD'); const t = j && j.rates && j.rates.TWD; if (t > 0) { S.setFxRate(t); return t; } } catch (e) {}
    return cached || 31.5;
  }

  // 刷新股票帳戶報價；stocks = [{code, market}]
  async function refreshPrices(stocks) {
    if (!stocks || !stocks.length) { await fetchFx(); return S.getPrices(); }
    const prices = S.getPrices();
    const tw = stocks.filter(s => U.normalizeMarketKey(s.market) !== U.Market.us);
    const us = stocks.filter(s => U.normalizeMarketKey(s.market) === U.Market.us);
    const fxP = fetchFx();
    if (tw.length) {
      let rt = {};
      if (U.shouldUseMisRealtime()) { rt = await fetchTwRealtime(tw); for (const c in rt) prices[c] = rt[c]; }
      const q = tw.filter(m => !rt[m.code]);
      async function w() { while (q.length) { const m = q.shift(); const p = await fetchTwPrice(m.code); if (p) prices[m.code] = p; } }
      await Promise.all([w(), w(), w()]);
    }
    if (us.length) {
      const q = [...us];
      async function w() { while (q.length) { const m = q.shift(); const p = await fetchUsQuote(m.code); if (p) prices[m.code] = p; } }
      await Promise.all([w(), w(), w(), w(), w()]);
    }
    await fxP; S.setPrices(prices); return prices;
  }

  async function searchSymbols(query) {
    const q = (query || '').trim().toUpperCase(); if (!q) return [];
    const results = [];
    try { const uni = await loadTwUniverse(false); for (const code in uni) { const u = uni[code]; if (code.startsWith(q) || (u.name && u.name.toUpperCase().includes(q))) { results.push({ code, name: u.name, market: u.market }); if (results.length >= 20) break; } } } catch (e) {}
    try {
      const j = await fetchJson('https://finnhub.io/api/v1/search?q=' + encodeURIComponent(q) + '&token=' + encodeURIComponent(finnhubKey()));
      for (const it of (j.result || [])) { const sym = (it.symbol || '').toUpperCase(); if (!sym || sym.includes('.') || sym.length > 5 || !sym.startsWith(q)) continue; results.push({ code: sym, name: it.description || sym, market: U.Market.us }); if (results.length >= 40) break; }
    } catch (e) {}
    results.sort((a, b) => { const au = a.market === U.Market.us, bu = b.market === U.Market.us; if (au !== bu) return au ? 1 : -1; return a.code < b.code ? -1 : 1; });
    return results.slice(0, 30);
  }

  return { fetchText, fetchJson, loadTwUniverse, fetchTwPrice, fetchTwRealtime, fetchUsQuote, fetchFx, refreshPrices, searchSymbols, finnhubKey };
})();
