/* =========================================================================
 * views.js — 四個分頁的畫面渲染 + 新增/編輯交易表單
 * ======================================================================= */
window.App = window.App || {};

App.Views = (function () {
  const U = App.Util, S = App.Store, C = App.Calc, UI = App.UI;
  const COL = { tw: '#E8823C', us: '#4A82C8', crypto: '#9B59D0', total: '#0F766E' }; // 台股橙、美股藍、加密紫

  // 共用：刷新後重繪目前分頁
  function rerender() { App.renderCurrent(); }

  /* ===================== 持倉 ===================== */
  const pf = { filter: 'all', sort: 'marketValue', asc: false };

  function portfolio(root) {
    const positions = C.buildPositions();
    const summary = C.buildSummary(positions);
    const rate = S.getFxRate() || 31.5;

    // 摘要卡
    const acc = S.getAccount();
    let html = `<div class="card summary-card">
      <div class="sum-net">
        <div class="sum-label">總倉位</div>
        <div class="sum-value">NT$ ${U.fmtWhole(summary.totalMarketValueTwd)}</div>
      </div>
      <div class="sum-grid">
        <div><div class="k">今日損益</div><div class="v">${UI.money(summary.dayPnl, { signed: true })}</div></div>
        <div><div class="k">總損益</div><div class="v">${UI.money(summary.totalPnl, { signed: true })}</div></div>
        <div><div class="k">報酬率</div><div class="v" style="color:${UI.pnlColor(summary.totalReturnPct || 0)}">${U.fmtPct(summary.totalReturnPct)}</div></div>
        <div><div class="k">未實現</div><div class="v">${UI.money(summary.totalUnrealizedPnl, { signed: true })}</div></div>
      </div>`;

    // 配置條（台股/美股/加密）
    const twV = summary.twMarketValue, usV = summary.usMarketValueTwd, crV = summary.cryptoMarketValueTwd || 0;
    const tot = twV + usV + crV;
    if (tot > 0) {
      const twPct = twV / tot * 100, usPct = usV / tot * 100, crPct = crV / tot * 100;
      html += `<div class="alloc">
        <div class="alloc-bar">
          <span style="width:${twPct}%;background:${COL.tw}"></span>
          <span style="width:${usPct}%;background:${COL.us}"></span>
          <span style="width:${crPct}%;background:${COL.crypto}"></span>
        </div>
        <div class="alloc-legend">
          <span><i style="background:${COL.tw}"></i>台股 ${twPct.toFixed(0)}%</span>
          <span><i style="background:${COL.us}"></i>美股 ${usPct.toFixed(0)}%</span>
          ${crV > 0 ? `<span><i style="background:${COL.crypto}"></i>加密 ${crPct.toFixed(0)}%</span>` : ''}
          ${acc.initialCash != null ? `<span class="cash">現金 NT$ ${U.fmtKMBB(summary.cashBalance)}</span>` : ''}
        </div>
      </div>`;
    }
    html += `</div>`;

    // 篩選 + 排序
    html += `<div class="toolbar">
      <div class="seg" id="pf-filter">
        ${seg('all', '全部', pf.filter)}${seg('tw', '台股', pf.filter)}${seg('us', '美股', pf.filter)}${seg('crypto', '加密', pf.filter)}
      </div>
      <select id="pf-sort" class="select">
        <option value="marketValue">市值</option>
        <option value="pnl">損益</option>
        <option value="price">現價</option>
        <option value="contribution">佔比</option>
      </select>
    </div>`;

    // 持倉列表
    const isUsdMk = m => m === U.Market.us || m === U.Market.crypto; // USD 計價市場
    let list = positions.filter(p => {
      const m = U.normalizeMarketKey(p.market);
      if (pf.filter === 'tw') return !isUsdMk(m);
      if (pf.filter === 'us') return m === U.Market.us;
      if (pf.filter === 'crypto') return m === U.Market.crypto;
      return true;
    });
    const mv = p => isUsdMk(U.normalizeMarketKey(p.market)) ? p.marketValue * rate : p.marketValue;
    list.sort((a, b) => {
      let av, bv;
      switch (pf.sort) {
        case 'pnl': av = a.unrealizedPnl; bv = b.unrealizedPnl; break;
        case 'price': av = a.lastPrice || 0; bv = b.lastPrice || 0; break;
        default: av = mv(a); bv = mv(b);
      }
      return pf.asc ? av - bv : bv - av;
    });

    // 目前分頁小計（單位跟隨列表：全部/台股=NT$、美股/加密=$）
    {
      let fMv = 0, fCost = 0, fUnreal = 0, fDay = 0;
      for (const p of list) {
        const c = (isUsdMk(U.normalizeMarketKey(p.market)) && pf.filter === 'all') ? rate : 1;
        fMv += p.marketValue * c;
        fCost += p.cost * c;
        fUnreal += p.unrealizedPnl * c;
        fDay += (p.dailyChange || 0) * p.shares * c;
      }
      const fPct = fCost > 1e-9 ? fUnreal / fCost * 100 : null;
      const cur = (pf.filter === 'us' || pf.filter === 'crypto') ? '$ ' : 'NT$ ';
      html += `<div class="card filter-sum">
        <div><div class="k">市值總和</div><div class="v">${cur}${U.fmtKMBB(fMv)}</div></div>
        <div><div class="k">當前損益</div><div class="v" style="color:${UI.pnlColor(fUnreal)}">${U.fmtBannerSigned(fUnreal)}<span class="pct">${fPct != null ? ' (' + U.fmtPct(fPct) + ')' : ''}</span></div></div>
        <div><div class="k">今日漲跌</div><div class="v" style="color:${UI.pnlColor(fDay)}">${U.fmtBannerSigned(fDay)}</div></div>
      </div>`;
    }

    let listHtml = '';
    if (!list.length) {
      listHtml = `<div class="empty">尚無持倉，點右下角 ＋ 新增交易</div>`;
    } else {
      // 「全部」檢視：美股/加密換算成台幣，單位統一為 NT$
      const toTwd = pf.filter === 'all';
      listHtml = `<div class="card holdings">`;
      for (const p of list) {
        const isUsd = isUsdMk(U.normalizeMarketKey(p.market));
        const conv = (isUsd && toTwd) ? rate : 1;         // 全部模式 USD 計價 ×匯率
        const showUsd = isUsd && !toTwd;                   // 美股/加密分頁顯示 $
        const cur = showUsd ? '$' : '';
        const mvCur = showUsd ? '$' : 'NT$';
        const pnlPct = p.cost > 1e-9 ? p.unrealizedPnl / p.cost * 100 : 0; // 比率，與幣別無關
        const chg = p.dailyChangePct;
        listHtml += `<div class="hold-row" data-sym="${p.symbol}">
          <div class="h-left">
            <div class="h-sym">${p.symbol} <span class="h-name">${p.name}</span></div>
            <div class="h-sub">${U.formatShares(p.shares)} 股 @ ${U.formatPrice(p.avgCost * conv)}</div>
          </div>
          <div class="h-mid">
            <div class="h-price">${p.lastPrice != null ? cur + U.formatPrice(p.lastPrice * conv) : '--'}</div>
            <div class="h-chg" style="color:${UI.pnlColor(chg || 0)}">${chg != null ? U.fmtPct(chg) : ''}</div>
          </div>
          <div class="h-right">
            <div class="h-mv">${mvCur} ${U.fmtKMBB(p.marketValue * conv)}</div>
            <div class="h-pnl" style="color:${UI.pnlColor(p.unrealizedPnl)}">${U.fmtBannerSigned(p.unrealizedPnl * conv)} (${U.fmtPct(pnlPct)})</div>
          </div>
        </div>`;
      }
      listHtml += `</div>`;
    }

    root.innerHTML = `<div class="page"><div class="page-top">${html}</div><div class="page-list">${listHtml}</div></div>`;

    // 事件
    root.querySelector('#pf-sort').value = pf.sort;
    root.querySelector('#pf-sort').addEventListener('change', e => { pf.sort = e.target.value; portfolio(root); });
    root.querySelectorAll('#pf-filter .seg-btn').forEach(b =>
      b.addEventListener('click', () => { pf.filter = b.dataset.v; portfolio(root); }));
    root.querySelectorAll('.hold-row').forEach(r =>
      r.addEventListener('click', () => openSymbolActions(r.dataset.sym)));
  }

  function seg(v, label, cur) {
    return `<button class="seg-btn ${cur === v ? 'active' : ''}" data-v="${v}">${label}</button>`;
  }

  function openSymbolActions(sym) {
    const txs = S.getTransactions().filter(t => t.symbol === sym).sort((a, b) => b.time - a.time);
    let rows = txs.map(t => `<div class="tx-mini" data-id="${t.id}">
      <span class="${t.type === 'BUY' ? 'buy' : 'sell'}">${t.type === 'BUY' ? '買' : '賣'}</span>
      <span>${U.formatShares(t.shares)} @ ${U.formatPrice(t.price)}</span>
      <span class="tx-date">${U.isoDate(new Date(t.time))}</span>
      <button class="link-edit" data-id="${t.id}">編輯</button>
    </div>`).join('');
    const ov = UI.openSheet(sym + ' 交易明細', rows || '<p>無交易</p>',
      `<button class="btn btn-ghost" id="add-more">新增此檔交易</button><button class="btn btn-danger" id="del-sym">刪除此檔</button>`);
    ov.querySelector('#del-sym').addEventListener('click', () =>
      UI.confirmDialog(`確定刪除 ${sym} 的所有交易與損益？`, () => { C.deleteSymbol(sym); UI.closeSheet(); App.afterDataChange([]); }, '刪除'));
    ov.querySelector('#add-more').addEventListener('click', () => { UI.closeSheet(); openTxForm(null, sym); });
    ov.querySelectorAll('.link-edit').forEach(b => b.addEventListener('click', () => {
      const tx = S.getTransactions().find(t => t.id === b.dataset.id);
      UI.closeSheet(); openTxForm(tx);
    }));
  }

  /* ===================== 歷史 ===================== */
  const hist = { tab: 'tx', range: 'ytd', txFilter: 'all', search: '', chart: 'alloc' };
  const RANGES = [['1m', '1M'], ['3m', '3M'], ['6m', '6M'], ['ytd', 'YTD'], ['1y', '1Y'], ['all', '全部']];
  // 趨勢圖表種類
  const HIST_CHARTS = [['alloc', '倉位'], ['net', '淨資產'], ['cash', '流動資金'], ['liab', '負債']];
  const HIST_LINE_CONF = {
    net: { label: '淨資產', color: '#0F766E' },
    cash: { label: '流動資金', color: '#34A853' },
    liab: { label: '負債', color: '#D95555' },
  };

  function history(root) {
    root.innerHTML = `<div class="page">
      <div class="page-top">
        <div class="seg seg-wide" id="hist-tab">${seg2('trend', '趨勢', hist.tab)}${seg2('tx', '交易紀錄', hist.tab)}</div>
        <div id="hist-fixed"></div>
      </div>
      <div class="page-list" id="hist-scroll"></div>
    </div>`;
    root.querySelectorAll('#hist-tab .seg-btn').forEach(b =>
      b.addEventListener('click', () => { hist.tab = b.dataset.v; history(root); }));
    const fixedEl = root.querySelector('#hist-fixed');
    const scrollEl = root.querySelector('#hist-scroll');
    if (hist.tab === 'trend') histTrend(fixedEl, scrollEl); else histTx(fixedEl, scrollEl);
  }
  function seg2(v, label, cur) { return `<button class="seg-btn ${cur === v ? 'active' : ''}" data-v="${v}">${label}</button>`; }

  function filterByRange(snaps) {
    if (hist.range === 'all') return snaps;
    const now = new Date();
    let from;
    if (hist.range === 'ytd') from = new Date(now.getFullYear(), 0, 1);
    else {
      const map = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 };
      from = new Date(now); from.setMonth(from.getMonth() - (map[hist.range] || 12));
    }
    const fromStr = U.isoDate(from);
    return snaps.filter(s => s.date >= fromStr);
  }

  function histTrend(fixedEl, scrollEl) {
    fixedEl.innerHTML = `<div class="chips" id="range-chips">` +
      RANGES.map(([v, l]) => `<button class="chip ${hist.range === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('') + `</div>
      <div class="chips" id="chart-chips">` +
      HIST_CHARTS.map(([v, l]) => `<button class="chip ${hist.chart === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('') + `</div>`;
    fixedEl.querySelectorAll('#range-chips .chip').forEach(b =>
      b.addEventListener('click', () => { hist.range = b.dataset.v; histTrend(fixedEl, scrollEl); }));
    fixedEl.querySelectorAll('#chart-chips .chip').forEach(b =>
      b.addEventListener('click', () => { hist.chart = b.dataset.v; histTrend(fixedEl, scrollEl); }));

    scrollEl.innerHTML = `<div class="card"><div class="chart-host" id="trend-chart"></div></div>`;
    const host = scrollEl.querySelector('#trend-chart');
    const snaps = filterByRange(S.getSnapshots());

    if (hist.chart === 'alloc') {
      // 資產配置：台股/美股/加密堆疊
      const points = snaps.map(s => ({ date: new Date(s.date + 'T00:00:00+08:00'), values: { tw: s.twMarketValue, us: s.usMarketValueTwd, crypto: s.cryptoMarketValueTwd || 0 } }));
      App.Charts.trend(host, points, {
        twKey: 'tw', usKey: 'us', cryptoKey: 'crypto', twLabel: '台股', usLabel: '美股', cryptoLabel: '加密',
        xLabels: monthLabels(points),
        valueFmt: v => 'NT$ ' + U.fmtKMBB(v),
      });
      return;
    }
    // 淨資產 / 流動資金 / 負債 單線圖（舊快照無欄位時以目前現金/負債回填，避免斷崖）
    const cl = C.cashLiabTwd();
    const valOf = s =>
      hist.chart === 'net' ? nwOf(s, cl)
        : hist.chart === 'cash' ? (s.cashAccountsTwd != null ? s.cashAccountsTwd : cl.cashTwd)
          : (s.liabilitiesTwd != null ? s.liabilitiesTwd : cl.liabTwd);
    const conf = HIST_LINE_CONF[hist.chart];
    const points = snaps.map(s => ({ date: new Date(s.date + 'T00:00:00+08:00'), values: { v: valOf(s) } }));
    App.Charts.lineChart(host, points, {
      series: [{ key: 'v', label: conf.label, color: conf.color, fill: true }],
      xLabels: monthLabels(points),
      valueFmt: v => 'NT$ ' + U.fmtKMBB(v),
    });
  }

  function monthLabels(points) {
    if (!points.length) return [];
    const out = []; const seen = new Set();
    const multiYear = new Set(points.map(p => p.date.getFullYear())).size > 1;
    points.forEach((p, i) => {
      const key = p.date.getFullYear() + '-' + p.date.getMonth();
      if (!seen.has(key)) {
        seen.add(key);
        const lbl = multiYear ? `${String(p.date.getFullYear()).slice(2)}/${p.date.getMonth() + 1}月` : `${p.date.getMonth() + 1}月`;
        out.push({ idx: i, label: lbl });
      }
    });
    if (out.length <= 6) return out;
    const step = Math.ceil(out.length / 6);
    return out.filter((_, i) => i % step === 0);
  }

  function histTx(fixedEl, scrollEl) {
    const mmap = S.metaMap();
    let txs = S.getTransactions().slice().sort((a, b) => b.time - a.time);
    txs = txs.filter(t => {
      const m = U.normalizeMarketKey(mmap[t.symbol]?.market || U.guessMarketBySymbol(t.symbol));
      if (hist.txFilter === 'tw') return m !== U.Market.us && m !== U.Market.crypto;
      if (hist.txFilter === 'us') return m === U.Market.us;
      if (hist.txFilter === 'crypto') return m === U.Market.crypto;
      return true;
    });
    if (hist.search) {
      const q = hist.search.toUpperCase();
      txs = txs.filter(t => t.symbol.includes(q) || (mmap[t.symbol]?.name || '').toUpperCase().includes(q));
    }

    fixedEl.innerHTML = `<div class="toolbar">
      <div class="seg" id="tx-filter">${seg('all', '全部', hist.txFilter)}${seg('tw', '台股', hist.txFilter)}${seg('us', '美股', hist.txFilter)}${seg('crypto', '加密', hist.txFilter)}</div>
    </div>
    <input class="input search" id="tx-search" placeholder="搜尋代碼或名稱" value="${hist.search}">`;

    let listHtml = `<div class="card tx-list">`;
    if (!txs.length) listHtml += `<div class="empty">無交易紀錄</div>`;
    for (const t of txs) {
      const name = mmap[t.symbol]?.name || t.symbol;
      listHtml += `<div class="tx-row" data-id="${t.id}">
        <span class="tx-type ${t.type === 'BUY' ? 'buy' : 'sell'}">${t.type === 'BUY' ? '買入' : '賣出'}</span>
        <div class="tx-main">
          <div class="tx-sym">${t.symbol} <span class="h-name">${name}</span></div>
          <div class="tx-sub">${U.formatShares(t.shares)} 股 @ ${U.formatPrice(t.price)}　手續費 ${U.formatPrice(t.fee)}</div>
        </div>
        <div class="tx-meta">
          <div class="tx-amt">${U.fmtKMBB(t.shares * t.price)}</div>
          <div class="tx-date">${U.isoDate(new Date(t.time))}</div>
        </div>
      </div>`;
    }
    listHtml += `</div>`;
    scrollEl.innerHTML = listHtml;

    fixedEl.querySelectorAll('#tx-filter .seg-btn').forEach(b =>
      b.addEventListener('click', () => { hist.txFilter = b.dataset.v; histTx(fixedEl, scrollEl); }));
    const se = fixedEl.querySelector('#tx-search');
    se.addEventListener('input', e => { hist.search = e.target.value; });
    se.addEventListener('change', () => histTx(fixedEl, scrollEl));
    scrollEl.querySelectorAll('.tx-row').forEach(r => r.addEventListener('click', () => {
      const tx = S.getTransactions().find(t => t.id === r.dataset.id);
      if (tx) openTxForm(tx);
    }));
  }

  /* ===================== 報表 ===================== */
  const rep = { mode: 'yearly', year: new Date().getFullYear(), col: null, asc: true, trendMode: 'pos' }; // trendMode: pos=倉位 | net=淨資產
  // 欄位 → 圖表標題 / 表頭底線色（藍：淨資產/投入；綠：損益/已未實現）
  const REP_COLS = {
    netAsset: { title: '總倉位', underline: '#4A82C8' },
    newInvestment: { title: '本期投入', underline: '#4A82C8' },
    periodPnl: { title: '本期損益', underline: '#3DAA6A' },
    realizedUnrealized: { title: '未實現 / 已實現', underline: '#3DAA6A' },
  };

  // 淨資產：快照有 netWorth 直接用；舊快照以「市值 + 目前現金 − 目前負債」回填
  //（避免新舊定義混用造成斷崖）
  function nwOf(s, cl) {
    if (s.netWorth != null) return s.netWorth;
    const mv = s.totalMarketValueTwd != null ? s.totalMarketValueTwd : (s.netAsset || 0);
    return mv + cl.cashTwd - cl.liabTwd;
  }

  function periodReports() {
    const snaps = S.getSnapshots().slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const cl = C.cashLiabTwd();
    if (rep.mode === 'yearly') {
      const byYear = {};
      for (const s of snaps) byYear[s.date.slice(0, 4)] = s;
      const years = Object.keys(byYear).sort();
      return years.map((y, i) => {
        const s = byYear[y], prev = i > 0 ? byYear[years[i - 1]] : null;
        return mkReport(y, s, prev, cl);
      });
    } else {
      const ys = String(rep.year);
      const byMonth = {};
      for (const s of snaps) if (s.date.slice(0, 4) === ys) byMonth[s.date.slice(5, 7)] = s;
      const prevYearLast = snaps.filter(s => s.date.slice(0, 4) === String(rep.year - 1)).pop() || null;
      const months = Object.keys(byMonth).sort();
      return months.map((m, i) => {
        const s = byMonth[m], prev = i === 0 ? prevYearLast : byMonth[months[i - 1]];
        return mkReport(m + '月', s, prev, cl);
      });
    }
  }
  function mkReport(label, s, prev, cl) {
    const cost = s.totalCostBasisTwd;
    const pPnl = s.totalPnl - (prev ? prev.totalPnl : 0);
    return {
      label,
      // 總倉位 = 台股 + 美股 + 加密 總市值（欄位名沿用 netAsset 以相容既有圖表）
      netAsset: s.totalMarketValueTwd != null ? s.totalMarketValueTwd : (s.netAsset || 0),
      newInvestment: cost - (prev ? prev.totalCostBasisTwd : 0),
      periodPnl: pPnl,
      totalPnl: s.totalPnl,
      returnPct: s.totalReturnPct,
      periodReturnPct: cost > 1e-9 ? pPnl / cost * 100 : 0,
      periodRealizedPnl: s.realizedPnl - (prev ? prev.realizedPnl : 0),
      unrealizedPnl: s.unrealizedPnl,
    };
  }

  function report(root) {
    const reports = periodReports();
    const years = [...new Set(S.getSnapshots().map(s => +s.date.slice(0, 4)))].sort();

    let html = `<div class="seg seg-wide" id="rep-mode">
      ${seg3('yearly', '年度', rep.mode)}${seg3('monthly', '月度', rep.mode)}
    </div>`;

    if (rep.mode === 'monthly' && years.length) {
      html += `<div class="chips" id="year-chips">` +
        years.map(y => `<button class="chip ${rep.year === y ? 'active' : ''}" data-v="${y}">${y} 年</button>`).join('') + `</div>`;
    }

    if (!reports.length) {
      html += `<div class="empty">暫無報表資料，使用一段時間後每日快照將彙整於此</div>`;
      root.innerHTML = `<div class="page-full">${html}</div>`;
      bindReportTop(root, years);
      return;
    }

    // 摘要橫幅（最新一期）
    const latest = reports[reports.length - 1];
    html += `<div class="card banner">
      ${bcol('本期損益', U.fmtBannerSigned(latest.periodPnl), UI.pnlColor(latest.periodPnl))}
      ${bcol('累計損益', U.fmtBannerSigned(latest.totalPnl), UI.pnlColor(latest.totalPnl))}
      ${bcol('報酬率', U.fmtPct(latest.returnPct), UI.pnlColor(latest.returnPct || 0))}
      ${bcol('未實現', U.fmtBannerSigned(latest.unrealizedPnl), UI.pnlColor(latest.unrealizedPnl))}
    </div>`;

    // 圖表（標題隨選取欄位變化；無選取＝倉位/淨資產走勢圖，可切換）
    const chartTitle = rep.col ? REP_COLS[rep.col].title : (rep.trendMode === 'net' ? '淨資產走勢圖' : '倉位走勢圖');
    html += `<div class="card"><div class="chart-title-row">
      <div class="chart-title">${chartTitle}</div>
      ${!rep.col ? `<div class="seg" id="rep-trend-mode">
        ${seg('pos', '倉位', rep.trendMode)}${seg('net', '淨資產', rep.trendMode)}
      </div>` : ''}
    </div><div class="chart-host" id="rep-chart"></div></div>`;

    // 表格（表頭可點擊切換圖表）
    const ulOf = c => rep.col === c ? `border-bottom:2px solid ${REP_COLS[c].underline}` : '';
    const acOf = c => rep.col === c ? 'active' : '';
    html += `<div class="card rep-table">
      <div class="rt-head">
        <span class="c0 rt-sort" data-sort="1">期間 ${rep.asc ? '▲' : '▼'}</span>
        <span class="rt-h ${acOf('netAsset')}" data-col="netAsset" style="${ulOf('netAsset')}">總倉位</span>
        <span class="rt-h ${acOf('newInvestment')}" data-col="newInvestment" style="${ulOf('newInvestment')}">本期投入</span>
        <span class="rt-h ${acOf('periodPnl')}" data-col="periodPnl" style="${ulOf('periodPnl')}">本期損益<br><i>${rep.mode === 'yearly' ? '年報酬率' : '月報酬率'}</i></span>
        <span class="rt-h ${acOf('realizedUnrealized')}" data-col="realizedUnrealized" style="${ulOf('realizedUnrealized')}">未實現<br><i>已實現</i></span>
      </div>`;
    const rowsOrder = rep.asc ? reports : [...reports].reverse();
    for (const r of rowsOrder) {
      html += `<div class="rt-row">
        <span class="c0">${r.label}</span>
        <span>${U.fmtBanner(r.netAsset)}</span>
        <span>${U.fmtBannerSigned(r.newInvestment)}</span>
        <span><b style="color:${UI.pnlColor(r.periodPnl)}">${U.fmtBannerSigned(r.periodPnl)}</b><br><i style="color:${UI.pnlColor(r.periodReturnPct)}">${U.fmtPct(r.periodReturnPct)}</i></span>
        <span><b style="color:${UI.pnlColor(r.unrealizedPnl)}">${U.fmtBannerSigned(r.unrealizedPnl)}</b><br><i style="color:${UI.pnlColor(r.periodRealizedPnl)}">${U.fmtBannerSigned(r.periodRealizedPnl)}</i></span>
      </div>`;
    }
    html += `</div>`;
    root.innerHTML = `<div class="page-full">${html}</div>`;
    bindReportTop(root, years);

    // 表頭點擊：切換對應欄位圖表（再點一次回走勢圖）
    root.querySelectorAll('.rt-h').forEach(h => h.addEventListener('click', () => {
      rep.col = (rep.col === h.dataset.col) ? null : h.dataset.col;
      report(root);
    }));
    const sortBtn = root.querySelector('.rt-sort');
    if (sortBtn) sortBtn.addEventListener('click', () => { rep.asc = !rep.asc; report(root); });

    // 走勢圖模式切換（倉位/淨資產）
    root.querySelectorAll('#rep-trend-mode .seg-btn').forEach(b =>
      b.addEventListener('click', () => { rep.trendMode = b.dataset.v; report(root); }));

    // 繪製圖表
    const host = root.querySelector('#rep-chart');
    if (rep.col) {
      App.Charts.reportColumn(host, reports, rep.col);
    } else {
      let snaps = S.getSnapshots().slice().sort((a, b) => a.date < b.date ? -1 : 1);
      if (rep.mode === 'monthly') snaps = snaps.filter(s => s.date.slice(0, 4) === String(rep.year));
      if (rep.trendMode === 'net') {
        // 淨資產走勢（= 倉位 + 流動資金 − 負債；舊快照回填見 nwOf）
        const cl = C.cashLiabTwd();
        const points = snaps.map(s => ({ date: new Date(s.date + 'T00:00:00+08:00'), values: { v: nwOf(s, cl) } }));
        App.Charts.lineChart(host, points, {
          series: [{ key: 'v', label: '淨資產', color: '#0F766E', fill: true }],
          xLabels: repXLabels(points),
          valueFmt: v => 'NT$ ' + U.fmtKMBB(v),
        });
      } else {
        const points = snaps.map(s => ({ date: new Date(s.date + 'T00:00:00+08:00'), values: {
          tw: s.twMarketValue, us: s.usMarketValueTwd, crypto: s.cryptoMarketValueTwd || 0,
        } }));
        App.Charts.trend(host, points, {
          twKey: 'tw', usKey: 'us', cryptoKey: 'crypto', twLabel: '台股', usLabel: '美股', cryptoLabel: '加密',
          xLabels: repXLabels(points),
          valueFmt: v => 'NT$ ' + U.fmtKMBB(v),
        });
      }
    }
  }
  function seg3(v, label, cur) { return `<button class="seg-btn ${cur === v ? 'active' : ''}" data-v="${v}">${label}</button>`; }
  function bcol(k, v, color) { return `<div class="bc"><div class="k">${k}</div><div class="v" style="color:${color}">${v}</div></div>`; }

  function repXLabels(points) {
    if (!points.length) return [];
    const out = []; const seen = new Set();
    points.forEach((p, i) => {
      const v = rep.mode === 'yearly' ? p.date.getFullYear() : p.date.getMonth() + 1;
      if (!seen.has(v)) { seen.add(v); out.push({ idx: i, label: rep.mode === 'yearly' ? String(v) : v + '月' }); }
    });
    const minGap = Math.max(5, Math.floor(points.length / 8));
    const filtered = [];
    for (const e of out) { if (filtered.length && e.idx - filtered[filtered.length - 1].idx < minGap) continue; filtered.push(e); }
    return filtered;
  }

  function bindReportTop(root, years) {
    root.querySelectorAll('#rep-mode .seg-btn').forEach(b =>
      b.addEventListener('click', () => { rep.mode = b.dataset.v; report(root); }));
    root.querySelectorAll('#year-chips .chip').forEach(b =>
      b.addEventListener('click', () => { rep.year = +b.dataset.v; report(root); }));
  }

  /* ===================== 資產（淨資產）===================== */
  // 手風琴：一次只展開一類（cash|invest|liab）；detailGroup = 群組詳情頁
  const as = { openCat: 'invest', detailGroup: null, detailAsc: false, nwDetail: false, nw: { metric: 'net', gran: 'day' } };
  const AS_PURPLE = '#6D5FD5';

  function mvTwdOf(p, rate) {
    const m = U.normalizeMarketKey(p.market);
    return (m === U.Market.us || m === U.Market.crypto) ? p.marketValue * rate : p.marketValue;
  }

  function assets(root) {
    if (as.nwDetail) return netWorthDetail(root);
    if (as.detailGroup) return groupDetail(root, as.detailGroup);
    const rate = S.getFxRate() || 31.5;
    const sum = C.assetsSummary();
    const positions = C.buildPositions();
    const groups = S.getGroups();
    const gmap = S.getGroupMap();
    const basis = S.getPctBasis(); // group | invest | net

    // 依群組整理持倉
    const byGroup = {}; const ungrouped = [];
    for (const p of positions) {
      const gid = gmap[p.symbol];
      if (gid && groups.some(g => g.id === gid)) (byGroup[gid] = byGroup[gid] || []).push(p);
      else ungrouped.push(p);
    }
    const groupTotal = gid => (byGroup[gid] || []).reduce((s, p) => s + mvTwdOf(p, rate), 0);
    const fmtPctBadge = v => (v >= 9.95 ? Math.round(v) : v.toFixed(v >= 1 ? 0 : 1)) + '%';
    // 佔比分母：組內=該群組、投資=投資總市值、淨資產=淨資產
    const denom = gTotal => basis === 'group' ? (gTotal || sum.investTwd) : basis === 'invest' ? sum.investTwd : sum.netWorth;

    // 今日淨資產漲跌（現金/負債日內不變，故等於投資日損益；紅漲綠跌）
    const dayChange = (sum.invSummary && sum.invSummary.dayPnl) || 0;
    const prevNet = sum.netWorth - dayChange;
    const dayPct = Math.abs(prevNet) > 1e-9 ? dayChange / Math.abs(prevNet) * 100 : 0;
    const dayArrow = dayChange > 0 ? '▲' : dayChange < 0 ? '▼' : '–';
    let html = `<div class="nw-hero">
      <div class="nw-open" id="nw-open">
        <div class="nw-cap">我的淨資產 (TWD) ›</div>
        <div class="nw-num">${U.fmtWhole(sum.netWorth)}</div>
        <div class="nw-day" style="color:${UI.pnlColor(dayChange)}">${dayArrow} ${U.fmtWhole(Math.abs(dayChange))} (${Math.abs(dayPct).toFixed(2)}%)</div>
      </div>
      <button class="nw-add" id="as-add-btn" aria-label="新增">＋</button>
    </div>`;

    // 收合摘要文字 + 更新日期
    const cashAccts = S.getCashAccounts();
    const liabs = S.getLiabilities();
    const dateFrom = ts => ts ? (t => `${t.month}月${t.day}日 更新`)(U.taipeiParts(new Date(ts))) : '';
    const maxUpd = list => list.reduce((m, a) => Math.max(m, a.updatedAt || 0), 0);
    const cashSummary = cashAccts.map(a => a.name).join('、') || '尚無帳戶';
    const investSummary = [...groups.map(g => g.name), ungrouped.length ? '獨立持股' : null].filter(Boolean).join('、') || '尚無持倉';
    const liabSummary = liabs.map(a => a.name).join('、') || '尚無負債';

    // 分類卡標頭（展開填色、收合顯示摘要+日期）
    function catHead(cat, name, totalHtml, cc, openCls, summary, dateTs) {
      const open = as.openCat === cat;
      return `<div class="as-head ${open ? 'open ' + openCls : ''}" data-cat="${cat}" style="--cc:${cc}">
        <div class="as-hleft">
          <span class="as-name">${name}</span>
          ${!open ? `<span class="as-hsummary">${summary}</span>` : ''}
        </div>
        <div class="as-hright">
          <span class="as-total">${totalHtml}</span>
          ${!open && dateTs ? `<span class="as-hdate">${dateFrom(dateTs)}</span>` : ''}
        </div>
      </div>`;
    }

    // ── 流動資金 ─────────────────────────────────────────
    html += `<div class="card as-cat">` +
      catHead('cash', '流動資金', U.fmtWhole(sum.cashTwd), '#34C759', 'oc-green', cashSummary, maxUpd(cashAccts));
    if (as.openCat === 'cash') {
      html += `<div class="as-body">`;
      for (const a of cashAccts) {
        const twd = a.currency === 'USD' ? (a.balance || 0) * rate : (a.balance || 0);
        html += `<div class="as-row" data-kind="cash" data-id="${a.id}">
          <div class="as-main"><div class="as-title">${a.name}</div>
            <div class="as-sub">${a.currency === 'USD' ? 'USD ' + U.formatPrice(a.balance || 0) + ' · r' + rate.toFixed(3) : '台幣帳戶'}</div></div>
          <div class="as-val" style="color:#2E7D32">${U.fmtWhole(twd)}</div>
        </div>`;
      }
      if (!cashAccts.length) html += `<div class="empty" style="padding:14px">尚無現金帳戶，點右上角 ＋ 新增</div>`;
      html += `</div>`;
    }
    html += `</div>`;

    // ── 投資 ────────────────────────────────────────────
    html += `<div class="card as-cat">` +
      catHead('invest', '投資', U.fmtWhole(sum.investTwd), AS_PURPLE, 'oc-purple', investSummary, S.getPricesTs());
    if (as.openCat === 'invest') {
      html += `<div class="as-body">`;
      // 群組列（點擊進入詳情頁）
      for (const g of groups) {
        const gTotal = groupTotal(g.id);
        const gPct = (basis === 'net' ? sum.netWorth : sum.investTwd) > 1e-9
          ? gTotal / (basis === 'net' ? sum.netWorth : sum.investTwd) * 100 : 0;
        html += `<div class="as-grow" data-gid="${g.id}">
          <span class="pct-badge sm">${fmtPctBadge(gPct)}</span>
          <div class="as-main"><div class="as-title">${g.name}</div>
            <div class="as-sub">${(byGroup[g.id] || []).length} 檔 ›</div></div>
          <div class="as-val">${U.fmtWhole(gTotal)}</div>
        </div>`;
      }
      // 未分組持倉（與群組同層）
      for (const p of ungrouped) {
        const mv = mvTwdOf(p, rate);
        const d = basis === 'group' ? sum.investTwd : denom(0); // 未分組無「組內」→ 用投資
        const pct = d > 1e-9 ? mv / d * 100 : 0;
        const isUsd = U.normalizeMarketKey(p.market) !== U.Market.tse && U.normalizeMarketKey(p.market) !== U.Market.otc && U.normalizeMarketKey(p.market) !== U.Market.rotc;
        html += `<div class="as-row member top" data-sym="${p.symbol}">
          <span class="pct-badge sm">${fmtPctBadge(pct)}</span>
          <div class="as-main"><div class="as-title">${p.symbol} <span class="h-name">${p.name}</span></div>
            <div class="as-sub">持有 ${U.formatShares(p.shares)}, ${isUsd ? '$' : ''}${U.formatPrice(p.lastPrice != null ? p.lastPrice : p.avgCost)}</div></div>
          <div class="as-val">${U.fmtWhole(mv)}</div>
        </div>`;
      }
      if (!positions.length) html += `<div class="empty" style="padding:16px">尚無持倉，點右上角 ＋ 新增投資</div>`;
      html += `</div>`;
    }
    html += `</div>`;

    // ── 負債 ────────────────────────────────────────────
    html += `<div class="card as-cat">` +
      catHead('liab', '負債', (sum.liabTwd > 0 ? '−' : '') + U.fmtWhole(sum.liabTwd), '#8E9BEF', 'oc-blue', liabSummary, maxUpd(liabs));
    if (as.openCat === 'liab') {
      html += `<div class="as-body">`;
      for (const a of liabs) {
        const twd = a.currency === 'USD' ? (a.balance || 0) * rate : (a.balance || 0);
        html += `<div class="as-row" data-kind="liab" data-id="${a.id}">
          <div class="as-main"><div class="as-title">${a.name}</div>
            <div class="as-sub">${a.currency === 'USD' ? 'USD ' + U.formatPrice(a.balance || 0) : '台幣'}</div></div>
          <div class="as-val" style="color:${UI.GAIN}">−${U.fmtWhole(twd)}</div>
        </div>`;
      }
      if (!liabs.length) html += `<div class="empty" style="padding:14px">尚無負債，點右上角 ＋ 新增</div>`;
      html += `</div>`;
    }
    html += `</div>`;

    root.innerHTML = `<div class="page-full">${html}</div>`;

    // ── 事件 ─────────────────────────────────────────────
    root.querySelectorAll('.as-head').forEach(h => h.addEventListener('click', () => {
      const k = h.dataset.cat;
      as.openCat = (as.openCat === k) ? null : k; // 再點一次收合；否則只展開被點的
      assets(root);
    }));
    const bind = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
    bind('#as-add-btn', () => openAddChooser(() => assets(root)));
    bind('#nw-open', () => { as.nwDetail = true; netWorthDetail(root); });
    root.querySelectorAll('.as-row[data-kind]').forEach(r => r.addEventListener('click', () => {
      const kind = r.dataset.kind;
      const list = kind === 'cash' ? S.getCashAccounts() : S.getLiabilities();
      openMoneyForm(kind, list.find(x => x.id === r.dataset.id), () => assets(root));
    }));
    root.querySelectorAll('.as-grow').forEach(g => g.addEventListener('click', () => {
      as.detailGroup = g.dataset.gid; assets(root);
    }));
    root.querySelectorAll('.as-row.member').forEach(r => r.addEventListener('click', () =>
      openGroupAssign(r.dataset.sym, () => assets(root))));
  }

  // 淨資產長條圖頁：淨資產 / 漲幅；X 軸 天(7)／週(5)／月(12)／年(10)
  function nwBuckets(gran) {
    const cl = C.cashLiabTwd();
    const snaps = S.getSnapshots().slice().sort((a, b) => a.date < b.date ? -1 : 1);
    if (!snaps.length) return [];
    const series = snaps.map(s => ({ date: s.date, nw: nwOf(s, cl) }));
    const mdOf = iso => { const p = U.taipeiParts(new Date(iso + 'T00:00:00+08:00')); return p.month + '/' + p.day; };
    let buckets;
    if (gran === 'day') {
      buckets = series.map(d => ({ date: d.date, nw: d.nw, label: mdOf(d.date), full: d.date }));
    } else {
      const keyOf = iso => {
        if (gran === 'week') {
          const dt = new Date(iso + 'T00:00:00+08:00');
          const off = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - off);
          return U.isoDate(dt);
        }
        if (gran === 'month') return iso.slice(0, 7);
        return iso.slice(0, 4);
      };
      const map = new Map();
      for (const d of series) map.set(keyOf(d.date), d); // 同桶取最後一筆
      buckets = [...map.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([, d]) => ({
        date: d.date, nw: d.nw,
        label: gran === 'week' ? mdOf(d.date) : gran === 'month' ? (+d.date.slice(5, 7)) + '月' : d.date.slice(0, 4),
        full: gran === 'week' ? ('週 ' + mdOf(d.date)) : gran === 'month' ? d.date.slice(0, 7) : d.date.slice(0, 4),
      }));
    }
    const withChange = buckets.map((b, i) => Object.assign({}, b, { change: i > 0 ? b.nw - buckets[i - 1].nw : 0 }));
    const N = gran === 'day' ? 7 : gran === 'week' ? 5 : gran === 'month' ? 12 : 10;
    return withChange.slice(-N);
  }

  function netWorthDetail(root) {
    const st = as.nw;
    const signed = st.metric === 'change';
    const items = nwBuckets(st.gran).map(b => ({ label: b.label, fullLabel: b.full, value: signed ? b.change : b.nw }));
    const GRAN = [['day', '天'], ['week', '週'], ['month', '月'], ['year', '年']];
    let html = `<div class="gd-head">
      <button class="gd-back" aria-label="返回">‹</button>
      <div class="gd-title">${signed ? '漲幅長條圖' : '淨資產長條圖'}</div>
      <div class="gd-actions"></div>
    </div>
    <div class="card">
      <div class="seg seg-wide" id="nw-metric">${seg('net', '淨資產', st.metric)}${seg('change', '漲幅', st.metric)}</div>
      <div class="seg seg-wide" id="nw-gran" style="margin-top:8px">
        ${GRAN.map(([v, l]) => `<button class="seg-btn ${st.gran === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}
      </div>
      <div class="chart-host" id="nw-chart" style="margin-top:12px"></div>
    </div>`;
    root.innerHTML = `<div class="page-full">${html}</div>`;

    root.querySelector('.gd-back').addEventListener('click', () => { as.nwDetail = false; assets(root); });
    root.querySelectorAll('#nw-metric .seg-btn').forEach(b => b.addEventListener('click', () => { as.nw.metric = b.dataset.v; netWorthDetail(root); }));
    root.querySelectorAll('#nw-gran .seg-btn').forEach(b => b.addEventListener('click', () => { as.nw.gran = b.dataset.v; netWorthDetail(root); }));

    App.Charts.barChart(root.querySelector('#nw-chart'), items, {
      valueFmt: v => signed ? ((v >= 0 ? '+' : '−') + 'NT$ ' + U.fmtKMBB(Math.abs(v))) : ('NT$ ' + U.fmtKMBB(v)),
      colorOf: signed ? (v => UI.pnlColor(v)) : (() => '#0F766E'),
    });
  }

  // 群組詳情頁（返回 / 標題 / ⋯ / ＋ / 合計排序 / 成員卡片）
  function groupDetail(root, gid) {
    const g = S.getGroups().find(x => x.id === gid);
    if (!g) { as.detailGroup = null; return assets(root); }
    const rate = S.getFxRate() || 31.5;
    const sum = C.assetsSummary();
    const gmap = S.getGroupMap();
    const members = C.buildPositions().filter(p => gmap[p.symbol] === gid);
    const gTotal = members.reduce((s, p) => s + mvTwdOf(p, rate), 0);
    const basis = S.getPctBasis();
    const denomV = basis === 'group' ? (gTotal || 1) : basis === 'invest' ? sum.investTwd : sum.netWorth;
    members.sort((a, b) => as.detailAsc ? mvTwdOf(a, rate) - mvTwdOf(b, rate) : mvTwdOf(b, rate) - mvTwdOf(a, rate));
    const fmtPctBadge = v => (v >= 9.95 ? Math.round(v) : v.toFixed(v >= 1 ? 0 : 1)) + '%';
    const updTs = S.getPricesTs();
    const updDate = updTs ? U.isoDate(new Date(updTs)) : '';

    let html = `<div class="gd-head">
      <button class="gd-back" aria-label="返回">‹</button>
      <div class="gd-title">${g.name}</div>
      <div class="gd-actions">
        <button class="gd-menu" aria-label="選單">⋯</button>
        <button class="gd-plus" aria-label="新增">＋</button>
      </div>
    </div>
    <div class="gd-total">合計 NT$ ${U.fmtWhole(gTotal)} <button class="gd-sort" aria-label="排序">${as.detailAsc ? '▲' : '▼'}</button></div>`;

    if (!members.length) {
      html += `<div class="empty" style="padding:40px 16px">此群組尚無持倉<br>點右上 ＋ 買入並加入，或從投資清單指定群組</div>`;
    }
    for (const p of members) {
      const mv = mvTwdOf(p, rate);
      const pct = denomV > 1e-9 ? mv / denomV * 100 : 0;
      const isUsd = U.normalizeMarketKey(p.market) !== U.Market.tse && U.normalizeMarketKey(p.market) !== U.Market.otc && U.normalizeMarketKey(p.market) !== U.Market.rotc;
      html += `<div class="card gd-row" data-sym="${p.symbol}">
        <span class="pct-badge">${fmtPctBadge(pct)}</span>
        <div class="as-main">
          <div class="gd-sym">${p.symbol} <span class="h-name">${p.name !== p.symbol ? p.name : ''}</span></div>
          <div class="as-sub">持有 ${U.formatShares(p.shares)}, ${isUsd ? '$' : ''}${U.formatPrice(p.lastPrice != null ? p.lastPrice : p.avgCost)}</div>
        </div>
        <div class="gd-val">
          <div class="gd-amt">${U.fmtWhole(mv)}</div>
          ${updDate ? `<div class="gd-date">${updDate}</div>` : ''}
        </div>
      </div>`;
    }

    root.innerHTML = `<div class="page-full">${html}</div>`;

    root.querySelector('.gd-back').addEventListener('click', () => { as.detailGroup = null; assets(root); });
    root.querySelector('.gd-sort').addEventListener('click', () => { as.detailAsc = !as.detailAsc; assets(root); });
    root.querySelector('.gd-menu').addEventListener('click', () => openGroupMenu(gid, () => assets(root)));
    root.querySelector('.gd-plus').addEventListener('click', () =>
      openTxForm(null, null, { onAdded: sym => { const m = S.getGroupMap(); m[sym] = gid; S.setGroupMap(m); if (App.Sync) App.Sync.markDirty(); } }));
    root.querySelectorAll('.gd-row').forEach(r => r.addEventListener('click', () =>
      openGroupAssign(r.dataset.sym, () => assets(root))));
  }

  // 統一新增選單：現金 / 投資 / 負債 / 群組
  function openAddChooser(onDone) {
    const ov = UI.openSheet('新增', `
      <div class="ga-list">
        <div class="ga-item" data-k="cash"><b>現金帳戶</b><span class="ga-sub">台幣 / 美金，計入流動資金</span></div>
        <div class="ga-item" data-k="invest"><b>投資</b><span class="ga-sub">買入股票 / 加密貨幣（可選擇扣款帳戶）</span></div>
        <div class="ga-item" data-k="liab"><b>負債</b><span class="ga-sub">信貸、房貸等，自淨資產扣除</span></div>
        <div class="ga-item" data-k="group"><b>投資群組</b><span class="ga-sub">將持倉分類（例：ETF、核心持股）</span></div>
      </div>`, '');
    ov.querySelectorAll('.ga-item').forEach(it => it.addEventListener('click', () => {
      const k = it.dataset.k;
      UI.closeSheet();
      if (k === 'cash') openMoneyForm('cash', null, onDone);
      else if (k === 'liab') openMoneyForm('liab', null, onDone);
      else if (k === 'group') openGroupCreate(onDone);
      else openTxForm(null); // 投資 → 新增交易（完成後 afterDataChange 會重繪）
    }));
  }

  // 現金 / 負債帳戶表單（新增或編輯；含快速增減）
  function openMoneyForm(kind, editing, onDone) {
    const isCash = kind === 'cash';
    const a = editing || {};
    const cur0 = a.currency || 'TWD';
    const body = `
      <label class="fld">名稱<input class="input" id="mf-name" value="${a.name || ''}" placeholder="${isCash ? '例：Firstrade、台幣' : '例：信貸、房貸'}"></label>
      <label class="fld">幣別
        <div class="fee-mode">
          <button class="fm-btn ${cur0 === 'TWD' ? 'active' : ''}" data-c="TWD">台幣</button>
          <button class="fm-btn ${cur0 === 'USD' ? 'active' : ''}" data-c="USD">美金</button>
        </div>
      </label>
      <label class="fld">${isCash ? '餘額' : '負債金額'}<input class="input" id="mf-bal" type="number" inputmode="decimal" value="${a.balance != null ? a.balance : ''}" placeholder="0"></label>
      <label class="fld">快速增減
        <div class="adj-row">
          <input class="input" id="mf-adj" type="number" inputmode="decimal" placeholder="金額">
          <button class="btn btn-ghost btn-sm" id="mf-plus">＋存入</button>
          <button class="btn btn-ghost btn-sm" id="mf-minus">−提出</button>
        </div>
      </label>`;
    const footer = `${editing ? '<button class="btn btn-danger" id="mf-del">刪除</button>' : ''}
      <button class="btn btn-ghost" id="mf-cancel">取消</button><button class="btn btn-primary" id="mf-ok">${editing ? '儲存' : '新增'}</button>`;
    const ov = UI.openSheet(editing ? '編輯' + (isCash ? '現金帳戶' : '負債') : '新增' + (isCash ? '現金帳戶' : '負債'), body, footer);
    const $ = s => ov.querySelector(s);
    let cur = cur0;
    ov.querySelectorAll('.fm-btn').forEach(b => b.addEventListener('click', () => {
      cur = b.dataset.c; ov.querySelectorAll('.fm-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
    }));
    const applyAdj = sign => {
      const d = parseFloat($('#mf-adj').value);
      if (isNaN(d) || d === 0) return;
      $('#mf-bal').value = String(((parseFloat($('#mf-bal').value) || 0) + sign * d));
      $('#mf-adj').value = '';
    };
    $('#mf-plus').addEventListener('click', () => applyAdj(1));
    $('#mf-minus').addEventListener('click', () => applyAdj(-1));
    $('#mf-cancel').addEventListener('click', UI.closeSheet);
    if ($('#mf-del')) $('#mf-del').addEventListener('click', () => UI.confirmDialog('刪除「' + (a.name || '') + '」?', () => {
      if (isCash) S.setCashAccounts(S.getCashAccounts().filter(x => x.id !== a.id));
      else S.setLiabilities(S.getLiabilities().filter(x => x.id !== a.id));
      UI.closeSheet(); if (App.Sync) App.Sync.markDirty(); onDone && onDone();
    }, '刪除'));
    $('#mf-ok').addEventListener('click', () => {
      const name = ($('#mf-name').value || '').trim();
      const bal = parseFloat($('#mf-bal').value);
      if (!name) return UI.toast('請輸入名稱', 'info');
      if (isNaN(bal)) return UI.toast('請輸入金額', 'info');
      if (isCash) {
        const list = S.getCashAccounts();
        if (editing) { const x = list.find(i => i.id === a.id); if (x) { x.name = name; x.currency = cur; x.balance = bal; } }
        else list.push({ id: S.uuid(), name, currency: cur, balance: bal });
        S.setCashAccounts(list);
      } else {
        const list = S.getLiabilities();
        if (editing) { const x = list.find(i => i.id === a.id); if (x) { x.name = name; x.currency = cur; x.balance = bal; } }
        else list.push({ id: S.uuid(), name, currency: cur, balance: bal });
        S.setLiabilities(list);
      }
      UI.closeSheet(); if (App.Sync) App.Sync.markDirty(); onDone && onDone();
    });
  }

  // 新增群組
  function openGroupCreate(onDone) {
    const ov = UI.openSheet('新增群組', `<label class="fld">群組名稱<input class="input" id="gc-name" placeholder="例：ETF、核心持股"></label>`,
      `<button class="btn btn-ghost" id="gc-cancel">取消</button><button class="btn btn-primary" id="gc-ok">建立</button>`);
    ov.querySelector('#gc-cancel').addEventListener('click', UI.closeSheet);
    ov.querySelector('#gc-name').focus();
    ov.querySelector('#gc-ok').addEventListener('click', () => {
      const name = (ov.querySelector('#gc-name').value || '').trim();
      if (!name) return UI.toast('請輸入名稱', 'info');
      const gs = S.getGroups(); gs.push({ id: S.uuid(), name }); S.setGroups(gs);
      UI.closeSheet(); if (App.Sync) App.Sync.markDirty(); onDone && onDone();
    });
  }

  // 群組選單：重新命名 / 解散
  function openGroupMenu(gid, onDone) {
    const g = S.getGroups().find(x => x.id === gid); if (!g) return;
    const ov = UI.openSheet(g.name,
      `<label class="fld">重新命名<input class="input" id="gm-name" value="${g.name}"></label>`,
      `<button class="btn btn-danger" id="gm-del">解散群組</button><button class="btn btn-ghost" id="gm-cancel">取消</button><button class="btn btn-primary" id="gm-ok">儲存</button>`);
    ov.querySelector('#gm-cancel').addEventListener('click', UI.closeSheet);
    ov.querySelector('#gm-ok').addEventListener('click', () => {
      const name = (ov.querySelector('#gm-name').value || '').trim();
      if (!name) return UI.toast('請輸入名稱', 'info');
      const gs = S.getGroups(); const x = gs.find(i => i.id === gid); if (x) x.name = name; S.setGroups(gs);
      UI.closeSheet(); if (App.Sync) App.Sync.markDirty(); onDone && onDone();
    });
    ov.querySelector('#gm-del').addEventListener('click', () => UI.confirmDialog('解散「' + g.name + '」？成員將變為未分組。', () => {
      S.setGroups(S.getGroups().filter(x => x.id !== gid));
      const gm = S.getGroupMap();
      for (const sym in gm) if (gm[sym] === gid) delete gm[sym];
      S.setGroupMap(gm);
      UI.closeSheet(); if (App.Sync) App.Sync.markDirty(); onDone && onDone();
    }, '解散'));
  }

  // 指定持倉的群組
  function openGroupAssign(sym, onDone) {
    const groups = S.getGroups();
    const gm = S.getGroupMap();
    const cur = gm[sym];
    let body = `<div class="ga-list">
      <div class="ga-item ${!cur ? 'on' : ''}" data-gid="">未分組${!cur ? ' ✓' : ''}</div>
      ${groups.map(g => `<div class="ga-item ${cur === g.id ? 'on' : ''}" data-gid="${g.id}">${g.name}${cur === g.id ? ' ✓' : ''}</div>`).join('')}
    </div>
    <div class="adj-row" style="margin-top:10px">
      <input class="input" id="ga-new" placeholder="或建立新群組">
      <button class="btn btn-ghost btn-sm" id="ga-create">建立並加入</button>
    </div>`;
    const ov = UI.openSheet(sym + ' 的群組', body, `<button class="btn btn-ghost" id="ga-cancel">關閉</button>`);
    ov.querySelector('#ga-cancel').addEventListener('click', UI.closeSheet);
    ov.querySelectorAll('.ga-item').forEach(it => it.addEventListener('click', () => {
      const gid = it.dataset.gid;
      const m = S.getGroupMap();
      if (gid) m[sym] = gid; else delete m[sym];
      S.setGroupMap(m);
      UI.closeSheet(); if (App.Sync) App.Sync.markDirty(); onDone && onDone();
    }));
    ov.querySelector('#ga-create').addEventListener('click', () => {
      const name = (ov.querySelector('#ga-new').value || '').trim();
      if (!name) return UI.toast('請輸入名稱', 'info');
      const gs = S.getGroups(); const g = { id: S.uuid(), name }; gs.push(g); S.setGroups(gs);
      const m = S.getGroupMap(); m[sym] = g.id; S.setGroupMap(m);
      UI.closeSheet(); if (App.Sync) App.Sync.markDirty(); onDone && onDone();
    });
  }

  /* ===================== 設定 ===================== */
  function settings(root) {
    const lastTs = S.getPricesTs();
    const rate = S.getFxRate();
    let html = `
    <div class="card setting-card">
      <div class="set-title">雲端同步（GitHub Gist）</div>
      <div class="set-row">
        <input class="input" id="sync-token" type="password" placeholder="貼上 GitHub Token（gist 權限）" value="${App.Sync && App.Sync.enabled() ? '••••••••••••' : ''}">
        <button class="btn btn-primary" id="sync-save">${App.Sync && App.Sync.enabled() ? '更新' : '啟用'}</button>
      </div>
      <div class="set-row" style="margin-top:8px">
        <button class="btn btn-ghost" id="sync-now" style="flex:1" ${App.Sync && App.Sync.enabled() ? '' : 'disabled'}>立即同步</button>
        ${App.Sync && App.Sync.enabled() ? '<button class="btn btn-ghost" id="sync-off" style="flex:1">停用同步</button>' : ''}
      </div>
      <div class="set-hint" id="sync-status">${App.Sync && App.Sync.enabled() ? '同步已啟用' : '各裝置貼同一組 token 即可自動同步同一份資料'}</div>
      <div class="set-hint"><a href="https://github.com/settings/tokens/new?scopes=gist&description=dives-sync" target="_blank" style="color:${COL.tw}">→ 點此產生 GitHub Token（已預選 gist 權限）</a></div>
    </div>

    <div class="card setting-card">
      <div class="set-title">App 鎖定</div>
      <div id="lock-body"></div>
    </div>

    <div class="card setting-card">
      <div class="set-title">顯示設定</div>
      <div class="set-sub">投資佔比基準</div>
      <div class="seg seg-wide" id="set-pct-basis">
        ${seg('group', '組內', S.getPctBasis())}${seg('invest', '投資', S.getPctBasis())}${seg('net', '淨資產', S.getPctBasis())}
      </div>
      <div class="set-hint">資產頁投資列的佔比要以「群組內／投資總額／淨資產」為分母</div>
    </div>

    <div class="card setting-card">
      <div class="set-title">資料備份</div>
      <button class="btn btn-block btn-primary" id="btn-export">匯出備份（交易 + 快照）</button>
      <label class="btn btn-block btn-ghost" for="file-import">匯入備份</label>
      <input type="file" id="file-import" accept=".csv,text/csv" style="display:none">
      <div class="set-hint">CSV 格式與 iOS app 相容，可互通資料</div>
      <button class="btn btn-block btn-ghost" id="btn-rebuild" style="margin-top:8px">重建歷史走勢圖</button>
      <div class="set-hint">用交易紀錄 + 台股／美股歷史收盤，補回過去每日資產曲線</div>
    </div>

    <div class="card setting-card">
      <div class="set-title">進階設定</div>
      <div class="set-sub">Finnhub API 金鑰（美股報價）</div>
      <input class="input" id="set-finnhub" placeholder="使用內建金鑰" value="${localStorage.getItem('dives_finnhub_key') || ''}">
      <div class="set-sub">FinMind Token（台股報價，可留空；註冊後填入可提高速率上限）</div>
      <input class="input" id="set-finmind" placeholder="免金鑰可用，額度有限" value="${localStorage.getItem('dives_finmind_token') || ''}">
      <div class="set-sub">CORS 代理（報價直連失敗時的後備）</div>
      <input class="input" id="set-proxy" value="${S.getProxy()}">
      <button class="btn btn-block btn-ghost" id="btn-adv-save">儲存進階設定</button>
    </div>

    <div class="card setting-card">
      <div class="set-title">關於</div>
      <div class="set-hint">版本：<b>${App.VERSION || '?'}</b></div>
      <div class="set-hint">最後更新報價：${lastTs ? new Date(lastTs).toLocaleString('zh-TW') : '尚未更新'}</div>
      <div class="set-hint">USD/TWD 匯率：${rate ? rate.toFixed(3) : '--'}</div>
      <div class="set-hint">交易筆數：${S.getTransactions().length}　快照：${S.getSnapshots().length}</div>
    </div>

    <div class="card setting-card">
      <div class="set-title">測試</div>
      <button class="btn btn-block btn-ghost" id="btn-seed">載入示範資料</button>
      <div class="set-hint">一鍵填入現金／負債／台美股＋加密／群組／120 天歷史（會覆蓋現有資料）</div>
    </div>

    <div class="card setting-card danger-zone">
      <div class="set-title" style="color:${UI.LOSS}">危險區域</div>
      <button class="btn btn-block btn-danger" id="btn-clear">清空所有資料</button>
    </div>`;
    root.innerHTML = `<div class="page-full">${html}</div>`;

    // ── 雲端同步 ──
    const syncStatusEl = root.querySelector('#sync-status');
    function fmtSyncStatus(s) {
      if (!s) return;
      if (s === 'syncing') { syncStatusEl.textContent = '同步中…'; return; }
      if (s.startsWith('synced:')) {
        const ts = +s.slice(7);
        syncStatusEl.textContent = ts ? ('已同步 · ' + new Date(ts).toLocaleString('zh-TW')) : '已同步';
        return;
      }
      if (s.startsWith('error:')) { syncStatusEl.textContent = '同步失敗：' + s.slice(6); return; }
    }
    if (App.Sync) App.Sync.onStatus(fmtSyncStatus);
    root.querySelector('#sync-save').addEventListener('click', async () => {
      const t = root.querySelector('#sync-token').value.trim();
      if (!t || t.startsWith('••')) { UI.toast('請貼上 GitHub Token', 'info'); return; }
      UI.toast('啟用同步中…', 'info');
      const r = await App.Sync.enable(t);
      if (r.error) { UI.toast('啟用失敗：' + r.error, 'error'); return; }
      UI.toast(r.changed ? '已從雲端載入資料' : '同步已啟用', 'success');
      App.renderCurrent();
    });
    const nowBtn = root.querySelector('#sync-now');
    if (nowBtn) nowBtn.addEventListener('click', async () => {
      const r = await App.Sync.pull();
      if (r.error) UI.toast('同步失敗：' + r.error, 'error');
      else { UI.toast('同步完成', 'success'); if (r.changed) App.renderCurrent(); }
    });
    const offBtn = root.querySelector('#sync-off');
    if (offBtn) offBtn.addEventListener('click', () =>
      UI.confirmDialog('停用同步？(本機資料會保留，雲端 Gist 不刪除)', () => {
        App.Sync.disable(); UI.toast('已停用同步', 'info'); settings(root);
      }, '停用'));
    root.querySelectorAll('#set-pct-basis .seg-btn').forEach(b => b.addEventListener('click', () => {
      S.setPctBasis(b.dataset.v);
      root.querySelectorAll('#set-pct-basis .seg-btn').forEach(x => x.classList.toggle('active', x.dataset.v === b.dataset.v));
      if (App.Sync) App.Sync.markDirty();
    }));
    root.querySelector('#btn-export').addEventListener('click', doExport);
    root.querySelector('#file-import').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const res = App.Csv.importCsv(String(reader.result));
        if (res.ok) {
          UI.toast(`匯入成功：${res.txCount} 筆交易${res.snapCount ? '、' + res.snapCount + ' 筆快照' : ''}`, 'success');
          App.afterDataChange();
          // 無快照時自動重建歷史走勢
          if (!res.snapCount) { UI.toast('重建歷史走勢中…', 'info'); await App.rebuildHistory(); UI.toast('已重建歷史走勢', 'success'); }
        } else UI.toast(res.msg || '匯入失敗', 'error');
      };
      reader.readAsText(f);
      e.target.value = '';
    });
    root.querySelector('#btn-rebuild').addEventListener('click', async () => {
      const btn = root.querySelector('#btn-rebuild');
      btn.textContent = '重建中…'; btn.disabled = true;
      const n = await App.rebuildHistory();
      btn.textContent = '重建歷史走勢圖'; btn.disabled = false;
      if (n) UI.toast(`已重建 ${n} 天歷史走勢`, 'success');
    });
    root.querySelector('#btn-adv-save').addEventListener('click', () => {
      const fk = root.querySelector('#set-finnhub').value.trim();
      const fm = root.querySelector('#set-finmind').value.trim();
      const px = root.querySelector('#set-proxy').value.trim();
      if (fk) localStorage.setItem('dives_finnhub_key', fk); else localStorage.removeItem('dives_finnhub_key');
      if (fm) localStorage.setItem('dives_finmind_token', fm); else localStorage.removeItem('dives_finmind_token');
      S.setProxy(px);
      UI.toast('已儲存進階設定', 'success');
    });
    root.querySelector('#btn-clear').addEventListener('click', () =>
      UI.confirmDialog('確定清空所有交易、損益與快照？此動作無法復原。', () => {
        S.clearAll(); UI.toast('已清空所有資料', 'info'); App.afterDataChange([]);
      }, '清空'));
    root.querySelector('#btn-seed').addEventListener('click', () =>
      UI.confirmDialog('載入示範資料？會覆蓋你目前所有資料（可先匯出備份）。', () => {
        App.seedDemo(); UI.toast('已載入示範資料', 'success');
      }, '載入'));

    // ── App 鎖定 ──
    renderLockBody(root.querySelector('#lock-body'), root);
  }

  async function renderLockBody(el, root) {
    if (!el || !App.Auth) return;
    const A = App.Auth;
    if (!A.isEnabled()) {
      el.innerHTML = `<div class="set-hint">啟用後，開啟 App 需以密碼或 Face ID 解鎖（資料仍存本機）</div>
        <button class="btn btn-block btn-primary" id="lock-enable" style="margin-top:8px">啟用 App 鎖定</button>`;
      el.querySelector('#lock-enable').addEventListener('click', () => openLockSetup(false, () => settings(root)));
      return;
    }
    const faceAvail = await A.isWebAuthnAvailable();
    const hasFace = A.hasWebAuthn();
    const t = A.getTimeout();
    el.innerHTML = `
      <div class="lock-row"><span>密碼</span><button class="btn btn-ghost btn-sm" id="lock-chpin">變更</button></div>
      ${faceAvail ? `<div class="lock-row"><span>Face ID / Touch ID</span><label class="switch"><input type="checkbox" id="lock-face" ${hasFace ? 'checked' : ''}><span></span></label></div>`
        : `<div class="set-hint">此裝置不支援生物辨識</div>`}
      <div class="lock-row"><span>自動鎖定</span>
        <select class="select" id="lock-timeout">
          <option value="0">立即</option><option value="1">1 分鐘</option>
          <option value="5">5 分鐘</option><option value="15">15 分鐘</option><option value="60">1 小時</option>
        </select></div>
      <button class="btn btn-block btn-danger" id="lock-disable" style="margin-top:10px">停用 App 鎖定</button>`;
    el.querySelector('#lock-timeout').value = String(t);
    el.querySelector('#lock-chpin').addEventListener('click', () => openLockSetup(true, () => UI.toast('密碼已變更', 'success')));
    el.querySelector('#lock-timeout').addEventListener('change', e => { A.setTimeout(+e.target.value); UI.toast('已更新自動鎖定', 'success'); });
    el.querySelector('#lock-disable').addEventListener('click', () =>
      UI.confirmDialog('停用 App 鎖定？開啟 App 將不再需要驗證。', () => { A.disable(); UI.toast('已停用 App 鎖定', 'info'); settings(root); }, '停用'));
    const faceToggle = el.querySelector('#lock-face');
    if (faceToggle) faceToggle.addEventListener('change', async () => {
      if (faceToggle.checked) {
        try { await A.registerWebAuthn(); UI.toast('已啟用 Face ID', 'success'); }
        catch (e) { faceToggle.checked = false; UI.toast('Face ID 設定取消或失敗', 'error'); }
      } else { A.disableWebAuthn(); UI.toast('已關閉 Face ID', 'info'); }
    });
  }

  // PIN 設定 / 變更：輸入兩次確認（4–6 碼）
  function openLockSetup(isChange, onDone) {
    const body = `
      <label class="fld">設定密碼（4–6 位數字）
        <input class="input" id="pin1" type="password" inputmode="numeric" maxlength="6" placeholder="輸入密碼">
      </label>
      <label class="fld">再次輸入
        <input class="input" id="pin2" type="password" inputmode="numeric" maxlength="6" placeholder="再次輸入">
      </label>
      <div class="set-hint" id="pin-err" style="color:${UI.LOSS};min-height:16px"></div>`;
    const ov = UI.openSheet(isChange ? '變更密碼' : '設定 App 鎖定密碼', body,
      `<button class="btn btn-ghost" id="pin-cancel">取消</button><button class="btn btn-primary" id="pin-ok">確認</button>`);
    const $ = s => ov.querySelector(s);
    $('#pin-cancel').addEventListener('click', UI.closeSheet);
    $('#pin1').focus();
    $('#pin-ok').addEventListener('click', async () => {
      const p1 = $('#pin1').value, p2 = $('#pin2').value;
      if (!/^\d{4,6}$/.test(p1)) { $('#pin-err').textContent = '請輸入 4–6 位數字'; return; }
      if (p1 !== p2) { $('#pin-err').textContent = '兩次輸入不一致'; return; }
      if (isChange) await App.Auth.setPin(p1);
      else await App.Auth.enable(p1);
      UI.closeSheet();
      onDone && onDone();
    });
  }

  function doExport() {
    const csv = App.Csv.exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `portfolio_backup_${U.isoDate()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    UI.toast('已匯出備份', 'success');
  }

  /* ===================== 新增/編輯交易 ===================== */
  let txState = null;
  function openTxForm(editing, presetSym, txOpts) {
    txState = {
      editing: editing || null,
      isBuy: editing ? editing.type === 'BUY' : true,
      symbol: editing ? editing.symbol : (presetSym || ''),
      feeMode: 'rate',
    };
    const ed = editing;
    const body = `
      <div class="tx-toggle">
        <button class="tt-btn buy ${txState.isBuy ? 'active' : ''}" data-buy="1">買入</button>
        <button class="tt-btn sell ${!txState.isBuy ? 'active' : ''}" data-buy="0">賣出</button>
      </div>
      <label class="fld">股票代碼
        ${ed ? `<div class="locked">${ed.symbol} <span>🔒</span></div>`
        : `<input class="input" id="tx-sym" autocomplete="off" placeholder="代碼或名稱（2330、台積電、AAPL…）" value="${presetSym || ''}">
           <div class="suggest" id="tx-suggest"></div>`}
      </label>
      <label class="fld">交易日期
        <input class="input" id="tx-date" type="date" value="${U.isoDate(ed ? new Date(ed.time) : new Date())}">
      </label>
      <div class="fld-row">
        <label class="fld">股數<input class="input" id="tx-shares" type="number" inputmode="decimal" value="${ed ? ed.shares : ''}" placeholder="0"></label>
        <label class="fld">價格<input class="input" id="tx-price" type="number" inputmode="decimal" value="${ed ? ed.price : ''}" placeholder="0.00"></label>
      </div>
      <label class="fld" id="price-cur-fld" style="display:none">計價幣別（虛擬貨幣）
        <div class="fee-mode">
          <button class="fm-btn pc-btn active" data-pc="USD">USD</button>
          <button class="fm-btn pc-btn" data-pc="TWD">台幣</button>
        </div>
        <div class="set-hint" id="price-cur-hint">在台灣交易所以台幣買入時選「台幣」，儲存時會依匯率換算為 USD</div>
      </label>
      <label class="fld">手續費
        <div class="fee-mode">
          <button class="fm-btn active" data-m="rate">費率 %</button>
          <button class="fm-btn" data-m="amount">固定金額</button>
        </div>
        <input class="input" id="tx-fee" type="number" inputmode="decimal" value="${ed ? ed.fee : '0.1425'}">
      </label>
      ${!ed ? `<label class="fld">現金帳戶（買入扣款 / 賣出存入）
        <select class="input" id="tx-acct"><option value="">不使用現金帳戶</option></select>
      </label>` : ''}
      <div class="tx-preview" id="tx-preview"></div>`;
    const footer = `<button class="btn btn-ghost" id="tx-cancel">取消</button><button class="btn btn-primary" id="tx-submit">確認</button>`;
    const ov = UI.openSheet(ed ? '編輯交易' : (txState.isBuy ? '新增買入' : '新增賣出'), body, footer);

    const $ = s => ov.querySelector(s);
    function setTitle() { ov.querySelector('.sheet-title').textContent = ed ? '編輯交易' : (txState.isBuy ? '新增買入' : '新增賣出'); }

    // 加密計價幣別（USD/台幣）：選台幣時儲存前依匯率換算為 USD
    txState.priceCur = 'USD';
    const isCryptoSel = () => ed
      ? U.normalizeMarketKey((S.metaMap()[ed.symbol] || {}).market) === U.Market.crypto
      : !!(txState.picked && txState.picked.market === 'crypto');
    function syncPriceCur() {
      const f = $('#price-cur-fld'); if (!f) return;
      const show = isCryptoSel();
      f.style.display = show ? 'block' : 'none';
      if (!show) {
        txState.priceCur = 'USD';
        ov.querySelectorAll('.pc-btn').forEach(x => x.classList.toggle('active', x.dataset.pc === 'USD'));
      }
    }
    ov.querySelectorAll('.pc-btn').forEach(b => b.addEventListener('click', () => {
      txState.priceCur = b.dataset.pc;
      ov.querySelectorAll('.pc-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      updatePreview();
    }));

    function updatePreview() {
      const sh = parseFloat($('#tx-shares').value) || 0;
      const pr = parseFloat($('#tx-price').value) || 0;
      const twdMode = isCryptoSel() && txState.priceCur === 'TWD';
      const fx = S.getFxRate() || 31.5;
      let fee = 0;
      if (txState.feeMode === 'rate') fee = sh * pr * ((parseFloat($('#tx-fee').value) || 0) / 100);
      else fee = parseFloat($('#tx-fee').value) || 0;
      if (sh > 0 && pr > 0) $('#tx-preview').innerHTML =
        `<div>${txState.isBuy ? '買入' : '賣出'}金額 <b>${twdMode ? 'NT$ ' : ''}${U.fmtKMBB(sh * pr)}</b></div>
         <div>預估手續費 <b>${U.formatPrice(fee)}</b></div>
         ${twdMode ? `<div>換算 <b>≈ $${U.formatPrice(pr / fx)} / 顆（匯率 ${fx.toFixed(3)}）</b></div>` : ''}`;
      else $('#tx-preview').innerHTML = '';
    }
    ov.querySelectorAll('.tt-btn').forEach(b => b.addEventListener('click', () => {
      txState.isBuy = b.dataset.buy === '1';
      ov.querySelectorAll('.tt-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active'); setTitle();
    }));
    ov.querySelectorAll('.fm-btn').forEach(b => b.addEventListener('click', () => {
      txState.feeMode = b.dataset.m;
      ov.querySelectorAll('.fm-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      if (txState.feeMode === 'rate' && !$('#tx-fee').value) $('#tx-fee').value = isUsSym($('#tx-sym')?.value || txState.symbol) ? '0.08' : '0.1425';
      updatePreview();
    }));
    ['#tx-shares', '#tx-price', '#tx-fee'].forEach(s => $(s).addEventListener('input', updatePreview));

    // 現金帳戶選項（依標的幣別過濾：台股=台幣、美股/加密=美金）
    function refreshAcctOptions() {
      const sel = $('#tx-acct'); if (!sel) return;
      const mk = txState.picked ? U.normalizeMarketKey(txState.picked.market)
        : U.guessMarketBySymbol(U.sanitizeSymbol($('#tx-sym') ? $('#tx-sym').value : txState.symbol));
      const wantCur = (mk === U.Market.us || mk === U.Market.crypto) ? 'USD' : 'TWD';
      const keep = sel.value;
      const opts = S.getCashAccounts().filter(a => a.currency === wantCur);
      sel.innerHTML = '<option value="">不使用現金帳戶</option>' +
        opts.map(a => `<option value="${a.id}">${a.name}（${a.currency} ${U.formatPrice(a.balance || 0)}）</option>`).join('');
      if (opts.some(a => a.id === keep)) sel.value = keep;
    }
    refreshAcctOptions(); syncPriceCur();

    // 自動完成
    if (!ed) {
      const symInput = $('#tx-sym'), sug = $('#tx-suggest');
      let timer = null;
      symInput.addEventListener('input', () => {
        const q = symInput.value.trim();
        clearTimeout(timer);
        if (!q) { sug.innerHTML = ''; return; }
        // 市場切換 → 自動更新預設費率
        if (txState.feeMode === 'rate') {
          const us = isUsSym(q);
          if (us && $('#tx-fee').value === '0.1425') $('#tx-fee').value = '0.08';
          else if (!us && $('#tx-fee').value === '0.08') $('#tx-fee').value = '0.1425';
        }
        refreshAcctOptions(); syncPriceCur();
        txState.picked = null; // 重新輸入即失效
        timer = setTimeout(async () => {
          const res = await App.Api.searchSymbols(q);
          sug.innerHTML = res.map(r => `<div class="sug-item" data-code="${r.code}" data-name="${encodeURIComponent(r.name)}" data-mk="${r.market}"${r.cgid ? ` data-cgid="${r.cgid}"` : ''}>
            <span class="sc">${r.code}</span><span class="sn">${r.name}</span><span class="sm">${U.marketLabel(r.market)}</span></div>`).join('');
          sug.querySelectorAll('.sug-item').forEach(it => it.addEventListener('click', () => {
            const name = decodeURIComponent(it.dataset.name);
            symInput.value = it.dataset.code + ' ' + name;
            sug.innerHTML = '';
            txState.picked = { code: it.dataset.code, name, market: it.dataset.mk };
            if (it.dataset.cgid) App.Api.cacheCgId(it.dataset.code, it.dataset.cgid);
            if (txState.feeMode === 'rate') $('#tx-fee').value = it.dataset.mk === 'crypto' ? '0.1' : (it.dataset.mk === 'us' ? '0.08' : '0.1425');
            refreshAcctOptions(); syncPriceCur();
            $('#tx-shares').focus();
          }));
        }, 220);
      });
    }
    updatePreview();

    $('#tx-cancel').addEventListener('click', UI.closeSheet);
    $('#tx-submit').addEventListener('click', () => {
      const sh = parseFloat($('#tx-shares').value);
      let pr = parseFloat($('#tx-price').value);
      const dateVal = $('#tx-date').value;
      const time = dateVal ? new Date(dateVal + 'T12:00:00+08:00').getTime() : Date.now();
      // 加密以台幣計價 → 依匯率換算 USD 儲存（固定金額手續費同步換算）
      const twdMode = isCryptoSel() && txState.priceCur === 'TWD';
      const fx = S.getFxRate() || 31.5;
      if (twdMode && pr > 0) pr = pr / fx;
      let fee = 0;
      if (txState.feeMode === 'rate') fee = (sh || 0) * (pr || 0) * ((parseFloat($('#tx-fee').value) || 0) / 100);
      else { fee = parseFloat($('#tx-fee').value) || 0; if (twdMode) fee = fee / fx; }

      if (ed) {
        const res = C.updateTransaction(ed.id, { type: txState.isBuy ? 'BUY' : 'SELL', shares: sh, price: pr, fee, time });
        if (!res.ok) return UI.toast(res.msg, 'info');
        UI.closeSheet(); App.afterDataChange([res.symbol]);
      } else {
        const symbolInput = $('#tx-sym').value;
        // 從建議清單選取者，帶入明確市場與名稱（加密貨幣必要）
        const pk = (txState.picked && U.sanitizeSymbol(symbolInput) === txState.picked.code) ? txState.picked : null;
        const accountId = $('#tx-acct') ? ($('#tx-acct').value || undefined) : undefined;
        const res = C.addTransaction({ symbolInput, type: txState.isBuy ? 'BUY' : 'SELL', shares: sh, price: pr, fee, market: pk && pk.market, name: pk && pk.name, accountId });
        if (!res.ok) return UI.toast(res.msg, 'info');
        if (txOpts && txOpts.onAdded) txOpts.onAdded(res.symbol); // 例：群組頁＋ → 自動歸入該群組
        UI.closeSheet(); App.afterDataChange([res.symbol]);
      }
    });

    // 編輯模式提供刪除
    if (ed) {
      const foot = ov.querySelector('.sheet-foot');
      const del = document.createElement('button');
      del.className = 'btn btn-danger'; del.textContent = '刪除';
      del.addEventListener('click', () => UI.confirmDialog('確定刪除這筆交易？', () => {
        const sym = ed.symbol; C.deleteTransaction(ed.id); UI.closeSheet(); App.afterDataChange([sym]);
      }, '刪除'));
      foot.insertBefore(del, foot.firstChild);
    }
  }
  function isUsSym(s) { return U.guessMarketBySymbol(U.sanitizeSymbol(s)) === U.Market.us; }

  return { portfolio, history, report, assets, settings, openTxForm };
})();
