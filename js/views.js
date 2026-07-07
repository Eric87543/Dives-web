/* =========================================================================
 * views.js — 四個分頁的畫面渲染 + 新增/編輯交易表單
 * ======================================================================= */
window.App = window.App || {};

App.Views = (function () {
  const U = App.Util, S = App.Store, C = App.Calc, UI = App.UI;
  const COL = { tw: '#E8823C', us: '#4A82C8', crypto: '#9B59D0', total: '#0F766E' }; // 台股橙、美股藍、加密紫

  // 共用：刷新後重繪目前分頁
  function rerender() { App.renderCurrent(); }

  // ---- 隱藏金額（眼睛）：本機偏好，隱藏時把金額數字換成 ••（僅本機，不上雲）----
  function eyeBtnHtml(id) {
    const hidden = S.getPrivacy();
    const icon = hidden
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c6 0 9.5 6 9.5 6a15.8 15.8 0 0 1-3.2 3.7M6.1 6.1A15.9 15.9 0 0 0 2.5 11s3.5 6 9.5 6a9.6 9.6 0 0 0 4-.9"/><path d="M9.6 9.6a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/></svg>`;
    return `<button class="nw-eye" id="${id}" aria-label="${hidden ? '顯示金額' : '隱藏金額'}">${icon}</button>`;
  }
  // 隱藏模式下只遮住淨資產／總倉位（Hero 大數字），換成四個米字號；其餘金額不隱藏
  function maskAmounts(root) {
    if (!S.getPrivacy()) return;
    root.querySelectorAll('.nw-num').forEach(el => { el.textContent = '＊＊＊＊'; });
  }

  /* ===================== 投資（市場分類卡，沿用資產頁風格）===================== */
  // pf.open：各市場展開狀態（可同時展開多個）；預設全收合。排序固定依市值（大→小）
  const pf = { open: null, catChart: null };
  function resetPortfolioNav() { pf.catChart = null; }

  // 比例圓圈（環形進度）：群組／持倉／現金帳戶用；arc + 中央百分比，顏色隨類別/市場
  function pctRingBadge(pct, color, size) {
    size = size || 40;
    const p = Math.max(0, Math.min(100, pct || 0));
    const txt = p >= 9.95 ? String(Math.round(p)) : (p > 0 ? p.toFixed(1) : '0');
    const label = txt + '%';
    const fs = label.length >= 5 ? 8.5 : label.length >= 4 ? 9.5 : 11;
    const r = 15.5, C = 2 * Math.PI * r, off = C * (1 - p / 100);
    return `<svg class="pct-ring" viewBox="0 0 36 36" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="18" cy="18" r="${r}" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="3.2"/>
      <circle cx="18" cy="18" r="${r}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 18 18)"/>
      <text x="18" y="18" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${color}">${label}</text>
    </svg>`;
  }

  // 重新整理鈕（只用於資產/投資頁；置於 ＋ 的右上方）
  function refreshBtnHtml() {
    return `<button class="ref-btn" id="refresh-btn" aria-label="重新整理"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.7-3.3M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.7 3.3M20 19v-4h-4"/></svg></button>`;
  }
  // ＋ 上方放 ⟳（垂直堆疊、右對齊，不重疊）
  function addWithRefreshHtml(addId, addLabel) {
    return `<div class="add-wrap">
      ${refreshBtnHtml()}
      <button class="nw-add" id="${addId}" aria-label="${addLabel}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg></button>
    </div>`;
  }
  function bindRefresh(root) {
    const b = root.querySelector('#refresh-btn');
    if (b) b.addEventListener('click', () => App.refresh(undefined, true));
  }

  // 頂端下拉並「維持 1 秒」→ 觸發更新（避免誤觸；資產/投資頁）
  function attachPullRefresh(scrollEl) {
    if (!scrollEl) return;
    const ind = document.createElement('div');
    ind.className = 'pull-refresh';
    ind.innerHTML = `<span class="pr-icon">↓</span><span class="pr-text">下拉更新</span>`;
    scrollEl.insertBefore(ind, scrollEl.firstChild); // 置於最上方
    const TH = 66, HOLD = 1000;
    let startY = 0, pulling = false, dist = 0, timer = null, fired = false;
    const txt = s => { ind.querySelector('.pr-text').textContent = s; };
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const reset = () => { clearTimer(); fired = false; ind.classList.remove('ready'); ind.style.height = '0px'; ind.querySelector('.pr-icon').textContent = '↓'; txt('下拉更新'); };

    scrollEl.addEventListener('touchstart', e => {
      pulling = scrollEl.scrollTop <= 0; // 捲到最上方才啟用
      if (pulling) { startY = e.touches[0].clientY; dist = 0; fired = false; }
    }, { passive: true });
    scrollEl.addEventListener('touchmove', e => {
      if (!pulling || fired) return;
      dist = e.touches[0].clientY - startY; // 正 = 下拉
      if (dist > 0 && scrollEl.scrollTop <= 0) {
        e.preventDefault();
        ind.style.height = Math.min(dist * 0.5, 56) + 'px';
        const past = dist >= TH;
        if (past && !timer) {
          timer = setTimeout(() => {                 // 維持 1 秒才觸發（不顯示提示文字）
            timer = null; fired = true;
            ind.querySelector('.pr-icon').textContent = '⟳';
            txt('更新中…'); ind.style.height = '44px';
            App.refresh(undefined, true);
          }, HOLD);
        } else if (!past && timer) { clearTimer(); }
      } else { clearTimer(); ind.style.height = '0px'; }
    }, { passive: false });
    const end = () => {
      if (!pulling) return;
      pulling = false;
      if (!fired) reset(); // 維持不足 1 秒就放開 → 收回、不更新
      dist = 0;
    };
    scrollEl.addEventListener('touchend', end);
    scrollEl.addEventListener('touchcancel', end);
  }

  function portfolio(root) {
    if (pf.catChart) return metricChartPage(root, pf.catChart, () => { pf.catChart = null; portfolio(root); });
    const positions = C.buildPositions();
    const summary = C.buildSummary(positions);
    const rate = S.getFxRate() || 31.5;
    const fmtPctBadge = v => (v >= 9.95 ? Math.round(v) : v.toFixed(v >= 1 ? 0 : 1)) + '%';

    const mkKey = p => { const m = U.normalizeMarketKey(p.market); return m === U.Market.us ? 'us' : m === U.Market.crypto ? 'crypto' : 'tw'; };
    const mvTwd = p => mkKey(p) === 'tw' ? p.marketValue : p.marketValue * rate;
    const convOf = p => mkKey(p) === 'tw' ? 1 : rate;
    const byMk = { tw: [], us: [], crypto: [] };
    for (const p of positions) byMk[mkKey(p)].push(p);
    const MKTS = [
      { key: 'us', name: '美股', color: COL.us, oc: 'oc-us' },
      { key: 'tw', name: '台股', color: COL.tw, oc: 'oc-tw' },
      { key: 'crypto', name: '加密貨幣', color: COL.crypto, oc: 'oc-cr' },
    ];
    const totalAll = summary.totalMarketValueTwd || 0;
    const isOpen = key => !!(pf.open && pf.open[key]); // 預設全收合

    // Hero：總倉位 + 今日漲跌（同資產頁淨資產樣式；捲動時固定於頂部）
    const day = summary.dayPnl || 0;
    const prevTot = totalAll - day;
    const dayPct = Math.abs(prevTot) > 1e-9 ? day / Math.abs(prevTot) * 100 : 0;
    const arrow = day > 0 ? '▲' : day < 0 ? '▼' : '–';
    let topHtml = `<div class="nw-hero">
      <div>
        <div class="nw-cap">總倉位 (TWD)${eyeBtnHtml('pf-eye')}</div>
        <div class="nw-num">${U.fmtWhole(totalAll)}</div>
        <div class="nw-day" style="color:${UI.pnlColor(day)}">${arrow} ${U.fmtWhole(Math.abs(day))} (${Math.abs(dayPct).toFixed(2)}%)</div>
      </div>
      <div class="nw-btns">
        ${addWithRefreshHtml('pf-add-btn', '新增交易')}
      </div>
    </div>`;

    // 市場卡（可同時展開多個；空市場不顯示）
    let html = '';
    if (!positions.length) html += `<div class="empty" style="padding:48px 16px">尚無持倉，點右上 ＋ 新增交易</div>`;
    for (const M of MKTS) {
      const list = byMk[M.key];
      if (!list.length) continue;
      list.sort((a, b) => mvTwd(b) - mvTwd(a));
      const tot = list.reduce((s, p) => s + mvTwd(p), 0);
      const pct = totalAll > 1e-9 ? tot / totalAll * 100 : 0;
      // 該市場當日漲跌（TWD）＋比例（相對前一日市值）
      // twday 模式：台股白天美股未開盤 → 美股卡當日漲跌顯示 0（與 Hero 一致）
      const dayOn = S.getDayMode() !== 'twday' || M.key !== 'us' || U.usCountsTowardToday();
      const dayChg = dayOn ? list.reduce((s, p) => s + (p.dailyChange || 0) * p.shares * convOf(p), 0) : 0;
      const prevMv = tot - dayChg;
      const dayChgPct = Math.abs(prevMv) > 1e-9 ? dayChg / Math.abs(prevMv) * 100 : 0;
      const dArrow = dayChg > 0 ? '▲' : dayChg < 0 ? '▼' : '–';
      const open = isOpen(M.key);
      const names = [...list].sort((a, b) => mvTwd(b) - mvTwd(a)).slice(0, 4).map(p => p.name !== p.symbol ? p.name : p.symbol).join('、');
      html += `<div class="card as-cat">
        <div class="as-head ${open ? 'open ' + M.oc : ''}" data-mk="${M.key}" style="--cc:${M.color}">
          <div class="as-hleft">
            <div class="mk-nameline"><span class="as-name">${M.name}</span>${open ? `<button class="as-htrend" data-trend="${M.key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16h16"/><path d="M7 14l3.5-3.5 3 2.5L19 8"/></svg></button>` : ''}<span class="mk-count">${list.length} 檔 · ${pct.toFixed(0)}%</span></div>
            ${!open ? `<span class="as-hsummary">${names}</span>` : ''}
          </div>
          <div class="as-hright">
            <span class="as-total" style="color:${M.color}">${U.fmtWhole(tot)}</span>
            <span class="as-hchg" style="color:${UI.pnlColor(dayChg)}">${dArrow} ${U.fmtWhole(Math.abs(dayChg))} (${Math.abs(dayChgPct).toFixed(2)}%)</span>
          </div>
        </div>`;
      if (open) {
        html += `<div class="as-body">`;
        for (const p of list) {
          const rp = totalAll > 1e-9 ? mvTwd(p) / totalAll * 100 : 0;
          const cur = M.key === 'tw' ? '' : '$';
          const price = p.lastPrice != null ? p.lastPrice : p.avgCost;
          const fp = v => { const s = U.formatPrice(v); return s.endsWith('.00') ? s.slice(0, -3) : s; }; // 去除整數的 .00
          const chg = p.dailyChangePct;
          const chgHtml = chg != null ? ` <span style="color:${UI.pnlColor(chg)}">${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(2)}%</span>` : '';
          const pnlPct = p.cost > 1e-9 ? p.unrealizedPnl / p.cost * 100 : 0;
          html += `<div class="as-row pf-row" data-sym="${p.symbol}">
            ${pctRingBadge(rp, M.color, 38)}
            <div class="as-main">
              <div class="as-title pf-title"><span class="pf-sym">${dispName(p.symbol)}</span><span class="pf-price">${cur}${fp(price)}${chgHtml}</span></div>
              <div class="as-sub">${U.formatShares(p.shares)}${shareUnit(p.market)} · 均 ${cur}${fp(p.avgCost)}</div>
            </div>
            <div class="pf-val">
              <div class="pf-mv">NT$ ${U.fmtKMBB(mvTwd(p))}</div>
              <div class="pf-pnl" style="color:${UI.pnlColor(p.unrealizedPnl)}">${U.fmtBannerSigned(p.unrealizedPnl * convOf(p))} (${U.fmtPct(pnlPct)})</div>
            </div>
          </div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }

    // 上方（hero+統計+排序）固定，市場卡清單獨立捲動
    root.innerHTML = `<div class="page"><div class="page-top">${topHtml}</div><div class="page-list">${html}</div></div>`;
    attachPullRefresh(root.querySelector('.page-list'));

    // 事件
    bindRefresh(root);
    const addBtn = root.querySelector('#pf-add-btn');
    if (addBtn) addBtn.addEventListener('click', () => openTxForm(null));
    const pfEye = root.querySelector('#pf-eye');
    if (pfEye) pfEye.addEventListener('click', () => { S.setPrivacy(!S.getPrivacy()); portfolio(root); });
    root.querySelectorAll('.as-head[data-mk]').forEach(h => h.addEventListener('click', () => {
      if (!pf.open) pf.open = {}; // 從「全收合」起手
      const k = h.dataset.mk;
      pf.open[k] = !pf.open[k];
      portfolio(root);
    }));
    root.querySelectorAll('.as-htrend[data-trend]').forEach(t => t.addEventListener('click', e => {
      e.stopPropagation(); // 不觸發標頭收合
      pf.catChart = t.dataset.trend; portfolio(root);
    }));
    root.querySelectorAll('.pf-row').forEach(r =>
      r.addEventListener('click', () => openSymbolActions(r.dataset.sym)));
    maskAmounts(root);
  }

  function seg(v, label, cur) {
    return `<button class="seg-btn ${cur === v ? 'active' : ''}" data-v="${v}">${label}</button>`;
  }

  // 股數單位：加密貨幣不以「股」計 → 留空（只顯示數量）
  function shareUnit(market) {
    return U.normalizeMarketKey(market) === U.Market.crypto ? '' : ' 股';
  }

  // 顯示名稱：自訂 alias 優先；否則台股用名稱、美股/加密用代號
  function defaultName(sym) {
    const m = S.metaMap()[sym] || {};
    const mk = U.normalizeMarketKey(m.market || U.guessMarketBySymbol(sym));
    if (mk === U.Market.us || mk === U.Market.crypto) return sym;
    return m.name && m.name !== sym ? m.name : sym;
  }
  function dispName(sym) {
    const m = S.metaMap()[sym] || {};
    return m.alias || defaultName(sym);
  }
  function openRename(sym) {
    const m = S.metaMap()[sym] || {};
    const mkLabel = U.marketLabel(U.normalizeMarketKey(m.market || U.guessMarketBySymbol(sym)));
    const def = defaultName(sym);
    const esc = s => (s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const ov = UI.openSheet('重新命名',
      `<div style="padding:2px 2px 4px">
        <div class="set-hint" style="margin-bottom:8px">${sym} · ${mkLabel}</div>
        <input class="input" id="rn-input" value="${esc(m.alias)}" placeholder="${esc(def)}" autocomplete="off">
        <div class="set-hint" style="margin-top:7px">留空 = 回到預設（${esc(def)}）</div>
      </div>`,
      `<button class="btn btn-ghost" id="rn-cancel">取消</button><button class="btn btn-primary" id="rn-save">儲存</button>`);
    const input = ov.querySelector('#rn-input');
    input.focus();
    const save = () => { S.setAlias(sym, input.value.trim()); if (App.Sync) App.Sync.markDirty(); UI.closeSheet(); App.renderCurrent(); };
    ov.querySelector('#rn-cancel').addEventListener('click', UI.closeSheet);
    ov.querySelector('#rn-save').addEventListener('click', save);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  }

  function openSymbolActions(sym) {
    const txs = S.getTransactions().filter(t => t.symbol === sym).sort((a, b) => b.time - a.time);
    let rows = txs.map(t => `<div class="tx-mini" data-id="${t.id}">
      <span class="${t.type === 'BUY' ? 'buy' : 'sell'}">${t.type === 'BUY' ? '買' : '賣'}</span>
      <span>${U.formatShares(t.shares)} @ ${U.formatPrice(t.price)}</span>
      <span class="tx-date">${U.isoDate(new Date(t.time))}</span>
      <button class="link-edit" data-id="${t.id}">編輯</button>
    </div>`).join('');
    const ov = UI.openSheet(dispName(sym) + ' 交易明細', rows || '<p>無交易</p>',
      `<button class="btn btn-ghost" id="rename-sym">重新命名</button><button class="btn btn-ghost" id="add-more">新增交易</button><button class="btn btn-danger" id="del-sym">刪除此檔</button>`);
    ov.querySelector('#rename-sym').addEventListener('click', () => openRename(sym));
    ov.querySelector('#del-sym').addEventListener('click', () =>
      UI.confirmDialog(`確定刪除 ${sym} 的所有交易與損益？`, () => { C.deleteSymbol(sym); UI.closeSheet(); App.afterDataChange([]); }, '刪除'));
    ov.querySelector('#add-more').addEventListener('click', () => { UI.closeSheet(); openTxForm(null, sym); });
    ov.querySelectorAll('.link-edit').forEach(b => b.addEventListener('click', () => {
      const tx = S.getTransactions().find(t => t.id === b.dataset.id);
      UI.closeSheet(); openTxForm(tx);
    }));
  }

  /* ===================== 歷史 ===================== */
  // txFilter/search：交易紀錄篩選；statScope：報表統計卡的「今年/歷史」切換
  const hist = { txFilter: 'all', search: '', type: 'all', from: null, to: null }; // type:all|buy|sell；from/to:日期區間

  // 歷史頁：僅交易紀錄（統計已移至報表；趨勢已由各類別走勢圖取代）
  function history(root) {
    root.innerHTML = `<div class="page">
      <div class="page-top" id="hist-fixed"></div>
      <div class="page-list" id="hist-scroll"></div>
    </div>`;
    histTx(root.querySelector('#hist-fixed'), root.querySelector('#hist-scroll'));
  }

  // 統計卡片（供報表頁使用）；scope.level: 'all'（全部歷史）| 'year' | 'month'
  //   all：自投入本金以來 + 區間獲利之最(含年度) + 單筆交易之最 + 目前持倉之最
  //   year/month：本期損益 + 該區間獲利之最 + 該區間單筆交易之最（依 from~to 過濾）
  const GRAN_LABEL = { day: '單日', week: '單週', month: '單月', year: '年度' };
  function statsCardsHtml(scope) {
    const level = (scope && scope.level) || 'all';
    const sf = v => v == null ? '—' : (v >= 0 ? '+' : '−') + 'NT$ ' + U.fmtKMBB(Math.abs(v));
    const col = v => UI.pnlColor(v || 0);
    const pctTxt = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    // 區間日期文字：日=M/D、週=該週 M/D、月=YYYY/M、年=YYYY
    const pdate = (g, iso) => {
      if (!iso) return '';
      const p = iso.split('-');
      return g === 'month' ? `${p[0]}/${+p[1]}` : g === 'year' ? p[0] : `${+p[1]}/${+p[2]}`;
    };
    const pcell = (g, e) => e ? `<div class="pg-amt" style="color:${col(e.amount)}">${sf(e.amount)}</div><div class="pg-date">${pdate(g, e.date)}</div>` : '<span class="pg-none">—</span>';
    const perfCard = (period, grans) => {
      const grid = grans.map(g =>
        `<div class="pg-lbl">${GRAN_LABEL[g]}</div><div class="pg-cell">${pcell(g, period[g].best)}</div><div class="pg-cell">${pcell(g, period[g].worst)}</div>`
      ).join('');
      return `<div class="card stats-card">
        <div class="stats-title">區間獲利之最</div>
        <div class="perf-grid"><div class="pg-head"></div><div class="pg-head">最大獲利</div><div class="pg-head">最大虧損</div>${grid}</div>
      </div>`;
    };
    // 單筆交易 / 持倉 之最：一列（左標籤、右金額+副標）
    const row = (label, e, opts) => {
      opts = opts || {};
      if (!e) return `<div class="stat-row"><div class="stat-lbl">${label}</div><div class="stat-val"><div class="stat-amt" style="color:var(--sub)">—</div></div></div>`;
      const amt = opts.pctMain ? pctTxt(e.pct) : sf(e.amount);
      let sub;
      if (opts.trade) {
        const usd = e.market === U.Market.us || e.market === U.Market.crypto;
        sub = `${e.symbol} · ${U.formatShares(e.shares)}${shareUnit(e.market)} @ ${usd ? '$' : ''}${U.formatPrice(e.price)} · ${e.date}`;
      } else {
        sub = `${e.symbol}${e.name && e.name !== e.symbol ? ' ' + e.name : ''} · ${opts.pctMain ? sf(e.amount) : pctTxt(e.pct)}`;
      }
      return `<div class="stat-row"><div class="stat-lbl">${label}</div>
        <div class="stat-val"><div class="stat-amt" style="color:${col(opts.pctMain ? e.pct : e.amount)}">${amt}</div><div class="stat-sub">${sub}</div></div></div>`;
    };
    const tradeCard = (best, worst) => `<div class="card stats-card">
      <div class="stats-title">單筆交易之最</div>
      ${row('最賺一筆', best, { trade: true })}
      ${row('最賠一筆', worst, { trade: true })}
    </div>`;

    if (level === 'all') {
      const st = C.tradingStats();
      const sm = C.buildSummary(C.buildPositions()); // 累計報酬（vs 投入本金）
      return `
        <div class="card stats-card">
          <div class="stats-title">自投入本金以來</div>
          <div class="tr-row">
            <div class="tr-amt" style="color:${col(sm.totalPnl)}">${sf(sm.totalPnl)}</div>
            <div class="tr-pct" style="color:${col(sm.totalReturnPct || 0)}">${pctTxt(sm.totalReturnPct || 0)}</div>
          </div>
          <div class="tr-grid">
            <div class="trg"><span class="trg-k">投入本金</span><span class="trg-v">NT$ ${U.fmtKMBB(sm.totalCostBasisTwd)}</span></div>
            <div class="trg"><span class="trg-k">目前市值</span><span class="trg-v">NT$ ${U.fmtKMBB(sm.totalMarketValueTwd)}</span></div>
            <div class="trg"><span class="trg-k">未實現</span><span class="trg-v" style="color:${col(sm.totalUnrealizedPnl)}">${sf(sm.totalUnrealizedPnl)}</span></div>
            <div class="trg"><span class="trg-k">已實現</span><span class="trg-v" style="color:${col(sm.totalRealizedPnl)}">${sf(sm.totalRealizedPnl)}</span></div>
          </div>
        </div>
        ${perfCard(st.period.all, ['day', 'week', 'month', 'year'])}
        ${tradeCard(st.bestTrade, st.worstTrade)}
        <div class="card stats-card">
          <div class="stats-title">目前持倉之最</div>
          ${row('未實現獲利王', st.topGain)}
          ${row('未實現虧損王', st.topLoss)}
          ${row('報酬率最高', st.topPct, { pctMain: true })}
        </div>`;
    }
    const grans = level === 'year' ? ['day', 'week', 'month'] : ['day', 'week'];
    const st = C.scopedStats(scope.from, scope.to, grans);
    return `
      <div class="card stats-card">
        <div class="stats-title">本期損益</div>
        <div class="tr-row">
          <div class="tr-amt" style="color:${col(st.periodPnl)}">${sf(st.periodPnl)}</div>
          <div class="tr-pct" style="color:${col(st.periodReturnPct || 0)}">${pctTxt(st.periodReturnPct || 0)}</div>
        </div>
      </div>
      ${perfCard(st.period, grans)}
      ${tradeCard(st.bestTrade, st.worstTrade)}`;
  }


  function histTx(fixedEl, scrollEl) {
    const mmap = S.metaMap();
    const rate = S.getFxRate() || 31.5;
    const isUsdMk = mk => mk === U.Market.us || mk === U.Market.crypto;
    let txs = S.getTransactions().slice().sort((a, b) => b.time - a.time);
    const q = hist.search.trim().toUpperCase();
    txs = txs.filter(t => {
      if (hist.type === 'buy' && t.type !== 'BUY') return false;
      if (hist.type === 'sell' && t.type !== 'SELL') return false;
      const m = U.normalizeMarketKey(mmap[t.symbol]?.market || U.guessMarketBySymbol(t.symbol));
      if (hist.txFilter === 'tw' && (m === U.Market.us || m === U.Market.crypto)) return false;
      if (hist.txFilter === 'us' && m !== U.Market.us) return false;
      if (hist.txFilter === 'crypto' && m !== U.Market.crypto) return false;
      const d = U.isoDate(new Date(t.time));
      if (hist.from && d < hist.from) return false;
      if (hist.to && d > hist.to) return false;
      if (q && !(t.symbol.includes(q) || (mmap[t.symbol]?.name || '').toUpperCase().includes(q))) return false;
      return true;
    });

    // 搜尋 + 漏斗篩選（買賣／市場／時間區間 收在漏斗面板）
    const filterOn = hist.type !== 'all' || hist.txFilter !== 'all' || hist.from || hist.to;
    fixedEl.innerHTML = `<div class="tx-bar">
      <input class="input search" id="tx-search" placeholder="搜尋代碼或名稱" value="${hist.search}">
      <button class="tx-funnel${filterOn ? ' on' : ''}" id="tx-funnel" aria-label="篩選"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg></button>
    </div>`;

    const rzByKey = {};
    for (const r of S.getRealized()) rzByKey[r.symbol + '@' + r.time] = r;
    const toTwd = hist.txFilter === 'all'; // 全部市場 → 金額一律換算台幣

    let listHtml = `<div class="card tx-list">`;
    if (!txs.length) listHtml += `<div class="empty">${filterOn || q ? '無符合篩選的交易' : '無交易紀錄'}</div>`;
    for (const t of txs) {
      const name = mmap[t.symbol]?.name || t.symbol;
      const isUsd = isUsdMk(U.normalizeMarketKey(mmap[t.symbol]?.market || U.guessMarketBySymbol(t.symbol)));
      const conv = (isUsd && toTwd) ? rate : 1;
      const cur = (isUsd && !toTwd) ? '$' : 'NT$';
      let valHtml;
      if (t.type === 'SELL') {
        const rz = rzByKey[t.symbol + '@' + t.time];
        if (rz) {
          const pnl = rz.realizedPnl * conv;
          const base = rz.avgCost * rz.shares;
          const pct = base > 1e-9 ? rz.realizedPnl / base * 100 : 0;
          valHtml = `<div class="tx-amt" style="color:${UI.pnlColor(pnl)}">${pnl >= 0 ? '+' : '−'}${cur} ${U.fmtKMBB(Math.abs(pnl))}</div><div class="tx-cap" style="color:${UI.pnlColor(pnl)}">獲利 ${U.fmtPct(pct)}</div>`;
        } else {
          valHtml = `<div class="tx-amt">${cur} ${U.fmtKMBB(t.shares * t.price * conv)}</div><div class="tx-cap">賣出</div>`;
        }
      } else {
        const cost = (t.shares * t.price + (t.fee || 0)) * conv;
        valHtml = `<div class="tx-amt">${cur} ${U.fmtKMBB(cost)}</div><div class="tx-cap">成本</div>`;
      }
      listHtml += `<div class="tx-row" data-id="${t.id}">
        <span class="tx-type ${t.type === 'BUY' ? 'buy' : 'sell'}">${t.type === 'BUY' ? '買入' : '賣出'}</span>
        <div class="tx-main">
          <div class="tx-sym">${t.symbol} <span class="h-name">${name}</span></div>
          <div class="tx-sub">${U.formatShares(t.shares)}${shareUnit(mmap[t.symbol]?.market)} @ ${U.formatPrice(t.price)} · ${U.isoDate(new Date(t.time))}</div>
        </div>
        <div class="tx-meta">${valHtml}</div>
      </div>`;
    }
    listHtml += `</div>`;
    scrollEl.innerHTML = listHtml;

    const se = fixedEl.querySelector('#tx-search');
    se.addEventListener('input', e => { hist.search = e.target.value; });
    se.addEventListener('change', () => histTx(fixedEl, scrollEl));
    fixedEl.querySelector('#tx-funnel').addEventListener('click', () => openHistFilter(fixedEl, scrollEl));
    scrollEl.querySelectorAll('.tx-row').forEach(r => r.addEventListener('click', () => {
      const tx = S.getTransactions().find(t => t.id === r.dataset.id);
      if (tx) openTxForm(tx);
    }));
  }

  // 歷史篩選面板（漏斗）：買賣類型 / 市場 / 時間區間
  function openHistFilter(fixedEl, scrollEl) {
    let tType = hist.type, tMkt = hist.txFilter;
    const segRow = (id, cur, opts) => `<div class="seg seg-wide" id="${id}">${opts.map(([v, l]) => seg(v, l, cur)).join('')}</div>`;
    const body = `
      <div class="flt-grp"><div class="flt-lbl">買賣類型</div>${segRow('flt-type', tType, [['all', '全部'], ['buy', '買入'], ['sell', '賣出']])}</div>
      <div class="flt-grp"><div class="flt-lbl">市場</div>${segRow('flt-mkt', tMkt, [['all', '全部'], ['tw', '台股'], ['us', '美股'], ['crypto', '加密']])}</div>
      <div class="flt-grp"><div class="flt-lbl">時間區間</div><div class="range-dates"><input type="date" class="input" id="flt-from" value="${hist.from || ''}"><span>至</span><input type="date" class="input" id="flt-to" value="${hist.to || ''}"></div></div>`;
    const ov = UI.openSheet('篩選', body, `<button class="btn btn-ghost" id="flt-reset">重設</button><button class="btn btn-primary" id="flt-apply">套用</button>`);
    const bindSeg = (id, setv) => ov.querySelectorAll(`#${id} .seg-btn`).forEach(b => b.addEventListener('click', () => {
      setv(b.dataset.v);
      ov.querySelectorAll(`#${id} .seg-btn`).forEach(x => x.classList.toggle('active', x === b));
    }));
    bindSeg('flt-type', v => tType = v);
    bindSeg('flt-mkt', v => tMkt = v);
    ov.querySelector('#flt-reset').addEventListener('click', () => {
      hist.type = 'all'; hist.txFilter = 'all'; hist.from = null; hist.to = null;
      UI.closeSheet(); histTx(fixedEl, scrollEl);
    });
    ov.querySelector('#flt-apply').addEventListener('click', () => {
      hist.type = tType; hist.txFilter = tMkt;
      let a = ov.querySelector('#flt-from').value || null, b = ov.querySelector('#flt-to').value || null;
      if (a && b && a > b) { const x = a; a = b; b = x; }
      hist.from = a; hist.to = b;
      UI.closeSheet(); histTx(fixedEl, scrollEl);
    });
  }

  /* ===================== 報表 ===================== */
  const rep = { mode: 'yearly', year: new Date().getFullYear(), month: null, asc: false, statsPage: false }; // 鑽取：年→月→日；列表預設倒序（新→舊）
  function resetReportNav() { rep.mode = 'yearly'; rep.month = null; rep.statsPage = false; } // 進報表一律回年報表
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
        const r = mkReport(y, byYear[y], i > 0 ? byYear[years[i - 1]] : null, cl);
        r.key = +y; return r;
      });
    }
    if (rep.mode === 'monthly') {
      const ys = String(rep.year);
      const byMonth = {};
      for (const s of snaps) if (s.date.slice(0, 4) === ys) byMonth[s.date.slice(5, 7)] = s;
      const prevYearLast = snaps.filter(s => s.date.slice(0, 4) === String(rep.year - 1)).pop() || null;
      const months = Object.keys(byMonth).sort();
      return months.map((m, i) => {
        const r = mkReport(+m + '月', byMonth[m], i === 0 ? prevYearLast : byMonth[months[i - 1]], cl);
        r.key = +m; return r;
      });
    }
    // daily：指定年月的每日損益 = 當日累計 − 前一日（台股日為界）
    const ym = String(rep.year) + '-' + String(rep.month).padStart(2, '0');
    const inMonth = snaps.filter(s => s.date.slice(0, 7) === ym);
    const prevBefore = snaps.filter(s => s.date < ym + '-01').pop() || null;
    return inMonth.map((s, i) => {
      const r = mkReport(+s.date.slice(5, 7) + '/' + +s.date.slice(8, 10), s, i === 0 ? prevBefore : inMonth[i - 1], cl);
      r.key = +s.date.slice(8, 10); return r;
    });
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
    if (rep.statsPage) return reportStatsPage(root);
    const cl = C.cashLiabTwd();
    const allSnaps = S.getSnapshots().slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const reports = periodReports();

    // 固定頂部：年報表無返回；月/日報表有返回鈕 + 標題（月/日再加本期損益 Hero）
    let topHtml;
    if (rep.mode === 'yearly') {
      topHtml = `<div class="rep-head"><div class="rep-head-title">年報表</div></div>`;
      // 累計概況：Hero 累計損益 + 2×2 資訊卡（累計損益 / 目前市值 / 未實現 / 已實現）
      if (allSnaps.length) {
        const last = allSnaps[allSnaps.length - 1];
        const hero = mkReport('', last, null, cl);
        const mc = (k, v, color) => `<div class="rep-mc"><div class="rep-mc-k">${k}</div><div class="rep-mc-v"${color ? ` style="color:${color}"` : ''}>${v}</div></div>`;
        topHtml += `<div class="rep-hero">
          <div class="nw-cap">累計損益</div>
          <div class="nw-num" style="color:${UI.pnlColor(hero.periodPnl)}">${U.fmtBannerSigned(hero.periodPnl)}</div>
          <div class="nw-day" style="color:${UI.pnlColor(hero.periodReturnPct || 0)}">報酬率 ${U.fmtPct(hero.periodReturnPct)}</div>
        </div>
        <div class="rep-mc-grid">
          ${mc('累計損益', U.fmtBannerSigned(last.totalPnl), UI.pnlColor(last.totalPnl))}
          ${mc('目前市值', 'NT$ ' + U.fmtKMBB(last.totalMarketValueTwd || 0))}
          ${mc('未實現', U.fmtBannerSigned(last.unrealizedPnl), UI.pnlColor(last.unrealizedPnl))}
          ${mc('已實現', U.fmtBannerSigned(last.realizedPnl), UI.pnlColor(last.realizedPnl))}
        </div>`;
      }
    } else {
      topHtml = `<div class="gd-head"><button class="gd-back" aria-label="返回">‹</button><div class="gd-title">${rep.mode === 'monthly' ? rep.year + ' 年' : rep.year + '年 ' + rep.month + '月'}</div><div class="gd-actions"></div></div>`;
      let hSnaps, hPrev, hLabel;
      if (rep.mode === 'monthly') {
        const ys = String(rep.year);
        hSnaps = allSnaps.filter(s => s.date.slice(0, 4) === ys);
        hPrev = allSnaps.filter(s => s.date < ys + '-01-01').pop() || null;
        hLabel = rep.year + '年 本期損益';
      } else {
        const ym = String(rep.year) + '-' + String(rep.month).padStart(2, '0');
        hSnaps = allSnaps.filter(s => s.date.slice(0, 7) === ym);
        hPrev = allSnaps.filter(s => s.date < ym + '-01').pop() || null;
        hLabel = rep.year + '年' + rep.month + '月 本期損益';
      }
      const hero = hSnaps.length ? mkReport('', hSnaps[hSnaps.length - 1], hPrev, cl) : null;
      if (hero) topHtml += `<div class="rep-hero">
        <div class="nw-cap">${hLabel}</div>
        <div class="nw-num" style="color:${UI.pnlColor(hero.periodPnl)}">${U.fmtBannerSigned(hero.periodPnl)}</div>
        <div class="nw-day" style="color:${UI.pnlColor(hero.periodReturnPct || 0)}">報酬率 ${U.fmtPct(hero.periodReturnPct)}</div>
      </div>`;
    }

    // 捲動內容
    let listHtml = '';
    if (!reports.length) {
      listHtml = `<div class="empty">${rep.mode === 'yearly' ? '暫無報表資料，使用一段時間後每日快照將彙整於此' : '此期間暫無資料'}</div>`;
    } else {
      // 統計入口（點擊開新頁；年報表→全部歷史、某年→該年度、某月→該月度）
      const statsLabel = rep.mode === 'yearly' ? '統計（全部歷史）' : rep.mode === 'monthly' ? rep.year + '年 統計' : rep.year + '年' + rep.month + '月 統計';
      listHtml += `<button class="rep-chart-btn" id="rep-stats-open">
        <span class="rcb-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V10M12 21V4M19 21v-7"/></svg></span>
        <span class="rcb-label">${statsLabel}</span>
        <span class="rcb-chevron">›</span>
      </button>`;

      // 期間列表：年→月、月→日 可鑽入（日為葉層）；預設倒序（新→舊）
      const drill = rep.mode !== 'daily';
      const head = rep.mode === 'yearly' ? '各年度' : rep.mode === 'monthly' ? '各月' : '各日';
      listHtml += `<div class="card rep-periods">
        <div class="rep-periods-head"><span>${head}</span><button class="rep-sort" id="rep-sort">排序 ${rep.asc ? '▲' : '▼'}</button></div>`;
      const rowsOrder = rep.asc ? reports : [...reports].reverse();
      for (const r of rowsOrder) {
        listHtml += `<div class="rep-prow${drill ? ' rep-prow-drill' : ''}"${drill ? ` data-key="${r.key}"` : ''}>
          <div class="rep-prow-main">
            <div class="rep-prow-lbl">${r.label}</div>
            <div class="rep-prow-sub">總倉位 ${U.fmtKMBB(r.netAsset)} · 投入 ${U.fmtBannerSigned(r.newInvestment)}</div>
          </div>
          <div class="rep-prow-val">
            <div class="rep-prow-pnl" style="color:${UI.pnlColor(r.periodPnl)}">${U.fmtBannerSigned(r.periodPnl)}</div>
            <div class="rep-prow-pct" style="color:${UI.pnlColor(r.periodReturnPct)}">${U.fmtPct(r.periodReturnPct)}</div>
          </div>
          ${drill ? '<span class="rep-prow-chev">›</span>' : ''}
        </div>`;
      }
      listHtml += `</div>`;
    }

    root.innerHTML = `<div class="page"><div class="page-top">${topHtml}</div><div class="page-list">${listHtml}</div></div>`;
    bindReportHead(root);

    const sortBtn = root.querySelector('#rep-sort');
    if (sortBtn) sortBtn.addEventListener('click', () => { rep.asc = !rep.asc; report(root); });
    const statsBtn = root.querySelector('#rep-stats-open');
    if (statsBtn) statsBtn.addEventListener('click', () => { rep.statsPage = true; report(root); });
    root.querySelectorAll('.rep-prow-drill').forEach(rw => rw.addEventListener('click', () => {
      const key = +rw.dataset.key;
      if (rep.mode === 'yearly') { rep.year = key; rep.mode = 'monthly'; }
      else { rep.month = key; rep.mode = 'daily'; }
      report(root);
    }));
  }
  // 統計頁（點統計入口後開啟）：依目前報表層級決定範圍
  //   年報表→全部歷史；某年→該年度；某月→該月度。返回回到同層列表。
  function reportStatsPage(root) {
    let scope, title;
    if (rep.mode === 'yearly') { scope = { level: 'all' }; title = '全部歷史 統計'; }
    else if (rep.mode === 'monthly') { scope = { level: 'year', from: rep.year + '-01-01', to: rep.year + '-12-31' }; title = rep.year + '年 統計'; }
    else { const ym = String(rep.year) + '-' + String(rep.month).padStart(2, '0'); scope = { level: 'month', from: ym + '-01', to: ym + '-31' }; title = rep.year + '年' + rep.month + '月 統計'; }
    const topHtml = `<div class="gd-head"><button class="gd-back" aria-label="返回">‹</button><div class="gd-title">${title}</div><div class="gd-actions"></div></div>`;
    root.innerHTML = `<div class="page"><div class="page-top">${topHtml}</div><div class="page-list">${statsCardsHtml(scope)}</div></div>`;
    root.querySelector('.gd-back').addEventListener('click', () => { rep.statsPage = false; report(root); });
  }
  function bindReportHead(root) {
    const back = root.querySelector('.gd-back');
    if (back) back.addEventListener('click', () => {
      if (rep.mode === 'daily') { rep.mode = 'monthly'; rep.month = null; }
      else if (rep.mode === 'monthly') rep.mode = 'yearly';
      report(root);
    });
  }

  /* ===================== 資產（淨資產）===================== */
  // 手風琴：一次只展開一類（cash|invest|liab）；detailGroup = 群組詳情頁
  //   nw/gt 僅保留各自的 metric（走勢/漲幅/投入）與 year（漲幅選年）；時間區間改用共用的 chartRange
  const as = { openCat: 'invest', detailGroup: null, detailAsc: false, catChart: null, nw: { metric: 'net', year: new Date().getFullYear() },
    groupTrend: null, gt: { metric: 'line', year: new Date().getFullYear() }, gtCache: null };
  // 所有走勢圖共用的「選擇日期」區間（持久化：關閉程式後重開仍保留同一起始/結束日）
  const chartRange = S.getChartRange();

  // 時間區間過濾（供淨資產圖 / 群組圖）：spec = {range:'all'|'ytd'|'custom', from, to}；items 皆有 .date
  function applyRange(items, spec) {
    if (!spec || spec.range === 'all') return items;
    if (spec.range === 'ytd') { const y0 = U.isoDate().slice(0, 4) + '-01-01'; return items.filter(s => s.date >= y0); }
    const from = spec.from, to = spec.to;
    return items.filter(s => (!from || s.date >= from) && (!to || s.date <= to));
  }
  // 依時間跨度自動決定分桶粒度（天/週/月/年），讓桶數與刻度合理、不過密
  function autoGran(fromIso, toIso) {
    if (!fromIso || !toIso) return 'day';
    const days = Math.round((Date.parse(toIso + 'T12:00:00+08:00') - Date.parse(fromIso + 'T12:00:00+08:00')) / 86400000) + 1;
    if (days <= 40) return 'day';
    if (days <= 200) return 'week';
    if (days <= 1100) return 'month';
    return 'year';
  }
  // X 軸標籤：稀疏到 ~7 個避免擠在一起；跨年份自動帶年份
  function chartLabels(buckets, gran) {
    if (!buckets.length) return { xLabels: [], labelFor: () => '' };
    const crossYear = buckets[0].date.slice(0, 4) !== buckets[buckets.length - 1].date.slice(0, 4);
    const fmt = i => {
      const p = buckets[i].date.split('-'), yy = p[0].slice(2), m = +p[1], d = +p[2];
      if (gran === 'year') return p[0];
      if (gran === 'month') return crossYear ? `${yy}/${m}` : `${m}月`;
      return crossYear ? `${yy}/${m}/${d}` : `${m}/${d}`; // day/week
    };
    const step = Math.max(1, Math.ceil(buckets.length / 7));
    const show = new Set();
    for (let i = 0; i < buckets.length; i += step) show.add(i);
    return { xLabels: [...show].sort((a, b) => a - b).map(i => ({ idx: i, label: fmt(i) })), labelFor: i => show.has(i) ? fmt(i) : '' };
  }
  function rangeControlHtml(spec, id) {
    const RG = [['all', '全部'], ['ytd', '年初至今'], ['custom', '選擇日期']];
    let h = `<div class="seg seg-wide" id="${id}-range">${RG.map(([v, l]) => `<button class="seg-btn ${spec.range === v ? 'active' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
    if (spec.range === 'custom') h += `<div class="range-dates"><input type="date" class="input" id="${id}-from" value="${spec.from || ''}"><span>至</span><input type="date" class="input" id="${id}-to" value="${spec.to || ''}"></div>`;
    return h;
  }
  // 年份選擇（供漲幅圖：選年份、月刻度）
  function yearControlHtml(spec, id, years) {
    if (!years.length) return '';
    return `<div class="chips" id="${id}-year">${years.map(y => `<button class="chip ${spec.year === y ? 'active' : ''}" data-v="${y}">${y}</button>`).join('')}</div>`;
  }
  function bindYearControl(root, spec, id, rerender) {
    root.querySelectorAll(`#${id}-year .chip`).forEach(b => b.addEventListener('click', () => { spec.year = +b.dataset.v; rerender(); }));
  }
  // spec 為共用的 chartRange；任何變更都持久化 → 關閉重開仍保留、所有走勢圖共用同一區間
  function bindRangeControl(root, spec, id, dates, rerender, onDate) {
    root.querySelectorAll(`#${id}-range .seg-btn`).forEach(b => b.addEventListener('click', () => {
      spec.range = b.dataset.v;
      if (spec.range === 'custom' && dates.length) { if (!spec.from) spec.from = dates[0]; if (!spec.to) spec.to = dates[dates.length - 1]; }
      S.setChartRange(spec);
      rerender();
    }));
    // 選日期即時套用，但只「局部重繪圖表」（onDate），不重建輸入框 → 原生日期選擇器不會被關掉；
    // 未提供 onDate 時退回整頁重繪。
    const f = root.querySelector(`#${id}-from`), t = root.querySelector(`#${id}-to`);
    const apply = () => {
      let a = f.value || spec.from, b = t.value || spec.to;
      if (a && b && a > b) { const tmp = a; a = b; b = tmp; f.value = a; t.value = b; } // 起訖顛倒自動對調
      spec.from = a; spec.to = b;
      S.setChartRange(spec);
      (onDate || rerender)();
    };
    if (f) f.addEventListener('change', apply);
    if (t) t.addEventListener('change', apply);
  }
  // 點「資產」tab 時回到資產首頁（退出群組/走勢/淨資產詳情）
  function resetAssetsNav() { as.detailGroup = null; as.groupTrend = null; as.catChart = null; }
  const AS_PURPLE = '#6D5FD5';

  function mvTwdOf(p, rate) {
    const m = U.normalizeMarketKey(p.market);
    return (m === U.Market.us || m === U.Market.crypto) ? p.marketValue * rate : p.marketValue;
  }

  function assets(root) {
    if (as.catChart) return metricChartPage(root, as.catChart, () => { as.catChart = null; assets(root); });
    if (as.groupTrend) return groupTrendPage(root, as.groupTrend);
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
    // 群組今日漲跌（TWD）：各持倉當日 × 股數 × 匯率；台股日模式下美股未開盤則當日計 0
    const usGated = S.getDayMode() === 'twday' && !U.usCountsTowardToday();
    const posDayTwd = p => {
      const mk = U.normalizeMarketKey(p.market);
      if (usGated && mk === U.Market.us) return 0;
      const conv = (mk === U.Market.us || mk === U.Market.crypto) ? rate : 1;
      return (p.dailyChange || 0) * p.shares * conv;
    };
    const groupDayChg = gid => (byGroup[gid] || []).reduce((s, p) => s + posDayTwd(p), 0);
    const fmtPctBadge = v => (v >= 9.95 ? Math.round(v) : v.toFixed(v >= 1 ? 0 : 1)) + '%';
    // 佔比分母：組內=該群組、投資=投資總市值、淨資產=淨資產
    const denom = gTotal => basis === 'group' ? (gTotal || sum.investTwd) : basis === 'invest' ? sum.investTwd : sum.netWorth;

    // 今日淨資產漲跌（現金/負債日內不變，故等於投資日損益；紅漲綠跌）
    const dayChange = (sum.invSummary && sum.invSummary.dayPnl) || 0;
    const prevNet = sum.netWorth - dayChange;
    const dayPct = Math.abs(prevNet) > 1e-9 ? dayChange / Math.abs(prevNet) * 100 : 0;
    const dayArrow = dayChange > 0 ? '▲' : dayChange < 0 ? '▼' : '–';
    // 固定頂部：淨資產 Hero（捲動時不動）
    const topHtml = `<div class="nw-hero">
      <div class="nw-open" id="nw-open">
        <div class="nw-cap">我的淨資產 (TWD)${eyeBtnHtml('as-eye')}</div>
        <div class="nw-num">${U.fmtWhole(sum.netWorth)}</div>
        <div class="nw-day" style="color:${UI.pnlColor(dayChange)}">${dayArrow} ${U.fmtWhole(Math.abs(dayChange))} (${Math.abs(dayPct).toFixed(2)}%)</div>
      </div>
      <div class="nw-btns">
        ${addWithRefreshHtml('as-add-btn', '新增')}
      </div>
    </div>`;
    let html = ''; // 捲動內容：分類卡

    // 收合摘要文字 + 更新日期
    const cashAccts = S.getCashAccounts();
    const liabs = S.getLiabilities();
    const dateFrom = ts => ts ? (t => `${t.month}月${t.day}日 更新`)(U.taipeiParts(new Date(ts))) : '';
    const maxUpd = list => list.reduce((m, a) => Math.max(m, a.updatedAt || 0), 0);
    const cashSummary = cashAccts.map(a => a.name).join('、') || '尚無帳戶';
    const investSummary = [...groups.map(g => g.name), ungrouped.length ? '獨立持股' : null].filter(Boolean).join('、') || '尚無持倉';
    const liabSummary = liabs.map(a => a.name).join('、') || '尚無負債';

    // 佔總資產比例（總資產 = 流動資金 + 投資）
    const grossAssets = sum.cashTwd + sum.investTwd;
    const pctOfAssets = v => grossAssets > 1e-9 ? v / grossAssets * 100 : 0;

    // 佔比環形圈（依類別上色、圈內顯示百分比；放大以容納 100%）
    function pctRing(pct, cc, ink) {
      const p = Math.max(0, Math.min(100, pct || 0));
      const r = 15.5, C = 2 * Math.PI * r, off = C * (1 - p / 100);
      const fs = Math.round(pct) >= 100 ? 9.5 : 11; // 三位數縮小字級
      return `<svg class="cat-ring" viewBox="0 0 36 36" width="42" height="42" aria-hidden="true">
        <circle cx="18" cy="18" r="${r}" fill="none" stroke="rgba(0,0,0,0.07)" stroke-width="3"/>
        <circle cx="18" cy="18" r="${r}" fill="none" stroke="${cc}" stroke-width="3" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 18 18)"/>
        <text x="18" y="18" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${ink}">${Math.round(pct)}%</text>
      </svg>`;
    }

    // 分類卡標頭（名稱前加佔總資產比例環圈；展開填色、收合顯示摘要+日期）
    function catHead(cat, name, totalHtml, cc, openCls, summary, dateTs, pct) {
      const open = as.openCat === cat;
      const ink = openCls === 'oc-green' ? '#1E8E4E' : openCls === 'oc-purple' ? '#5A4FC0' : '#4A56B5';
      const ring = pct != null ? pctRing(pct, cc, ink) : '';
      const trendBtn = `<button class="as-htrend" data-trend="${cat}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16h16"/><path d="M7 14l3.5-3.5 3 2.5L19 8"/></svg></button>`;
      return `<div class="as-head ${open ? 'open ' + openCls : ''}" data-cat="${cat}" style="--cc:${cc}">
        <div class="as-hleft cat-hleft">
          ${ring}
          <div class="cat-txt">
            <div class="nm-line"><span class="as-name">${name}</span>${open ? trendBtn : ''}</div>
            ${!open ? `<span class="as-hsummary">${summary}</span>` : ''}
          </div>
        </div>
        <div class="as-hright">
          <span class="as-total">${totalHtml}</span>
          ${!open && dateTs ? `<span class="as-hdate">${dateFrom(dateTs)}</span>` : ''}
        </div>
      </div>`;
    }

    // ── 流動資金 ─────────────────────────────────────────
    html += `<div class="card as-cat">` +
      catHead('cash', '流動資金', U.fmtWhole(sum.cashTwd), '#34C759', 'oc-green', cashSummary, maxUpd(cashAccts), pctOfAssets(sum.cashTwd));
    if (as.openCat === 'cash') {
      html += `<div class="as-body">`;
      for (const a of cashAccts) {
        const twd = a.currency === 'USD' ? (a.balance || 0) * rate : (a.balance || 0);
        const cPct = sum.cashTwd > 1e-9 ? twd / sum.cashTwd * 100 : 0;
        html += `<div class="as-row" data-kind="cash" data-id="${a.id}">
          ${pctRingBadge(cPct, '#34C759', 38)}
          <div class="as-main"><div class="as-title">${a.name}</div>
            <div class="as-sub">${a.currency === 'USD' ? 'USD ' + U.formatPrice(a.balance || 0) + ' · r' + rate.toFixed(3) : '台幣帳戶'}</div></div>
          <div class="as-val">${U.fmtWhole(twd)}</div>
        </div>`;
      }
      if (!cashAccts.length) html += `<div class="empty" style="padding:14px">尚無現金帳戶，點右上角 ＋ 新增</div>`;
      html += `</div>`;
    }
    html += `</div>`;

    // ── 投資 ────────────────────────────────────────────
    html += `<div class="card as-cat">` +
      catHead('invest', '投資', U.fmtWhole(sum.investTwd), AS_PURPLE, 'oc-purple', investSummary, S.getPricesTs(), pctOfAssets(sum.investTwd));
    if (as.openCat === 'invest') {
      html += `<div class="as-body">`;
      // 群組列（點擊進入詳情頁）
      for (const g of groups) {
        const gTotal = groupTotal(g.id);
        const gPct = (basis === 'net' ? sum.netWorth : sum.investTwd) > 1e-9
          ? gTotal / (basis === 'net' ? sum.netWorth : sum.investTwd) * 100 : 0;
        const gDay = groupDayChg(g.id);
        const gPrev = gTotal - gDay;
        const gDayPct = Math.abs(gPrev) > 1e-9 ? gDay / Math.abs(gPrev) * 100 : 0;
        const gArrow = gDay > 0 ? '▲' : gDay < 0 ? '▼' : '–';
        html += `<div class="as-grow" data-gid="${g.id}">
          ${pctRingBadge(gPct, AS_PURPLE, 38)}
          <div class="as-main"><div class="as-title">${g.name}</div>
            <div class="as-sub">${(byGroup[g.id] || []).length} 檔 ›</div></div>
          <div class="as-gv">
            <div class="as-val">${U.fmtWhole(gTotal)}</div>
            <span class="as-hchg" style="color:${UI.pnlColor(gDay)}">${gArrow} ${U.fmtWhole(Math.abs(gDay))} (${Math.abs(gDayPct).toFixed(2)}%)</span>
          </div>
        </div>`;
      }
      // 未分組持倉（與群組同層）
      for (const p of ungrouped) {
        const mv = mvTwdOf(p, rate);
        const d = basis === 'group' ? sum.investTwd : denom(0); // 未分組無「組內」→ 用投資
        const pct = d > 1e-9 ? mv / d * 100 : 0;
        const isUsd = U.normalizeMarketKey(p.market) !== U.Market.tse && U.normalizeMarketKey(p.market) !== U.Market.otc && U.normalizeMarketKey(p.market) !== U.Market.rotc;
        html += `<div class="as-row member top" data-sym="${p.symbol}">
          ${pctRingBadge(pct, AS_PURPLE, 38)}
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
      catHead('liab', '負債', (sum.liabTwd > 0 ? '−' : '') + U.fmtWhole(sum.liabTwd), '#8E9BEF', 'oc-blue', liabSummary, maxUpd(liabs), pctOfAssets(sum.liabTwd));
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

    root.innerHTML = `<div class="page"><div class="page-top">${topHtml}</div><div class="page-list">${html}</div></div>`;
    attachPullRefresh(root.querySelector('.page-list'));

    // ── 事件 ─────────────────────────────────────────────
    root.querySelectorAll('.as-head').forEach(h => h.addEventListener('click', () => {
      const k = h.dataset.cat;
      as.openCat = (as.openCat === k) ? null : k; // 再點一次收合；否則只展開被點的
      assets(root);
    }));
    root.querySelectorAll('.as-htrend[data-trend]').forEach(t => t.addEventListener('click', e => {
      e.stopPropagation(); // 不觸發標頭收合
      as.catChart = t.dataset.trend; assets(root);
    }));
    const bind = (sel, fn) => { const el = root.querySelector(sel); if (el) el.addEventListener('click', fn); };
    bind('#as-add-btn', () => openAddChooser(() => assets(root)));
    bindRefresh(root);
    bind('#nw-open', () => { as.catChart = 'nw'; assets(root); });
    { const eye = root.querySelector('#as-eye'); if (eye) eye.addEventListener('click', e => { e.stopPropagation(); S.setPrivacy(!S.getPrivacy()); assets(root); }); }
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
    maskAmounts(root);
  }

  // 淨資產長條圖頁：淨資產 / 漲幅；X 軸 天(7)／週(5)／月(12)／年(10)
  // 分桶邏輯抽到 App.Calc.netWorthBuckets（純函式、有測試涵蓋，SPEC §6）
  function nwBuckets(gran) {
    return C.netWorthBuckets(S.getSnapshots(), gran, C.cashLiabTwd());
  }

  const METRIC_META = {
    nw: { title: '淨資產', color: '#2F80ED' }, cash: { title: '資金', color: '#34C759' },
    invest: { title: '投資', color: '#6D5FD5' }, liab: { title: '負債', color: '#E8823C' },
    us: { title: '美股', color: '#4A82C8' }, tw: { title: '台股', color: '#E8823C' }, crypto: { title: '加密貨幣', color: '#9B59D0' },
  };
  function metricSeries(key, snaps, cl) {
    const f = {
      nw: s => nwOf(s, cl),
      cash: s => s.cashAccountsTwd != null ? s.cashAccountsTwd : cl.cashTwd,
      invest: s => s.totalMarketValueTwd || 0,
      liab: s => s.liabilitiesTwd != null ? s.liabilitiesTwd : cl.liabTwd,
      us: s => s.usMarketValueTwd || 0, tw: s => s.twMarketValue || 0, crypto: s => s.cryptoMarketValueTwd || 0,
    }[key] || (() => 0);
    return snaps.map(s => ({ date: s.date, netWorth: f(s) }));
  }
  // 各類別走勢/漲幅圖（淨資產/資金/投資/負債、美股/台股/加密）；資料取自每日快照，共用 as.nw 控制狀態
  // 投入/組成分解：依 key 回傳每年的組成分量（以年底快照的年增量計）
  //  淨資產 = 投資增幅(ΔtotalPnl) + 其他收入(其餘)；投資/各市場 = 投入(Δ成本) + 損益(Δ市值−Δ成本)
  function metricComp(key, c, p, cl) {
    const d = f => (f(c) || 0) - (p ? (f(p) || 0) : 0);
    const IN = '#6D5FD5';
    switch (key) {
      case 'nw': { const gain = d(s => s.totalPnl); const nwd = nwOf(c, cl) - (p ? nwOf(p, cl) : 0); return [{ label: '投資增幅', value: gain, pnl: true }, { label: '其他收入', value: nwd - gain, pnl: true }]; }
      case 'invest': { const inv = d(s => s.totalCostBasisTwd); const mvd = d(s => s.totalMarketValueTwd); return [{ label: '投入', value: inv, color: IN }, { label: '投資損益', value: mvd - inv, pnl: true }]; }
      case 'us': { const inv = d(s => s.usCostBasisTwd); const mvd = d(s => s.usMarketValueTwd); return [{ label: '投入', value: inv, color: IN }, { label: '損益', value: mvd - inv, pnl: true }]; }
      case 'tw': { const inv = d(s => s.twCostBasis); const mvd = d(s => s.twMarketValue); return [{ label: '投入', value: inv, color: IN }, { label: '損益', value: mvd - inv, pnl: true }]; }
      case 'crypto': { const inv = d(s => s.cryptoCostBasisTwd); const mvd = d(s => s.cryptoMarketValueTwd); return [{ label: '投入', value: inv, color: IN }, { label: '損益', value: mvd - inv, pnl: true }]; }
      case 'cash': return [{ label: '淨流入', value: d(s => s.cashAccountsTwd != null ? s.cashAccountsTwd : cl.cashTwd), pnl: true }];
      case 'liab': return [{ label: '負債變化', value: d(s => s.liabilitiesTwd != null ? s.liabilitiesTwd : cl.liabTwd), pnl: true }];
      default: return [];
    }
  }
  function metricChartPage(root, key, backFn) {
    const meta = METRIC_META[key] || METRIC_META.nw;
    const st = as.nw;
    const mode = st.metric === 'change' ? 'change' : st.metric === 'inflow' ? 'inflow' : 'net';
    const money = v => 'NT$ ' + U.fmtKMBB(v);
    const sfMoney = v => (v >= 0 ? '+' : '−') + 'NT$ ' + U.fmtKMBB(Math.abs(v));
    const rerender = () => metricChartPage(root, key, backFn);
    const cl = C.cashLiabTwd();
    const rawSnaps = S.getSnapshots().filter(s => s && s.date).slice().sort((a, b) => a.date < b.date ? -1 : 1);
    const allSnaps = metricSeries(key, rawSnaps, cl);
    const dates = allSnaps.map(s => s.date);
    const years = [...new Set(allSnaps.map(s => +s.date.slice(0, 4)))].sort((a, b) => a - b);

    // net（走勢）局部重繪：只更新摘要 + 圖，不重建控制列 → 選日期時原生選擇器不會被關掉
    function paintNet() {
      const fS = applyRange(allSnaps, chartRange);
      const gran = autoGran(fS.length ? fS[0].date : null, fS.length ? fS[fS.length - 1].date : null);
      const B = C.netWorthBuckets(fS, gran, cl, true);
      const XL = chartLabels(B, gran);
      let sHtml = '';
      if (B.length) {
        const p = iso => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7) });
        const a = p(B[0].date), b = p(B[B.length - 1].date);
        const periodTxt = a.y === b.y ? `${a.y}年${a.m}月至${b.m}月` : `${a.y}年${a.m}月至${b.y}年${b.m}月`;
        const chg = B[B.length - 1].nw - B[0].nw, base = B[0].nw;
        const pctTxt = Math.abs(base) > 1e-9 ? '，較期初 ' + (chg >= 0 ? '+' : '−') + Math.abs(chg / base * 100).toFixed(0) + '%' : '';
        sHtml = `<div class="gt-sum"><div class="gt-period">${periodTxt}</div><div>${meta.title} ${chg >= 0 ? '增加了' : '減少了'} <b>${money(Math.abs(chg))}</b>${pctTxt}</div></div>`;
      }
      const sumEl = root.querySelector('#nw-summary'); if (sumEl) sumEl.innerHTML = sHtml;
      const host = root.querySelector('#nw-chart');
      if (!host) return;
      if (!B.length) { host.innerHTML = `<div class="chart-empty" style="padding:50px 0">此區間尚無資料</div>`; return; }
      const pts = B.map(bb => ({ date: new Date(bb.date + 'T00:00:00+08:00'), values: { v: bb.nw } }));
      App.Charts.lineChart(host, pts, { height: 260, series: [{ key: 'v', label: meta.title, color: meta.color, fill: true }], xLabels: XL.xLabels, valueFmt: v => 'NT$ ' + U.fmtKMBB(v) });
    }

    let summary = '', chartBlocks = '', inflowRows = null, inflowN = 0, netB = null;
    if (mode === 'inflow') {
      // 以年底快照計算每年組成分量（年尺度）
      const byYear = {};
      for (const s of rawSnaps) byYear[s.date.slice(0, 4)] = s; // 升冪 → 最後一筆為該年年底
      const ys = Object.keys(byYear).sort();
      inflowRows = ys.map((y, i) => ({ year: y, comps: metricComp(key, byYear[y], i > 0 ? byYear[ys[i - 1]] : null, cl) }));
      inflowN = inflowRows.length ? inflowRows[0].comps.length : 0;
      if (inflowRows.length) {
        const parts = [];
        for (let ci = 0; ci < inflowN; ci++) {
          const total = inflowRows.reduce((s, r) => s + (r.comps[ci] ? r.comps[ci].value : 0), 0);
          parts.push(`<div>${inflowRows[0].comps[ci].label} 合計 <b style="color:${UI.pnlColor(total)}">${sfMoney(total)}</b></div>`);
        }
        summary = `<div class="gt-sum"><div class="gt-period">${ys[0]}年 至 ${ys[ys.length - 1]}年</div>${parts.join('')}</div>`;
        for (let ci = 0; ci < inflowN; ci++)
          chartBlocks += `<div class="gt-subtitle"${ci ? ' style="margin-top:16px"' : ''}>${inflowRows[0].comps[ci].label}</div><div class="chart-host" id="nw-comp-${ci}"></div>`;
      } else chartBlocks = `<div class="chart-empty" style="padding:50px 0">尚無資料</div>`;
    } else if (mode === 'change') {
      if (!years.includes(st.year)) st.year = years.length ? years[years.length - 1] : new Date().getFullYear();
      netB = C.netWorthBuckets(allSnaps.filter(s => s.date.slice(0, 4) === String(st.year)), 'month', cl, true);
      if (netB.length) {
        const vals = netB.map(x => x.change), sum = vals.reduce((s, v) => s + v, 0), up = Math.max(0, ...vals), down = Math.min(0, ...vals);
        summary = `<div class="gt-sum"><div class="gt-period">${st.year}年</div><div>合計 <b style="color:${UI.pnlColor(sum)}">${sfMoney(sum)}</b></div><div>最大漲 <b style="color:${UI.pnlColor(up)}">${sfMoney(up)}</b> · 最大跌 <b style="color:${UI.pnlColor(down)}">${sfMoney(down)}</b></div></div>`;
      }
      chartBlocks = `<div class="chart-host" id="nw-chart" style="margin-top:12px"></div>`;
    } else {
      // net：摘要 + 圖由 paintNet 填入（占位）
      chartBlocks = `<div id="nw-summary"></div><div class="chart-host" id="nw-chart" style="margin-top:12px"></div>`;
    }

    const modeTitle = mode === 'inflow' ? ' 投入' : mode === 'change' ? ' 漲幅' : ' 走勢';
    const controlHtml = mode === 'change' ? yearControlHtml(st, 'nw', years) : mode === 'net' ? rangeControlHtml(chartRange, 'nw') : '';
    root.innerHTML = `<div class="page-full">
      <div class="gd-head"><button class="gd-back" aria-label="返回">‹</button><div class="gd-title">${meta.title}${modeTitle}</div><div class="gd-actions"></div></div>
      <div class="card">
        <div class="seg seg-wide" id="nw-metric">${seg('net', '走勢', st.metric)}${seg('change', '漲幅', st.metric)}${seg('inflow', '投入', st.metric)}</div>
        ${controlHtml}
        ${summary}
        ${chartBlocks}
      </div>
    </div>`;

    root.querySelector('.gd-back').addEventListener('click', backFn);
    root.querySelectorAll('#nw-metric .seg-btn').forEach(b => b.addEventListener('click', () => { st.metric = b.dataset.v; rerender(); }));
    if (mode === 'change') bindYearControl(root, st, 'nw', rerender);
    else if (mode === 'net') bindRangeControl(root, chartRange, 'nw', dates, rerender, paintNet);

    if (mode === 'net') { paintNet(); return; }
    if (mode === 'inflow') {
      if (!inflowRows || !inflowRows.length) return;
      for (let ci = 0; ci < inflowN; ci++) {
        const c0 = inflowRows[0].comps[ci];
        const items = inflowRows.map(r => ({ label: r.year, fullLabel: r.year + '年', value: r.comps[ci] ? r.comps[ci].value : 0 }));
        App.Charts.barChart(root.querySelector('#nw-comp-' + ci), items, {
          height: inflowN > 1 ? 180 : 240,
          colorOf: c0.pnl ? (v => UI.pnlColor(v)) : (() => c0.color),
          valueFmt: sfMoney,
        });
      }
      return;
    }
    // change（漲幅）
    const host = root.querySelector('#nw-chart');
    if (!netB.length) { host.innerHTML = `<div class="chart-empty" style="padding:50px 0">此區間尚無資料</div>`; return; }
    App.Charts.barChart(host, netB.map(b => ({ label: b.label, fullLabel: b.full, value: b.change })), { height: 260, colorOf: v => UI.pnlColor(v), valueFmt: sfMoney });
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

    const topHtml = `<div class="gd-head">
      <button class="gd-back" aria-label="返回">‹</button>
      <div class="gd-title">${g.name}</div>
      <div class="gd-actions">
        <button class="gd-trend" aria-label="走勢圖"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16h16"/><path d="M7 14l3.5-3.5 3 2.5L19 8"/></svg></button>
        <button class="gd-menu" aria-label="選單">⋯</button>
        <button class="gd-plus" aria-label="新增">＋</button>
      </div>
    </div>
    <div class="gd-total">合計 NT$ ${U.fmtWhole(gTotal)} <button class="gd-sort" aria-label="排序">${as.detailAsc ? '▲' : '▼'}</button></div>`;

    let listHtml = '';
    if (!members.length) {
      listHtml += `<div class="empty" style="padding:40px 16px">此群組尚無持倉<br>點右上 ＋ 買入並加入，或從投資清單指定群組</div>`;
    }
    for (const p of members) {
      const mv = mvTwdOf(p, rate);
      const pct = denomV > 1e-9 ? mv / denomV * 100 : 0;
      const isUsd = U.normalizeMarketKey(p.market) !== U.Market.tse && U.normalizeMarketKey(p.market) !== U.Market.otc && U.normalizeMarketKey(p.market) !== U.Market.rotc;
      listHtml += `<div class="card gd-row" data-sym="${p.symbol}">
        ${pctRingBadge(pct, AS_PURPLE, 40)}
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

    root.innerHTML = `<div class="page"><div class="page-top">${topHtml}</div><div class="page-list">${listHtml}</div></div>`;

    root.querySelector('.gd-back').addEventListener('click', () => { as.detailGroup = null; assets(root); });
    root.querySelector('.gd-sort').addEventListener('click', () => { as.detailAsc = !as.detailAsc; assets(root); });
    root.querySelector('.gd-trend').addEventListener('click', () => { as.groupTrend = gid; as.gtCache = null; assets(root); });
    root.querySelector('.gd-menu').addEventListener('click', () => openGroupMenu(gid, () => assets(root)));
    root.querySelector('.gd-plus').addEventListener('click', () =>
      openTxForm(null, null, { onAdded: sym => { const m = S.getGroupMap(); m[sym] = gid; S.setGroupMap(m); if (App.Sync) App.Sync.markDirty(); } }));
    root.querySelectorAll('.gd-row').forEach(r => r.addEventListener('click', () =>
      openGroupAssign(r.dataset.sym, () => assets(root))));
  }

  // 群組走勢頁：折線（市值走勢）/ 長條（漲幅），X 軸 天/週/月/年
  function gtHead(title) {
    return `<div class="gd-head">
      <button class="gd-back" aria-label="返回">‹</button>
      <div class="gd-title">${title}</div>
      <div class="gd-actions" style="visibility:hidden"><button>＋</button></div>
    </div>`;
  }
  function bucketXLabels(buckets) {
    if (!buckets.length) return [];
    const step = Math.max(1, Math.ceil(buckets.length / 6));
    const out = [];
    for (let i = 0; i < buckets.length; i += step) out.push({ idx: i, label: buckets[i].label });
    return out;
  }
  async function fetchGroupSeries(symbols) {
    if (!symbols.length) return [];
    const txs = S.getTransactions().filter(t => symbols.includes(t.symbol));
    if (!txs.length) return [];
    const mmap = S.metaMap();
    const firstDate = U.isoDate(new Date(Math.min(...txs.map(t => t.time))));
    const mkOf = c => U.normalizeMarketKey((mmap[c] && mmap[c].market) || U.guessMarketBySymbol(c));
    const tw = symbols.filter(c => mkOf(c) !== U.Market.us && mkOf(c) !== U.Market.crypto);
    const us = symbols.filter(c => mkOf(c) === U.Market.us);
    const cr = symbols.filter(c => mkOf(c) === U.Market.crypto);
    await App.Api.fetchFx();
    const [twH, usH, crH] = await Promise.all([
      App.Api.fetchTwHistory(tw, firstDate),
      App.Api.fetchUsHistory(us, firstDate),
      App.Api.fetchCryptoHistory(cr, firstDate),
    ]);
    return C.buildGroupSeries(symbols, Object.assign({}, twH, usH, crH), S.getFxRate());
  }
  async function groupTrendPage(root, gid) {
    const g = S.getGroups().find(x => x.id === gid);
    if (!g) { as.groupTrend = null; return assets(root); }
    const gmap = S.getGroupMap();
    const symbols = Object.keys(gmap).filter(s => gmap[s] === gid);

    // 尚無資料 → 顯示載入、抓歷史、快取後重繪
    if (!as.gtCache || as.gtCache.gid !== gid) {
      root.innerHTML = `<div class="page-full">${gtHead(g.name)}<div class="empty" style="padding:70px 16px">載入走勢中…</div></div>`;
      root.querySelector('.gd-back').addEventListener('click', () => { as.groupTrend = null; assets(root); });
      let series = [];
      try { series = await fetchGroupSeries(symbols); }
      catch (e) { console.error(e); UI.toast('載入走勢失敗', 'error'); }
      if (as.groupTrend !== gid) return; // 使用者已離開
      as.gtCache = { gid, series };
      return groupTrendPage(root, gid);
    }

    const series = as.gtCache.series;
    const st = as.gt;
    const isBar = st.metric === 'change';
    const CL = { cashTwd: 0, liabTwd: 0 };
    const dates = series.map(s => s.date);
    const years = [...new Set(series.map(s => +s.date.slice(0, 4)))].sort((a, b) => a - b);
    const GC_MV = '#6D5FD5', GC_COST = '#A8A29E';        // 市值紫實線、成本灰虛線
    const BAR_IN = '#4B3F9E', BAR_PL = '#8B7FE0';         // 投入深紫、損益淺紫
    const sfMoney = v => (v >= 0 ? '+' : '−') + 'NT$ ' + U.fmtKMBB(Math.abs(v));
    const money = v => 'NT$ ' + U.fmtKMBB(v);

    // net（走勢）局部重繪：只更新摘要 + 圖，不重建控制列 → 選日期時原生選擇器不會被關掉
    function paintGt() {
      const fSeries = applyRange(series, chartRange);
      const gran = autoGran(fSeries.length ? fSeries[0].date : null, fSeries.length ? fSeries[fSeries.length - 1].date : null);
      const mvB = C.netWorthBuckets(fSeries.map(s => ({ date: s.date, netWorth: s.mv })), gran, CL, true);
      const coB = C.netWorthBuckets(fSeries.map(s => ({ date: s.date, netWorth: s.cost })), gran, CL, true);
      const XL = chartLabels(mvB, gran);
      let sHtml = '';
      if (mvB.length) {
        const p = iso => ({ y: +iso.slice(0, 4), m: +iso.slice(5, 7) });
        const a = p(mvB[0].date), b = p(mvB[mvB.length - 1].date);
        const periodTxt = a.y === b.y ? `${a.y}年${a.m}月至${b.m}月` : `${a.y}年${a.m}月至${b.y}年${b.m}月`;
        const mvChg = mvB[mvB.length - 1].nw - mvB[0].nw, mvBase = mvB[0].nw;
        const coChg = coB[coB.length - 1].nw - coB[0].nw, coBase = coB[0].nw;
        const pctTxt = (chg, base) => Math.abs(base) > 1e-9 ? '，較期初 ' + (chg >= 0 ? '+' : '−') + Math.abs(chg / base * 100).toFixed(0) + '%' : '';
        sHtml = `<div class="gt-sum"><div class="gt-period">${periodTxt}</div>
          <div>市值 ${mvChg >= 0 ? '增加了' : '減少了'} <b>${money(Math.abs(mvChg))}</b>${pctTxt(mvChg, mvBase)}</div>
          <div>成本 ${coChg >= 0 ? '增加了' : '減少了'} <b>${money(Math.abs(coChg))}</b>${pctTxt(coChg, coBase)}</div></div>`;
      }
      const sumEl = root.querySelector('#gt-summary'); if (sumEl) sumEl.innerHTML = sHtml;
      const host = root.querySelector('#gt-chart');
      if (!host) return;
      if (!mvB.length) { host.innerHTML = `<div class="chart-empty" style="padding:50px 0">此群組尚無走勢資料</div>`; return; }
      const pts = mvB.map((bb, i) => ({ date: new Date(bb.date + 'T00:00:00+08:00'), values: { mv: bb.nw, cost: coB[i].nw } }));
      App.Charts.lineChart(host, pts, {
        height: 260,
        series: [{ key: 'mv', label: '市值', color: GC_MV, fill: true }, { key: 'cost', label: '成本', color: GC_COST, dash: true }],
        xLabels: XL.xLabels,
        valueFmt: v => 'NT$ ' + U.fmtKMBB(v),
      });
    }

    // 漲幅（isBar）：選年份、月刻度；net 由 paintGt 局部填入
    let summary = '', mvB = null, coB = null;
    if (isBar) {
      if (!years.includes(st.year)) st.year = years.length ? years[years.length - 1] : new Date().getFullYear();
      const ySeries = series.filter(s => s.date.slice(0, 4) === String(st.year));
      mvB = C.netWorthBuckets(ySeries.map(s => ({ date: s.date, netWorth: s.mv })), 'month', CL, true);
      coB = C.netWorthBuckets(ySeries.map(s => ({ date: s.date, netWorth: s.cost })), 'month', CL, true);
      if (mvB.length) {
        const invTot = coB.reduce((s, b) => s + b.change, 0);                       // 投入合計
        const plTot = mvB.reduce((s, b, i) => s + (b.change - coB[i].change), 0);     // 損益合計
        summary = `<div class="gt-sum"><div class="gt-period">${st.year}年</div>
          <div>投入合計 <b>${sfMoney(invTot)}</b></div>
          <div>持倉盈虧 <b style="color:${UI.pnlColor(plTot)}">${sfMoney(plTot)}</b></div></div>`;
      }
    }

    let html = gtHead(g.name) + `<div class="card">
      <div class="seg seg-wide" id="gt-metric">${seg('line', '走勢', st.metric)}${seg('change', '漲幅', st.metric)}</div>
      ${isBar ? yearControlHtml(st, 'gt', years) : rangeControlHtml(chartRange, 'gt')}
      ${isBar
        ? `${summary}<div class="gt-subtitle">投入</div><div class="chart-host" id="gt-chart-a"></div>
           <div class="gt-subtitle" style="margin-top:16px">持倉盈虧</div><div class="chart-host" id="gt-chart-b"></div>`
        : `<div id="gt-summary"></div><div class="chart-host" id="gt-chart" style="margin-top:10px"></div>`}
    </div>`;
    root.innerHTML = `<div class="page-full">${html}</div>`;

    root.querySelector('.gd-back').addEventListener('click', () => { as.groupTrend = null; assets(root); });
    root.querySelectorAll('#gt-metric .seg-btn').forEach(b => b.addEventListener('click', () => { as.gt.metric = b.dataset.v; groupTrendPage(root, gid); }));
    if (isBar) bindYearControl(root, st, 'gt', () => groupTrendPage(root, gid));
    else bindRangeControl(root, chartRange, 'gt', dates, () => groupTrendPage(root, gid), paintGt);

    if (!isBar) { paintGt(); return; }
    if (!mvB.length) { root.querySelector('#gt-chart-a').innerHTML = `<div class="chart-empty" style="padding:50px 0">此群組尚無走勢資料</div>`; return; }
    // 投入(帳戶改變)＝成本變化；持倉盈虧＝市值變化 − 成本變化 → 拆成兩張圖
    const sfBar = v => (v >= 0 ? '+' : '−') + 'NT$ ' + U.fmtKMBB(Math.abs(v));
    const invItems = mvB.map((b, i) => ({ label: b.label, fullLabel: b.full, value: coB[i].change }));
    const plItems = mvB.map((b, i) => ({ label: b.label, fullLabel: b.full, value: b.change - coB[i].change }));
    App.Charts.barChart(root.querySelector('#gt-chart-a'), invItems, { height: 190, colorOf: () => BAR_IN, valueFmt: sfBar });
    App.Charts.barChart(root.querySelector('#gt-chart-b'), plItems, { height: 190, colorOf: v => UI.pnlColor(v), valueFmt: sfBar });
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
  const SET_ICON = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const SET_ICONS = {
    cloud: SET_ICON('<path d="M7 18a4 4 0 1 1 .6-7.96A5.5 5.5 0 0 1 18 10.5a3.5 3.5 0 0 1-.5 7Z"/>'),
    lock: SET_ICON('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    pie: SET_ICON('<path d="M12 3a9 9 0 1 0 9 9h-9Z"/>'),
    cal: SET_ICON('<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>'),
    down: SET_ICON('<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>'),
    up: SET_ICON('<path d="M12 20V9M8 13l4-4 4 4M5 4h14"/>'),
    refresh: SET_ICON('<path d="M20 11a8 8 0 0 0-14.7-3.3M4 5v4h4"/><path d="M4 13a8 8 0 0 0 14.7 3.3M20 19v-4h-4"/>'),
    wrench: SET_ICON('<path d="M14.6 6.4a3.5 3.5 0 0 0-4.7 4.3L4 16.6 7.4 20l5.9-5.9a3.5 3.5 0 0 0 4.3-4.7l-2.2 2.2-2.3-.6-.6-2.3Z"/>'),
    gear: SET_ICON('<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2m14 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    info: SET_ICON('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>'),
    flask: SET_ICON('<path d="M9 3v6l-4.5 8A2 2 0 0 0 6.3 20h11.4a2 2 0 0 0 1.8-3L15 9V3M8 3h8"/>'),
    trash: SET_ICON('<path d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13"/>'),
  };
  const set = { sub: null }; // 設定頁內導覽：null | 'sync' | 'lock' | 'adv'
  function resetSettingsNav() { set.sub = null; }
  function setSubHead(title) { return `<div class="gd-head"><button class="gd-back" aria-label="返回">‹</button><div class="gd-title">${title}</div><div class="gd-actions"></div></div>`; }
  function setSubBack(root) { const b = root.querySelector('.gd-back'); if (b) b.addEventListener('click', () => { set.sub = null; settings(root); }); }
  // 單選選擇器（打勾）：供佔比基準／當日漲跌等
  function openChooser(title, opts, current, onPick) {
    const rows = opts.map(o => `<button class="chooser-row" data-v="${o.v}">
      <div class="chooser-txt"><div class="chooser-label">${o.label}</div>${o.hint ? `<div class="chooser-hint">${o.hint}</div>` : ''}</div>
      <span class="chooser-check">${o.v === current ? '✓' : ''}</span></button>`).join('');
    const ov = UI.openSheet(title, `<div class="chooser">${rows}</div>`, '');
    ov.querySelectorAll('.chooser-row').forEach(b => b.addEventListener('click', () => { UI.closeSheet(); onPick(b.dataset.v); }));
  }

  function settings(root) {
    if (set.sub === 'sync') return settingsSync(root);
    if (set.sub === 'lock') return settingsLock(root);
    if (set.sub === 'adv') return settingsAdv(root);
    const lastTs = S.getPricesTs(), rate = S.getFxRate();
    const syncOn = !!(App.Sync && App.Sync.enabled());
    const lockOn = !!(App.Auth && App.Auth.isEnabled());
    const pbLabel = { group: '組內', invest: '投資', net: '淨資產' }[S.getPctBasis()] || '投資';
    const dmLabel = { native: '原始', twday: '台股日' }[S.getDayMode()] || '原始';
    const nav = (k, id, label, val) => `<button class="s-row" id="${id}"><span class="s-ic">${SET_ICONS[k]}</span><span class="s-label">${label}</span>${val ? `<span class="s-val">${val}</span>` : ''}<span class="s-chev">›</span></button>`;
    const info = (label, val) => `<div class="s-row s-info"><span class="s-label">${label}</span><span class="s-val">${val}</span></div>`;
    let html = `
    <div class="s-topbar">設定</div>
    <div class="s-head">同步與安全</div>
    <div class="s-list">
      ${nav('cloud', 'set-sync', '雲端同步', syncOn ? '已啟用' : '未啟用')}
      ${nav('lock', 'set-lock', 'App 鎖定', lockOn ? '已啟用' : '未啟用')}
    </div>
    <div class="s-head">顯示</div>
    <div class="s-list">
      ${nav('pie', 'set-pb', '投資佔比基準', pbLabel)}
      ${nav('cal', 'set-dm', '當日漲跌計算', dmLabel)}
    </div>
    <div class="s-head">資料</div>
    <div class="s-list">
      ${nav('down', 'set-export', '匯出備份')}
      ${nav('up', 'set-import', '匯入備份')}
      ${nav('refresh', 'set-rebuild', '重建歷史走勢圖')}
      ${nav('wrench', 'set-fixfee', '修正異常手續費')}
    </div>
    <div class="s-head">進階</div>
    <div class="s-list">${nav('gear', 'set-adv', '報價來源與代理')}</div>
    <div class="s-head">關於</div>
    <div class="s-list">
      ${info('版本', App.VERSION || '?')}
      ${info('最後更新報價', lastTs ? new Date(lastTs).toLocaleString('zh-TW') : '尚未更新')}
      ${info('USD / TWD 匯率', rate ? rate.toFixed(3) : '--')}
      ${info('交易 / 快照', S.getTransactions().length + ' / ' + S.getSnapshots().length)}
    </div>
    <div class="s-head">其他</div>
    <div class="s-list">
      ${nav('flask', 'set-seed', '載入示範資料')}
      <button class="s-row s-danger" id="set-clear"><span class="s-ic">${SET_ICONS.trash}</span><span class="s-label">清空所有資料</span></button>
    </div>
    <input type="file" id="file-import" accept=".csv,text/csv" style="display:none">
    <div style="height:16px"></div>`;
    root.innerHTML = `<div class="page-full">${html}</div>`;

    const on = (id, fn) => { const el = root.querySelector('#' + id); if (el) el.addEventListener('click', fn); };
    on('set-sync', () => { set.sub = 'sync'; settings(root); });
    on('set-lock', () => { set.sub = 'lock'; settings(root); });
    on('set-adv', () => { set.sub = 'adv'; settings(root); });
    on('set-pb', () => openChooser('投資佔比基準', [
      { v: 'group', label: '組內', hint: '以所屬群組總額為分母' },
      { v: 'invest', label: '投資', hint: '以投資總市值為分母' },
      { v: 'net', label: '淨資產', hint: '以淨資產為分母' },
    ], S.getPctBasis(), v => { S.setPctBasis(v); if (App.Sync) App.Sync.markDirty(); settings(root); }));
    on('set-dm', () => openChooser('當日漲跌計算', [
      { v: 'native', label: '原始', hint: '各市場自己的當日漲跌相加' },
      { v: 'twday', label: '台股日', hint: '以台股 09:00 起算；美股未開盤顯示 0，晚上開盤才計入（凌晨那盤歸昨天）' },
    ], S.getDayMode(), v => { S.setDayMode(v); settings(root); }));
    on('set-export', doExport);
    on('set-import', () => root.querySelector('#file-import').click());
    root.querySelector('#file-import').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const res = App.Csv.importCsv(String(reader.result));
        if (res.ok) {
          UI.toast(`匯入成功：${res.txCount} 筆交易${res.snapCount ? '、' + res.snapCount + ' 筆快照' : ''}`, 'success');
          if (res.feeWarnSymbols && res.feeWarnSymbols.length)
            UI.toast(`⚠️ ${res.feeWarnSymbols.join('、')} 手續費異常偏高，請檢查交易紀錄`, 'error');
          App.afterDataChange();
          if (!res.snapCount) { UI.toast('重建歷史走勢中…', 'info'); await App.rebuildHistory(); UI.toast('已重建歷史走勢', 'success'); }
        } else UI.toast(res.msg || '匯入失敗', 'error');
      };
      reader.readAsText(f);
      e.target.value = '';
    });
    on('set-rebuild', async () => { UI.toast('重建歷史走勢中…', 'info'); const n = await App.rebuildHistory(); if (n) UI.toast(`已重建 ${n} 天歷史走勢`, 'success'); });
    on('set-fixfee', () => {
      const rep = C.repairFees();
      if (!rep.fixed.length) { UI.toast('沒有發現異常手續費', 'info'); return; }
      C.saveTodaySnapshot(); if (App.Sync) App.Sync.markDirty();
      const syms = [...new Set(rep.fixed.map(f => f.symbol))].join('、');
      UI.toast(`已修正 ${rep.fixed.length} 筆（${syms}）`, 'success'); settings(root);
    });
    on('set-seed', () => UI.confirmDialog('載入示範資料？會覆蓋你目前所有資料（可先匯出備份）。', () => { App.seedDemo(); UI.toast('已載入示範資料', 'success'); }, '載入'));
    on('set-clear', () => UI.confirmDialog('確定清空所有交易、損益與快照？此動作無法復原。', () => { S.clearAll(); UI.toast('已清空所有資料', 'info'); App.afterDataChange([]); }, '清空'));
  }

  // ── 設定子頁：雲端同步 ──
  function settingsSync(root) {
    const onEnabled = !!(App.Sync && App.Sync.enabled());
    root.innerHTML = `<div class="page-full">${setSubHead('雲端同步')}
      <div class="card setting-card">
        <div class="set-row">
          <input class="input" id="sync-token" type="password" placeholder="貼上 GitHub Token（gist 權限）" value="${onEnabled ? '••••••••••••' : ''}">
          <button class="btn btn-primary" id="sync-save">${onEnabled ? '更新' : '啟用'}</button>
        </div>
        <div class="set-row" style="margin-top:8px">
          <button class="btn btn-ghost" id="sync-now" style="flex:1" ${onEnabled ? '' : 'disabled'}>立即同步</button>
          ${onEnabled ? '<button class="btn btn-ghost" id="sync-off" style="flex:1">停用同步</button>' : ''}
        </div>
        <div class="set-hint" id="sync-status">${onEnabled ? '同步已啟用' : '各裝置貼同一組 token 即可自動同步同一份資料'}</div>
        <div class="set-hint"><a href="https://github.com/settings/tokens/new?scopes=gist&description=dives-sync" target="_blank" style="color:${COL.tw}">→ 點此產生 GitHub Token（已預選 gist 權限）</a></div>
      </div></div>`;
    setSubBack(root);
    const syncStatusEl = root.querySelector('#sync-status');
    function fmtSyncStatus(s) {
      if (!s || !syncStatusEl) return;
      if (s === 'syncing') { syncStatusEl.textContent = '同步中…'; return; }
      if (s.startsWith('synced:')) { const ts = +s.slice(7); syncStatusEl.textContent = ts ? ('已同步 · ' + new Date(ts).toLocaleString('zh-TW')) : '已同步'; return; }
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
      settings(root);
    });
    const nowBtn = root.querySelector('#sync-now');
    if (nowBtn) nowBtn.addEventListener('click', async () => { const r = await App.Sync.pull(); if (r.error) UI.toast('同步失敗：' + r.error, 'error'); else { UI.toast('同步完成', 'success'); if (r.changed) App.renderCurrent(); } });
    const offBtn = root.querySelector('#sync-off');
    if (offBtn) offBtn.addEventListener('click', () => UI.confirmDialog('停用同步？(本機資料會保留，雲端 Gist 不刪除)', () => { App.Sync.disable(); UI.toast('已停用同步', 'info'); settings(root); }, '停用'));
  }

  // ── 設定子頁：App 鎖定 ──
  function settingsLock(root) {
    root.innerHTML = `<div class="page-full">${setSubHead('App 鎖定')}<div class="card setting-card"><div id="lock-body"></div></div></div>`;
    setSubBack(root);
    renderLockBody(root.querySelector('#lock-body'), root);
  }

  // ── 設定子頁：報價來源與代理 ──
  function settingsAdv(root) {
    root.innerHTML = `<div class="page-full">${setSubHead('報價來源與代理')}
      <div class="card setting-card">
        <div class="set-sub">Finnhub API 金鑰（美股報價）</div>
        <input class="input" id="set-finnhub" placeholder="使用內建金鑰" value="${localStorage.getItem('dives_finnhub_key') || ''}">
        <div class="set-sub">FinMind Token（台股報價，可留空；註冊後填入可提高速率上限）</div>
        <input class="input" id="set-finmind" placeholder="免金鑰可用，額度有限" value="${localStorage.getItem('dives_finmind_token') || ''}">
        <div class="set-sub">CORS 代理（報價直連失敗時的後備）</div>
        <input class="input" id="set-proxy" value="${S.getProxy()}">
        <button class="btn btn-block btn-ghost" id="btn-adv-save" style="margin-top:10px">儲存進階設定</button>
      </div></div>`;
    setSubBack(root);
    root.querySelector('#btn-adv-save').addEventListener('click', () => {
      const fk = root.querySelector('#set-finnhub').value.trim();
      const fm = root.querySelector('#set-finmind').value.trim();
      const px = root.querySelector('#set-proxy').value.trim();
      if (fk) localStorage.setItem('dives_finnhub_key', fk); else localStorage.removeItem('dives_finnhub_key');
      if (fm) localStorage.setItem('dives_finmind_token', fm); else localStorage.removeItem('dives_finmind_token');
      S.setProxy(px);
      UI.toast('已儲存進階設定', 'success');
    });
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
    // 優先用已快取的可用性（同步）→ 一次填完，避免鎖定卡先空再撐開造成閃動
    let faceAvail = A.webAuthnAvailableSync ? A.webAuthnAvailableSync() : null;
    if (faceAvail === null) faceAvail = await A.isWebAuthnAvailable();
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
      feeMode: editing ? 'amount' : 'rate', // 編輯：既有 fee 是「絕對金額」，須用固定金額模式（否則被當費率%重算）
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
          <button class="fm-btn ${txState.feeMode === 'rate' ? 'active' : ''}" data-m="rate">費率 %</button>
          <button class="fm-btn ${txState.feeMode === 'amount' ? 'active' : ''}" data-m="amount">固定金額</button>
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

  return { portfolio, history, report, assets, settings, openTxForm, resetAssetsNav, resetReportNav, resetPortfolioNav, resetSettingsNav };
})();
