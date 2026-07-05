/* =========================================================================
 * calc.js — 商業邏輯（持倉/彙總/已實現損益/快照/CSV），對應 iOS StockViewModel
 * ======================================================================= */
window.App = window.App || {};

App.Calc = (function () {
  const U = App.Util;
  const S = App.Store;

  // 加權平均成本：BUY 累加；SELL 按當前均價比例扣成本（不改剩餘均價）
  function computeAvgCostPosition(txs) {
    let shares = 0, cost = 0;
    const sorted = [...txs].sort((a, b) => a.time - b.time);
    for (const t of sorted) {
      if (t.type === 'BUY') {
        shares += t.shares;
        cost += t.shares * t.price + t.fee;
      } else {
        const avg = shares > 1e-9 ? cost / shares : 0;
        const sell = Math.min(t.shares, shares);
        cost = Math.max(0, cost - sell * avg);
        shares = Math.max(0, shares - sell);
      }
    }
    return { shares, avgCost: shares > 1e-9 ? cost / shares : 0 };
  }

  // 由交易紀錄計算目前持倉
  function buildPositions() {
    const txs = S.getTransactions();
    const prices = S.getPrices();
    const mmap = S.metaMap();
    const bySym = {};
    for (const t of txs) (bySym[t.symbol] = bySym[t.symbol] || []).push(t);

    const out = [];
    for (const sym in bySym) {
      const { shares, avgCost } = computeAvgCostPosition(bySym[sym]);
      if (shares <= 1e-9) continue;
      const cost = shares * avgCost;
      const meta = mmap[sym];
      const pd = prices[sym];
      const price = pd ? pd.price : null;
      const mv = (price != null ? price : avgCost) * shares;
      const unreal = price != null ? mv - cost : 0;
      out.push({
        symbol: sym,
        name: meta ? meta.name : sym,
        shares, cost, avgCost,
        lastPrice: price,
        dailyChange: pd ? pd.dailyChange : null,
        dailyChangePct: (pd && pd.prevClose) ? (pd.dailyChange / pd.prevClose) * 100 : null,
        unrealizedPnl: unreal,
        marketValue: mv,
        market: meta ? meta.market : U.guessMarketBySymbol(sym),
      });
    }
    return out;
  }

  // 投資組合彙總（美股以匯率換算 TWD）
  function buildSummary(positions) {
    const rate = S.getFxRate() || 31.5;
    const mmap = S.metaMap();
    const s = {
      twMarketValue: 0, usMarketValueTwd: 0, cryptoMarketValueTwd: 0,
      twCostBasis: 0, usCostBasisTwd: 0, cryptoCostBasisTwd: 0,
      twUnrealizedPnl: 0, usUnrealizedPnlTwd: 0, cryptoUnrealizedPnlTwd: 0,
      twRealizedPnl: 0, usRealizedPnlTwd: 0, cryptoRealizedPnlTwd: 0,
      twDayPnl: 0, usDayPnlTwd: 0, cryptoDayPnlTwd: 0,
      cashBalance: 0,
    };
    for (const p of positions) {
      const mv = p.lastPrice != null ? p.lastPrice * p.shares : p.cost;
      const market = U.normalizeMarketKey(p.market);
      if (market === U.Market.crypto) {
        s.cryptoMarketValueTwd += mv * rate;
        s.cryptoCostBasisTwd += p.cost * rate;
        s.cryptoUnrealizedPnlTwd += p.unrealizedPnl * rate;
        s.cryptoDayPnlTwd += (p.dailyChange || 0) * p.shares * rate;
      } else if (market === U.Market.us) {
        s.usMarketValueTwd += mv * rate;
        s.usCostBasisTwd += p.cost * rate;
        s.usUnrealizedPnlTwd += p.unrealizedPnl * rate;
        s.usDayPnlTwd += (p.dailyChange || 0) * p.shares * rate;
      } else {
        s.twMarketValue += mv;
        s.twCostBasis += p.cost;
        s.twUnrealizedPnl += p.unrealizedPnl;
        s.twDayPnl += (p.dailyChange || 0) * p.shares;
      }
    }
    for (const rt of S.getRealized()) {
      const market = U.normalizeMarketKey(mmap[rt.symbol]?.market || U.guessMarketBySymbol(rt.symbol));
      if (market === U.Market.crypto) s.cryptoRealizedPnlTwd += rt.realizedPnl * rate;
      else if (market === U.Market.us) s.usRealizedPnlTwd += rt.realizedPnl * rate;
      else s.twRealizedPnl += rt.realizedPnl;
    }
    const acc = S.getAccount();
    if (acc.initialCash != null) {
      const txs = S.getTransactions();
      const spent = txs.filter(t => t.type === 'BUY').reduce((a, t) => a + (t.shares * t.price + t.fee), 0);
      const recv = txs.filter(t => t.type === 'SELL').reduce((a, t) => a + (t.shares * t.price - t.fee), 0);
      s.cashBalance = acc.initialCash - spent + recv;
    }
    // 衍生（含加密）
    s.totalMarketValueTwd = s.twMarketValue + s.usMarketValueTwd + s.cryptoMarketValueTwd;
    s.totalCostBasisTwd = s.twCostBasis + s.usCostBasisTwd + s.cryptoCostBasisTwd;
    s.twTotalPnl = s.twUnrealizedPnl + s.twRealizedPnl;
    s.usTotalPnlTwd = s.usUnrealizedPnlTwd + s.usRealizedPnlTwd;
    s.cryptoTotalPnlTwd = s.cryptoUnrealizedPnlTwd + s.cryptoRealizedPnlTwd;
    s.totalUnrealizedPnl = s.twUnrealizedPnl + s.usUnrealizedPnlTwd + s.cryptoUnrealizedPnlTwd;
    s.totalRealizedPnl = s.twRealizedPnl + s.usRealizedPnlTwd + s.cryptoRealizedPnlTwd;
    s.totalPnl = s.twTotalPnl + s.usTotalPnlTwd + s.cryptoTotalPnlTwd;
    s.dayPnl = s.twDayPnl + s.usDayPnlTwd + s.cryptoDayPnlTwd;
    s.netAsset = s.totalMarketValueTwd + s.cashBalance;
    s.twUnrealizedPnlPct = s.twCostBasis > 1e-9 ? (s.twUnrealizedPnl / s.twCostBasis) * 100 : null;
    s.usUnrealizedPnlPct = s.usCostBasisTwd > 1e-9 ? (s.usUnrealizedPnlTwd / s.usCostBasisTwd) * 100 : null;
    s.totalUnrealizedPnlPct = s.totalCostBasisTwd > 1e-9 ? (s.totalUnrealizedPnl / s.totalCostBasisTwd) * 100 : null;
    s.totalReturnPct = s.totalCostBasisTwd > 1e-9 ? (s.totalPnl / s.totalCostBasisTwd) * 100 : null;
    return s;
  }

  // 新增交易（SELL 同步寫入已實現損益）；回傳 {ok, msg}
  // market/name 為選填覆寫（例：從建議清單選了加密貨幣時傳入 'crypto'）
  // accountId 為選填現金帳戶：買入自動扣款、賣出自動存入
  function addTransaction({ symbolInput, type, shares, price, fee, market, name, accountId }) {
    const symbol = U.sanitizeSymbol(symbolInput);
    if (!symbol || shares <= 0 || price <= 0) return { ok: false, msg: '請輸入正確的代碼/股數/價格' };

    // 確保 meta 存在（有明確 market 覆寫時優先採用）
    const mmap = S.metaMap();
    if (market) {
      S.upsertMeta([{ code: symbol, name: name || (mmap[symbol] && mmap[symbol].name) || symbol, market: U.normalizeMarketKey(market) }]);
    } else {
      const guessed = U.guessMarketBySymbol(symbol);
      const existing = mmap[symbol];
      if (!existing) {
        S.upsertMeta([{ code: symbol, name: symbol, market: guessed }]);
      } else if (guessed === U.Market.us && existing.market !== U.Market.us && existing.market !== U.Market.crypto) {
        S.upsertMeta([{ code: symbol, name: existing.name, market: U.Market.us }]);
      }
    }

    const txs = S.getTransactions();
    if (type === 'SELL') {
      const symbolTxs = txs.filter(t => t.symbol === symbol);
      const { shares: posShares, avgCost } = computeAvgCostPosition(symbolTxs);
      if (posShares <= 1e-9) return { ok: false, msg: '目前沒有持倉，無法賣出' };
      if (shares > posShares + 1e-9) return { ok: false, msg: '賣出股數超過持倉（持倉：' + U.formatShares(posShares) + '）' };
      const realized = shares * price - shares * avgCost - fee;
      const rz = S.getRealized();
      rz.push({ id: S.uuid(), symbol, shares, sellPrice: price, avgCost, realizedPnl: realized, time: Date.now() });
      S.setRealized(rz);
    }

    const newTx = { id: S.uuid(), symbol, type, shares, price, fee, time: Date.now() };
    if (accountId) newTx.accountId = accountId;
    txs.push(newTx);
    S.setTransactions(txs);
    // 現金帳戶連動：買入扣款、賣出存入（帳戶原幣別金額）
    if (accountId) S.adjustCashBalance(accountId, txCashDelta(newTx));
    return { ok: true, symbol };
  }

  // 交易對現金帳戶的影響（原幣別）：BUY = −(金額+費)、SELL = +(金額−費)
  function txCashDelta(tx) {
    const amt = tx.shares * tx.price;
    return tx.type === 'BUY' ? -(amt + tx.fee) : (amt - tx.fee);
  }

  // 更新交易並重算該代碼的已實現損益（現金效果：先沖銷舊值再套用新值）
  function updateTransaction(id, { type, shares, price, fee, time }) {
    if (shares <= 0 || price <= 0) return { ok: false, msg: '請輸入正確的股數/價格' };
    const txs = S.getTransactions();
    const tx = txs.find(t => t.id === id);
    if (!tx) return { ok: false, msg: '找不到交易' };
    if (tx.accountId) S.adjustCashBalance(tx.accountId, -txCashDelta(tx)); // 沖銷舊
    tx.type = type; tx.shares = shares; tx.price = price; tx.fee = fee; tx.time = time;
    if (tx.accountId) S.adjustCashBalance(tx.accountId, txCashDelta(tx));  // 套用新
    S.setTransactions(txs);
    recomputeRealized(tx.symbol);
    return { ok: true, symbol: tx.symbol };
  }

  function deleteTransaction(id) {
    let txs = S.getTransactions();
    const tx = txs.find(t => t.id === id);
    if (!tx) return;
    if (tx.accountId) S.adjustCashBalance(tx.accountId, -txCashDelta(tx)); // 沖銷現金效果
    txs = txs.filter(t => t.id !== id);
    S.setTransactions(txs);
    recomputeRealized(tx.symbol);
  }

  // 重播某代碼所有交易，重建已實現損益
  function recomputeRealized(symbol) {
    let rz = S.getRealized().filter(r => r.symbol !== symbol);
    const txs = S.getTransactions().filter(t => t.symbol === symbol).sort((a, b) => a.time - b.time);
    let shares = 0, cost = 0;
    for (const t of txs) {
      if (t.type === 'BUY') {
        cost += t.shares * t.price + t.fee;
        shares += t.shares;
      } else {
        const avg = shares > 1e-9 ? cost / shares : 0;
        const realized = t.shares * t.price - t.shares * avg - t.fee;
        rz.push({ id: S.uuid(), symbol, shares: t.shares, sellPrice: t.price, avgCost: avg, realizedPnl: realized, time: t.time });
        const costBasis = t.shares * avg;
        shares = Math.max(0, shares - t.shares);
        cost = Math.max(0, cost - costBasis);
      }
    }
    S.setRealized(rz);
  }

  // 刪除某代碼所有資料（含沖銷各交易的現金帳戶效果）
  function deleteSymbol(symbolInput) {
    const sym = U.sanitizeSymbol(symbolInput);
    for (const t of S.getTransactions()) {
      if (t.symbol === sym && t.accountId) S.adjustCashBalance(t.accountId, -txCashDelta(t));
    }
    S.setTransactions(S.getTransactions().filter(t => t.symbol !== sym));
    S.setRealized(S.getRealized().filter(r => r.symbol !== sym));
    const p = S.getPrices(); delete p[sym]; S.setPrices(p);
    // 群組對應一併移除
    const gm = S.getGroupMap();
    if (gm[sym]) { delete gm[sym]; S.setGroupMap(gm); }
  }

  // 資產頁彙總：淨資產 = 流動資金 + 投資市值 − 負債（USD 帳戶以匯率換算）
  function assetsSummary() {
    const rate = S.getFxRate() || 31.5;
    const toTwd = a => (a.currency === 'USD' ? (a.balance || 0) * rate : (a.balance || 0));
    const cashTwd = S.getCashAccounts().reduce((s, a) => s + toTwd(a), 0);
    const liabTwd = S.getLiabilities().reduce((s, a) => s + toTwd(a), 0);
    const inv = buildSummary(buildPositions());
    return {
      cashTwd, liabTwd,
      investTwd: inv.totalMarketValueTwd,
      netWorth: cashTwd + inv.totalMarketValueTwd - liabTwd,
      invSummary: inv,
    };
  }

  // 現金帳戶 / 負債 台幣總額（美金 ×匯率）
  function cashLiabTwd() {
    const rate = S.getFxRate() || 31.5;
    const toTwd = a => (a.currency === 'USD' ? (a.balance || 0) * rate : (a.balance || 0));
    return {
      cashTwd: S.getCashAccounts().reduce((s, a) => s + toTwd(a), 0),
      liabTwd: S.getLiabilities().reduce((s, a) => s + toTwd(a), 0),
    };
  }

  // 儲存今日快照（覆蓋同日）
  function saveTodaySnapshot() {
    const summary = buildSummary(buildPositions());
    const date = U.isoDate();
    const { cashTwd, liabTwd } = cashLiabTwd();
    const snap = {
      date,
      marketValue: summary.totalMarketValueTwd,
      cashBalance: summary.cashBalance,
      netAsset: summary.netAsset,
      unrealizedPnl: summary.totalUnrealizedPnl,
      realizedPnl: summary.totalRealizedPnl,
      totalPnl: summary.totalPnl,
      dayPnl: summary.dayPnl,
      twMarketValue: summary.twMarketValue,
      usMarketValueTwd: summary.usMarketValueTwd,
      cryptoMarketValueTwd: summary.cryptoMarketValueTwd,
      totalMarketValueTwd: summary.totalMarketValueTwd,
      twCostBasis: summary.twCostBasis,
      usCostBasisTwd: summary.usCostBasisTwd,
      cryptoCostBasisTwd: summary.cryptoCostBasisTwd,
      totalCostBasisTwd: summary.totalCostBasisTwd,
      twUnrealizedPnl: summary.twUnrealizedPnl,
      usUnrealizedPnlTwd: summary.usUnrealizedPnlTwd,
      cryptoUnrealizedPnlTwd: summary.cryptoUnrealizedPnlTwd,
      twRealizedPnl: summary.twRealizedPnl,
      usRealizedPnlTwd: summary.usRealizedPnlTwd,
      cryptoRealizedPnlTwd: summary.cryptoRealizedPnlTwd,
      twTotalPnl: summary.twTotalPnl,
      usTotalPnlTwd: summary.usTotalPnlTwd,
      cryptoTotalPnlTwd: summary.cryptoTotalPnlTwd,
      twReturnPct: summary.twUnrealizedPnlPct || 0,
      usReturnPct: summary.usUnrealizedPnlPct || 0,
      totalReturnPct: summary.totalReturnPct || 0,
      // 資產頁分項：流動資金 / 負債 / 淨資產（= 投資市值 + 現金 − 負債）
      cashAccountsTwd: cashTwd,
      liabilitiesTwd: liabTwd,
      netWorth: summary.totalMarketValueTwd + cashTwd - liabTwd,
      createdAt: Date.now(),
    };
    const all = S.getSnapshots();
    const isNew = !all.some(s => s.date === date);
    let snaps = all.filter(s => s.date !== date);
    snaps.push(snap);
    snaps.sort((a, b) => a.date < b.date ? -1 : 1);
    S.setSnapshots(snaps);
    return isNew; // 是否新增了「新的一天」（供同步判斷）
  }

  // 由原始累計值組出完整快照（補齊衍生欄位，含加密）
  function makeSnapshot(date, s) {
    const cMV = s.cryptoMarketValueTwd || 0, cCost = s.cryptoCostBasisTwd || 0;
    const cUnr = s.cryptoUnrealizedPnlTwd || 0, cRel = s.cryptoRealizedPnlTwd || 0;
    const totalMV = s.twMarketValue + s.usMarketValueTwd + cMV;
    const totalCost = s.twCostBasis + s.usCostBasisTwd + cCost;
    const twTotal = s.twUnrealizedPnl + s.twRealizedPnl;
    const usTotal = s.usUnrealizedPnlTwd + s.usRealizedPnlTwd;
    const cTotal = cUnr + cRel;
    const totalPnl = twTotal + usTotal + cTotal;
    const cash = s.cashBalance || 0;
    return {
      date,
      marketValue: totalMV, cashBalance: cash, netAsset: totalMV + cash,
      unrealizedPnl: s.twUnrealizedPnl + s.usUnrealizedPnlTwd + cUnr,
      realizedPnl: s.twRealizedPnl + s.usRealizedPnlTwd + cRel,
      totalPnl, dayPnl: 0,
      twMarketValue: s.twMarketValue, usMarketValueTwd: s.usMarketValueTwd, cryptoMarketValueTwd: cMV, totalMarketValueTwd: totalMV,
      twCostBasis: s.twCostBasis, usCostBasisTwd: s.usCostBasisTwd, cryptoCostBasisTwd: cCost, totalCostBasisTwd: totalCost,
      twUnrealizedPnl: s.twUnrealizedPnl, usUnrealizedPnlTwd: s.usUnrealizedPnlTwd, cryptoUnrealizedPnlTwd: cUnr,
      twRealizedPnl: s.twRealizedPnl, usRealizedPnlTwd: s.usRealizedPnlTwd, cryptoRealizedPnlTwd: cRel,
      twTotalPnl: twTotal, usTotalPnlTwd: usTotal, cryptoTotalPnlTwd: cTotal,
      twReturnPct: s.twCostBasis > 1e-9 ? s.twUnrealizedPnl / s.twCostBasis * 100 : 0,
      usReturnPct: s.usCostBasisTwd > 1e-9 ? s.usUnrealizedPnlTwd / s.usCostBasisTwd * 100 : 0,
      totalReturnPct: totalCost > 1e-9 ? totalPnl / totalCost * 100 : 0,
      // 重建時以「目前」現金/負債回填（歷史餘額無從得知）
      cashAccountsTwd: s._cashTwd || 0,
      liabilitiesTwd: s._liabTwd || 0,
      netWorth: totalMV + (s._cashTwd || 0) - (s._liabTwd || 0),
      createdAt: Date.now(),
    };
  }

  // 用交易紀錄 + 歷史收盤，回推每一天的快照（重建歷史走勢）
  // hist: { code: [{date:'YYYY-MM-DD', close:number}, ...] }（已升序，含台股與美股）
  // 無歷史價的代碼則以成本估算
  function rebuildSnapshots(hist, fxRate) {
    const txs = S.getTransactions().slice().sort((a, b) => a.time - b.time);
    if (!txs.length) return 0;
    const rate = fxRate || S.getFxRate() || 31.5;
    const clNow = cashLiabTwd(); // 現金/負債以目前值回填
    const mmap = S.metaMap();
    const acc = S.getAccount();
    const realized = S.getRealized();
    const txDate = t => U.isoDate(new Date(t.time));

    const firstDate = txDate(txs[0]);
    const today = U.isoDate();
    const start = new Date(firstDate + 'T00:00:00+08:00');
    const end = new Date(today + 'T00:00:00+08:00');

    // 各檔 carry-forward 指標（台股 + 美股）
    const codes = Object.keys(hist);
    const ptr = {}, last = {};
    codes.forEach(c => { ptr[c] = 0; last[c] = null; });

    const snaps = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = U.isoDate(d);
      codes.forEach(c => {
        const arr = hist[c];
        while (ptr[c] < arr.length && arr[ptr[c]].date <= ds) { last[c] = arr[ptr[c]].close; ptr[c]++; }
      });

      const bySym = {};
      for (const t of txs) { if (txDate(t) <= ds) (bySym[t.symbol] = bySym[t.symbol] || []).push(t); }

      const s = { twMarketValue: 0, usMarketValueTwd: 0, cryptoMarketValueTwd: 0, twCostBasis: 0, usCostBasisTwd: 0, cryptoCostBasisTwd: 0, twUnrealizedPnl: 0, usUnrealizedPnlTwd: 0, cryptoUnrealizedPnlTwd: 0, twRealizedPnl: 0, usRealizedPnlTwd: 0, cryptoRealizedPnlTwd: 0, cashBalance: 0 };
      for (const sym in bySym) {
        const { shares, avgCost } = computeAvgCostPosition(bySym[sym]);
        if (shares <= 1e-9) continue;
        const cost = shares * avgCost;
        const market = U.normalizeMarketKey(mmap[sym] ? mmap[sym].market : U.guessMarketBySymbol(sym));
        const price = last[sym] != null ? last[sym] : avgCost; // 歷史收盤（無則用成本）
        const mv = price * shares;
        if (market === U.Market.crypto) {
          s.cryptoMarketValueTwd += mv * rate; s.cryptoCostBasisTwd += cost * rate; s.cryptoUnrealizedPnlTwd += (mv - cost) * rate;
        } else if (market === U.Market.us) {
          s.usMarketValueTwd += mv * rate; s.usCostBasisTwd += cost * rate; s.usUnrealizedPnlTwd += (mv - cost) * rate;
        } else {
          s.twMarketValue += mv; s.twCostBasis += cost; s.twUnrealizedPnl += (mv - cost);
        }
      }
      for (const rt of realized) {
        if (U.isoDate(new Date(rt.time)) > ds) continue;
        const market = U.normalizeMarketKey(mmap[rt.symbol] ? mmap[rt.symbol].market : U.guessMarketBySymbol(rt.symbol));
        if (market === U.Market.crypto) s.cryptoRealizedPnlTwd += rt.realizedPnl * rate;
        else if (market === U.Market.us) s.usRealizedPnlTwd += rt.realizedPnl * rate;
        else s.twRealizedPnl += rt.realizedPnl;
      }
      if (acc.initialCash != null) {
        let spent = 0, recv = 0;
        for (const t of txs) { if (txDate(t) > ds) continue; if (t.type === 'BUY') spent += t.shares * t.price + t.fee; else recv += t.shares * t.price - t.fee; }
        s.cashBalance = acc.initialCash - spent + recv;
      }
      s._cashTwd = clNow.cashTwd; s._liabTwd = clNow.liabTwd;
      snaps.push(makeSnapshot(ds, s));
    }
    S.setSnapshots(snaps);
    return snaps.length;
  }

  // 手續費防呆（SPEC I7）：fee > 成交金額 25% 視為異常
  // 背景：fee 計入成本(computeAvgCostPosition)，被誤填成天文數字會毒掉整份報表/重建歷史
  function findAbsurdFees(txs) {
    const out = [];
    for (const t of txs || []) {
      const amt = (t.shares || 0) * (t.price || 0);
      if (amt > 1e-9 && (t.fee || 0) > amt * 0.25) out.push({ symbol: t.symbol, fee: t.fee, amount: amt, time: t.time });
    }
    return out;
  }

  // 淨資產長條圖分桶（純函式；SPEC §6）。gran ∈ day|week|month|year
  //  - nwOf 回填舊快照；同桶(週/月/年)取最後一筆
  //  - change：有前一桶→跨期差；無前一桶(最早/唯一)→期間內漲幅(期末−期初)，避免顯示 0
  //  - 視窗：day=7 / week=5 / month=12 / year=10；空快照→[]
  function netWorthBuckets(snapshots, gran, cashLiab) {
    const cl = cashLiab || { cashTwd: 0, liabTwd: 0 };
    const nwOf = s => (s.netWorth != null ? s.netWorth
      : (s.totalMarketValueTwd != null ? s.totalMarketValueTwd : (s.netAsset || 0)) + (cl.cashTwd || 0) - (cl.liabTwd || 0));
    const snaps = (snapshots || []).filter(s => s && s.date).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    if (!snaps.length) return [];
    const series = snaps.map(s => ({ date: s.date, nw: nwOf(s) }));
    const md = iso => { const p = iso.split('-'); return (+p[1]) + '/' + (+p[2]); };
    const weekKey = iso => { // 回到當週週一（以 UTC 正午計算日曆星期，與行程時區無關）
      const p = iso.split('-').map(Number);
      const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12));
      dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
      return dt.toISOString().slice(0, 10);
    };
    let buckets;
    if (gran === 'day') {
      buckets = series.map(d => ({ date: d.date, nw: d.nw, first: d.nw, label: md(d.date), full: d.date }));
    } else {
      const keyOf = iso => gran === 'week' ? weekKey(iso) : gran === 'month' ? iso.slice(0, 7) : iso.slice(0, 4);
      const map = new Map();
      for (const d of series) {
        const k = keyOf(d.date);
        if (!map.has(k)) map.set(k, { first: d, last: d });
        else map.get(k).last = d;
      }
      buckets = [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([, o]) => ({
        date: o.last.date, nw: o.last.nw, first: o.first.nw,
        label: gran === 'week' ? md(o.last.date) : gran === 'month' ? (+o.last.date.slice(5, 7)) + '月' : o.last.date.slice(0, 4),
        full: gran === 'week' ? ('週 ' + md(o.last.date)) : gran === 'month' ? o.last.date.slice(0, 7) : o.last.date.slice(0, 4),
      }));
    }
    const withChange = buckets.map((b, i) => Object.assign({}, b, { change: i > 0 ? b.nw - buckets[i - 1].nw : b.nw - b.first }));
    const N = gran === 'day' ? 7 : gran === 'week' ? 5 : gran === 'month' ? 12 : 10;
    return withChange.slice(-N);
  }

  // 群組每日市值序列（依交易 + 成員歷史收盤回推；美股/加密 ×匯率）
  // symbols: 群組成員代碼；hist: { code:[{date,close}] }；回傳 [{date, mv}]（升冪、延伸到今天）
  function buildGroupSeries(symbols, hist, fxRate) {
    const set = new Set(symbols || []);
    const txs = S.getTransactions().filter(t => set.has(t.symbol)).sort((a, b) => a.time - b.time);
    if (!txs.length) return [];
    const rate = fxRate || S.getFxRate() || 31.5;
    const mmap = S.metaMap();
    const codes = [...set];
    const txDate = t => U.isoDate(new Date(t.time));
    const isUsd = sym => { const m = U.normalizeMarketKey(mmap[sym] ? mmap[sym].market : U.guessMarketBySymbol(sym)); return m === U.Market.us || m === U.Market.crypto; };
    const ptr = {}, last = {};
    codes.forEach(c => { ptr[c] = 0; last[c] = null; });
    const start = new Date(txDate(txs[0]) + 'T00:00:00+08:00');
    const end = new Date(U.isoDate() + 'T00:00:00+08:00');
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = U.isoDate(d);
      for (const c of codes) { const arr = hist[c] || []; while (ptr[c] < arr.length && arr[ptr[c]].date <= ds) { last[c] = arr[ptr[c]].close; ptr[c]++; } }
      const bySym = {};
      for (const t of txs) { if (txDate(t) <= ds) (bySym[t.symbol] = bySym[t.symbol] || []).push(t); }
      let mv = 0, cost = 0;
      for (const sym in bySym) {
        const { shares, avgCost } = computeAvgCostPosition(bySym[sym]);
        if (shares <= 1e-9) continue;
        const price = last[sym] != null ? last[sym] : avgCost; // 無歷史價 → 成本估算
        const conv = isUsd(sym) ? rate : 1;
        mv += price * shares * conv;
        cost += avgCost * shares * conv;
      }
      out.push({ date: ds, mv, cost });
    }
    return out;
  }

  // 統計頁：區間獲利之最（日/週/月/年）、單筆交易之最、目前持倉之最（SPEC §10）
  function tradingStats() {
    const snaps = S.getSnapshots().slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const rate = S.getFxRate() || 31.5;
    const weekKey = iso => { const p = iso.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
    const keyOf = (iso, g) => g === 'day' ? iso : g === 'week' ? weekKey(iso) : g === 'month' ? iso.slice(0, 7) : iso.slice(0, 4);
    // 區間 totalPnl 變化的極值（獲利取正、虧損取負；否則 null）
    // 忽略初始失真：(1) 重建歷史時前幾天無報價 → totalPnl=0 的成本基準，其到首個真實值
    //   的跳變會灌爆單期損益；(2) 第一個真實期間仍以初始為基準。故從「首個非零之後再跳一期」起算。
    const periodExtremes = (subset, g) => {
      const map = new Map();
      for (const s of subset) map.set(keyOf(s.date, g), s); // 同桶取最後（chronological）
      const arr = [...map.values()];
      let firstReal = arr.findIndex(s => (s.totalPnl || 0) !== 0); // 略過開頭 0 基準
      if (firstReal < 0) firstReal = arr.length;
      const start = Math.max(2, firstReal + 1); // +1 跳過 0→首值的假峰；≥2 再忽略第一個期間
      let best = null, worst = null;
      for (let i = start; i < arr.length; i++) {
        const chg = (arr[i].totalPnl || 0) - (arr[i - 1].totalPnl || 0);
        if (chg > 0 && (!best || chg > best.amount)) best = { date: arr[i].date, amount: chg };
        if (chg < 0 && (!worst || chg < worst.amount)) worst = { date: arr[i].date, amount: chg };
      }
      return { best, worst };
    };
    const periodsFor = (subset, grans) => { const o = {}; for (const g of grans) o[g] = periodExtremes(subset, g); return o; };
    const curYear = U.isoDate().slice(0, 4);
    const thisYearSnaps = snaps.filter(s => s.date.slice(0, 4) === curYear);

    // 單筆交易之最（最賺取正、最賠取負；含成交股數/價格）
    const mmap = S.metaMap();
    let bestTrade = null, worstTrade = null;
    for (const r of S.getRealized()) {
      const rec = { symbol: r.symbol, amount: r.realizedPnl, date: U.isoDate(new Date(r.time)),
        shares: r.shares, price: r.sellPrice,
        market: U.normalizeMarketKey((mmap[r.symbol] && mmap[r.symbol].market) || U.guessMarketBySymbol(r.symbol)) };
      if (r.realizedPnl > 0 && (!bestTrade || r.realizedPnl > bestTrade.amount)) bestTrade = rec;
      if (r.realizedPnl < 0 && (!worstTrade || r.realizedPnl < worstTrade.amount)) worstTrade = rec;
    }

    // 目前持倉之最（未實現，換算 TWD；獲利王取正、虧損王取負）
    const isUsd = m => { const k = U.normalizeMarketKey(m); return k === U.Market.us || k === U.Market.crypto; };
    let topGain = null, topLoss = null, topPct = null;
    for (const p of buildPositions()) {
      if (p.lastPrice == null) continue; // 無報價不列
      const amt = p.unrealizedPnl * (isUsd(p.market) ? rate : 1);
      const pct = p.cost > 1e-9 ? p.unrealizedPnl / p.cost * 100 : 0;
      const rec = { symbol: p.symbol, name: p.name, amount: amt, pct };
      if (amt > 0 && (!topGain || amt > topGain.amount)) topGain = rec;
      if (amt < 0 && (!topLoss || amt < topLoss.amount)) topLoss = rec;
      if (!topPct || pct > topPct.pct) topPct = rec;
    }

    return {
      period: {
        thisYear: periodsFor(thisYearSnaps, ['day', 'week', 'month']),
        all: periodsFor(snaps, ['day', 'week', 'month', 'year']),
      },
      bestTrade, worstTrade, topGain, topLoss, topPct,
    };
  }

  return {
    computeAvgCostPosition, buildPositions, buildSummary,
    addTransaction, updateTransaction, deleteTransaction, recomputeRealized,
    deleteSymbol, saveTodaySnapshot, rebuildSnapshots, assetsSummary, txCashDelta, cashLiabTwd,
    netWorthBuckets, findAbsurdFees, buildGroupSeries, tradingStats,
  };
})();
