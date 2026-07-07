/* =========================================================================
 * app.js — 主控制器：分頁路由、報價刷新、初始化
 * ======================================================================= */
(function () {
  const V = App.Views, S = App.Store, C = App.Calc, UI = App.UI, Api = App.Api;
  App.VERSION = 'v93';

  const TAB_ORDER = ['assets', 'portfolio', 'report', 'history', 'settings'];
  // 記住當前分頁，避免重新整理/下拉時跳回資產
  let currentTab = (() => { try { return sessionStorage.getItem('dives_tab') || 'assets'; } catch (e) { return 'assets'; } })();
  const TABS = [
    { id: 'portfolio', label: '持倉', icon: '📊' },
    { id: 'report', label: '報表', icon: '📋' },
    { id: 'history', label: '歷史', icon: '📈' },
    { id: 'settings', label: '設定', icon: '⚙️' },
  ];

  let slideDir = null; // 換分頁時的滑入方向（next=從右、prev=從左）
  function renderTab(root, tab) {
    switch (tab) {
      case 'portfolio': V.portfolio(root); break;
      case 'assets': V.assets(root); break;
      case 'history': V.history(root); break;
      case 'report': V.report(root); break;
      case 'settings': V.settings(root); break;
    }
  }
  function renderCurrent() {
    const root = document.getElementById('view');
    if (!root) return;
    root.scrollTop = 0;
    renderTab(root, currentTab);
    // 換分頁 → 讓新內容依方向滑入（點 tab bar 用；滑動換頁不套此動畫）
    if (slideDir && root.firstElementChild) {
      root.firstElementChild.classList.add(slideDir === 'next' ? 'tab-slide-next' : 'tab-slide-prev');
    }
    slideDir = null;
    // tab bar 高亮
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === currentTab));
    updateHeader();
  }

  function switchTab(id) {
    const from = TAB_ORDER.indexOf(currentTab), to = TAB_ORDER.indexOf(id);
    slideDir = (from >= 0 && to >= 0 && to !== from) ? (to > from ? 'next' : 'prev') : null;
    currentTab = id;
    try { sessionStorage.setItem('dives_tab', id); } catch (e) {}
    renderCurrent();
  }
  function goTab(id) { if (id === 'assets' && V.resetAssetsNav) V.resetAssetsNav(); if (id === 'report' && V.resetReportNav) V.resetReportNav(); if (id === 'portfolio' && V.resetPortfolioNav) V.resetPortfolioNav(); switchTab(id); }

  // 左右滑：互動式換頁（內容跟著手指移動，放開時吸附到新頁或回彈）
  function initSwipe() {
    const view = document.getElementById('view');
    if (!view) return;
    const IGNORE = '.chart-host, .chips, input, select, textarea, .switch';
    let sx = 0, sy = 0, t0 = 0, decided = false, horiz = false, dir = 0, neighbor = null, track = null, curPane = null, edge = false, W = 0;

    const rest = () => dir > 0 ? 0 : -W;          // 靜止（顯示當前頁）
    const full = () => dir > 0 ? -W : 0;          // 完全顯示鄰頁
    const clampX = x => Math.max(-W, Math.min(0, x));
    const setX = x => { track.style.transform = 'translateX(' + x + 'px)'; };

    function build() {
      W = view.clientWidth || window.innerWidth;
      const cur = view.firstElementChild;
      track = document.createElement('div'); track.className = 'pager-track';
      curPane = document.createElement('div'); curPane.className = 'pager-pane';
      const nb = document.createElement('div'); nb.className = 'pager-pane';
      if (neighbor != null) { try { renderTab(nb, TAB_ORDER[neighbor]); } catch (e) {} }
      if (dir > 0) { curPane.appendChild(cur); track.append(curPane, nb); }   // next：當前在左、鄰頁在右
      else { track.append(nb, curPane); curPane.appendChild(cur); }           // prev：鄰頁在左、當前在右
      view.appendChild(track);
      setX(rest());
    }

    function settle(commit) {
      if (!track) return;
      const t = track;
      t.classList.add('animating');
      setX(commit ? full() : rest());
      const done = () => {
        t.removeEventListener('transitionend', done);
        if (track !== t) return;
        if (commit && neighbor != null) {
          const tab = TAB_ORDER[neighbor];
          if (tab === 'assets' && V.resetAssetsNav) V.resetAssetsNav();
          if (tab === 'report' && V.resetReportNav) V.resetReportNav();
          if (tab === 'portfolio' && V.resetPortfolioNav) V.resetPortfolioNav();
          currentTab = tab; try { sessionStorage.setItem('dives_tab', tab); } catch (e) {}
          t.remove();
          renderCurrent();                          // slideDir 為 null → 不再疊加動畫
        } else {
          const c = curPane && curPane.firstElementChild;
          t.remove(); if (c) view.appendChild(c);   // 回彈：把原內容放回
        }
        track = null; curPane = null; decided = false; horiz = false; neighbor = null; edge = false;
      };
      t.addEventListener('transitionend', done);
      window.setTimeout(() => { if (track === t) done(); }, 340); // 保險（transitionend 未觸發時）
    }

    view.addEventListener('touchstart', e => {
      if (track) return;
      decided = false; horiz = false; edge = false;
      if (e.touches.length !== 1 || (e.target.closest && e.target.closest(IGNORE))) { decided = true; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; t0 = e.timeStamp;
    }, { passive: true });

    view.addEventListener('touchmove', e => {
      if (decided && !horiz) return;                // 已判定為垂直/忽略 → 交給原生捲動
      if (track && horiz) {
        e.preventDefault();
        const dx = e.touches[0].clientX - sx;
        setX(clampX(rest() + (edge ? dx * 0.32 : dx)));
        return;
      }
      if (!decided) {
        const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dx) <= Math.abs(dy) * 1.2) { decided = true; return; } // 垂直為主 → 放行捲動
        decided = true; horiz = true;
        dir = dx < 0 ? 1 : -1;
        const n = TAB_ORDER.indexOf(currentTab) + dir;
        if (n < 0 || n >= TAB_ORDER.length) { neighbor = null; edge = true; } else neighbor = n;
        build();
        e.preventDefault();
        setX(clampX(rest() + (edge ? dx * 0.32 : dx)));
      }
    }, { passive: false });

    view.addEventListener('touchend', e => {
      if (!track || !horiz) { decided = false; horiz = false; return; }
      const dx = (e.changedTouches ? e.changedTouches[0].clientX : sx) - sx;
      const v = dx / Math.max(1, e.timeStamp - t0); // px/ms
      let commit = false;
      if (!edge && neighbor != null) {
        const far = Math.abs(dx) > W * 0.28;
        const flick = Math.abs(v) > 0.5 && ((dir > 0 && dx < 0) || (dir < 0 && dx > 0));
        commit = far || flick;
      }
      settle(commit);
    }, { passive: true });

    view.addEventListener('touchcancel', () => {
      if (track) settle(false); else { decided = false; horiz = false; }
    }, { passive: true });
  }

  function updateHeader() {
    const ts = S.getPricesTs();
    const el = document.getElementById('last-updated');
    if (el) el.textContent = ts ? ('更新於 ' + new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })) : '';
  }

  // 報價刷新
  let refreshing = false;
  async function refresh(symbols, doSync) {
    if (refreshing) return;
    refreshing = true;
    const btn = document.getElementById('refresh-btn');
    btn && btn.classList.add('spin');
    try {
      // 手動重新整理時先做雲端同步（雙向：遠端較新則拉、本機較新則推）
      if (doSync && App.Sync && App.Sync.enabled()) {
        const r = await App.Sync.pull();
        if (r.changed) renderCurrent();
      }
      await Api.refreshPrices(symbols);
      const isNewDay = C.saveTodaySnapshot();
      if (isNewDay && App.Sync) App.Sync.markDirty(); // 新的一天快照 → 同步
      renderCurrent();
    } catch (e) {
      console.error(e); UI.toast('報價更新失敗', 'error');
    } finally {
      refreshing = false;
      btn && btn.classList.remove('spin');
      updateHeader();
    }
  }

  // 資料變動後：重算今日快照、雲端同步、重繪、背景刷新指定報價
  function afterDataChange(symbolsToRefresh) {
    C.saveTodaySnapshot();
    if (App.Sync) App.Sync.markDirty(); // 使用者動作 → 推送雲端
    renderCurrent();
    if (symbolsToRefresh === undefined) symbolsToRefresh = null; // null = 全部
    refresh(symbolsToRefresh && symbolsToRefresh.length ? symbolsToRefresh : undefined);
  }

  // 重建歷史走勢：用交易 + 台股歷史收盤回推每日快照
  async function rebuildHistory() {
    const txs = S.getTransactions();
    if (!txs.length) { UI.toast('尚無交易可重建', 'info'); return 0; }
    // 手續費防呆（SPEC I7）：異常手續費會讓成本爆掉、報表失真 → 明確指出是哪幾檔
    const badFees = C.findAbsurdFees(txs);
    if (badFees.length) {
      const syms = [...new Set(badFees.map(b => b.symbol))].join('、');
      UI.toast(`⚠️ ${syms} 手續費異常偏高，報表恐失真，請檢查交易紀錄`, 'error');
    }
    const mmap = S.metaMap();
    const firstTime = Math.min(...txs.map(t => t.time));
    const firstDate = App.Util.isoDate(new Date(firstTime));
    const all = [...new Set(txs.map(t => t.symbol))];
    const mkOf = c => App.Util.normalizeMarketKey((mmap[c] && mmap[c].market) || App.Util.guessMarketBySymbol(c));
    const twCodes = all.filter(c => mkOf(c) !== App.Util.Market.us && mkOf(c) !== App.Util.Market.crypto);
    const usCodes = all.filter(c => mkOf(c) === App.Util.Market.us);
    const cryptoCodes = all.filter(c => mkOf(c) === App.Util.Market.crypto);
    await Api.fetchFx();
    const [twHist, usHist, cryptoHist] = await Promise.all([
      Api.fetchTwHistory(twCodes, firstDate),
      Api.fetchUsHistory(usCodes, firstDate),
      Api.fetchCryptoHistory(cryptoCodes, firstDate),
    ]);
    const n = C.rebuildSnapshots(Object.assign({}, twHist, usHist, cryptoHist), S.getFxRate());
    C.saveTodaySnapshot();          // 今天用即時價覆蓋
    if (App.Sync) App.Sync.markDirty();
    renderCurrent();
    return n;
  }

  // 缺漏的「交易日(週間)」天數：從最早快照到今天，扣掉週末後仍沒有快照的天數
  function snapshotGapDays() {
    const snaps = S.getSnapshots();
    if (!snaps.length) return 0;
    const have = new Set(snaps.map(s => s.date));
    const min = snaps.reduce((a, s) => (s.date < a ? s.date : a), snaps[0].date);
    const today = App.Util.isoDate();
    let gap = 0;
    const cur = new Date(min + 'T12:00:00+08:00'), end = new Date(today + 'T12:00:00+08:00');
    while (cur <= end) {
      if (!App.Util.isWeekend(cur) && !have.has(App.Util.isoDate(cur))) gap++;
      cur.setDate(cur.getDate() + 1);
    }
    return gap;
  }
  // 登入後自動補齊：每天最多檢查一次；有缺（沒開 App 的那些交易日）就用收盤價補回
  async function maybeBackfill() {
    try {
      if (!navigator.onLine || !S.getTransactions().length) return;
      const today = App.Util.isoDate();
      if (localStorage.getItem('dives_backfill_date') === today) return; // 今天已檢查過
      const gap = snapshotGapDays();
      if (gap <= 0) { localStorage.setItem('dives_backfill_date', today); return; } // 無缺口
      await rebuildHistory();                                    // 用收盤價重建，填平缺口
      localStorage.setItem('dives_backfill_date', today);
      UI.toast(`已自動補齊 ${gap} 天歷史`, 'success');
    } catch (e) { console.warn('auto backfill failed', e); }
  }

  // 載入示範資料（測試用）：現金/負債/台美股+加密/群組/120 天歷史快照
  function seedDemo() {
    const U = App.Util;
    S.clearAll();
    S.setFxRate(31.876);
    S.setCashAccounts([
      { id: S.uuid(), name: 'Firstrade', currency: 'USD', balance: 702 },
      { id: S.uuid(), name: '美金', currency: 'USD', balance: 23 },
      { id: S.uuid(), name: '台幣', currency: 'TWD', balance: 887000 },
    ]);
    S.setLiabilities([{ id: S.uuid(), name: '富邦信貸', currency: 'TWD', balance: 1816358 }]);
    const add = (sym, market, name, shares, price) => {
      S.upsertMeta([{ code: sym, name, market }]);
      C.addTransaction({ symbolInput: sym, type: 'BUY', shares, price, fee: 0, market, name });
    };
    add('2330', 'tse', '台積電', 500, 1800);
    add('0050', 'tse', '元大台灣50', 10000, 150);
    add('2454', 'tse', '聯發科', 100, 1100);
    add('TSLA', 'us', 'Tesla', 130, 300);
    add('GOOGL', 'us', 'Alphabet', 150, 250);
    add('NVDA', 'us', 'NVIDIA', 170, 120);
    add('AAPL', 'us', 'Apple', 50, 180);
    add('BTC', 'crypto', 'Bitcoin', 0.5, 55000);
    add('ETH', 'crypto', 'Ethereum', 3, 2500);
    // 交易日期散布在過去數月，讓群組走勢圖能畫出真實曲線（否則全部同一天＝1 個點）
    const DAY = 86400000, agoBy = { '2330': 165, '0050': 150, '2454': 80, TSLA: 140, GOOGL: 120, NVDA: 95, AAPL: 70, BTC: 60, ETH: 45 };
    S.setTransactions(S.getTransactions().map(t => Object.assign({}, t, { time: Date.now() - (agoBy[t.symbol] || 100) * DAY })));
    S.setPrices({
      '2330': { price: 2505, dailyChange: 20, prevClose: 2485 },
      '0050': { price: 185, dailyChange: 1, prevClose: 184 },
      '2454': { price: 1300, dailyChange: -10, prevClose: 1310 },
      TSLA: { price: 425.3, dailyChange: 5, prevClose: 420.3 },
      GOOGL: { price: 361.21, dailyChange: -2, prevClose: 363.21 },
      NVDA: { price: 197.58, dailyChange: 1.5, prevClose: 196.08 },
      AAPL: { price: 307, dailyChange: -3, prevClose: 310 },
      BTC: { price: 61000, dailyChange: 800, prevClose: 60200 },
      ETH: { price: 2600, dailyChange: -50, prevClose: 2650 },
    });
    const g1 = { id: S.uuid(), name: '核心持股' }, g2 = { id: S.uuid(), name: 'ETF' }, g3 = { id: S.uuid(), name: '小倉位' };
    S.setGroups([g1, g2, g3]);
    S.setGroupMap({ TSLA: g1.id, GOOGL: g1.id, NVDA: g1.id, '2330': g1.id, '0050': g2.id, '2454': g3.id });
    // 120 天歷史快照
    const snaps = [], days = 120, base = Date.now() - (days - 1) * 86400000, cash = 910110, liab = 1816358;
    for (let i = 0; i < days; i++) {
      const d = new Date(base + i * 86400000), t = i / (days - 1);
      const tw = 2200000 + 1032500 * t + Math.sin(i / 7) * 120000;
      const us = 3200000 + 1849400 * t + Math.sin(i / 9) * 200000;
      const cr = 700000 + 520800 * t + Math.cos(i / 5) * 90000;
      const mv = tw + us + cr;
      snaps.push({
        date: U.isoDate(d), twMarketValue: tw, usMarketValueTwd: us, cryptoMarketValueTwd: cr,
        totalMarketValueTwd: mv, netAsset: mv, marketValue: mv, cashBalance: 0, dayPnl: 0,
        totalCostBasisTwd: mv * 0.7, totalPnl: mv * 0.3, realizedPnl: 50000, unrealizedPnl: mv * 0.3 - 50000, totalReturnPct: 42,
        twCostBasis: tw * 0.6, usCostBasisTwd: us * 0.75, twUnrealizedPnl: tw * 0.4, usUnrealizedPnlTwd: us * 0.25,
        twRealizedPnl: 30000, usRealizedPnlTwd: 20000, twTotalPnl: tw * 0.4 + 30000, usTotalPnlTwd: us * 0.25 + 20000,
        twReturnPct: 66, usReturnPct: 33, cryptoCostBasisTwd: cr * 0.8, cryptoUnrealizedPnlTwd: cr * 0.2,
        cryptoRealizedPnlTwd: 0, cryptoTotalPnlTwd: cr * 0.2,
        cashAccountsTwd: cash, liabilitiesTwd: liab, netWorth: mv + cash - liab, createdAt: Date.now(),
      });
    }
    S.setSnapshots(snaps);
    C.saveTodaySnapshot();
    if (App.Sync) App.Sync.markDirty();
    renderCurrent();
  }

  // 對外
  App.renderCurrent = renderCurrent;
  App.afterDataChange = afterDataChange;
  App.switchTab = switchTab;
  App.refresh = refresh;
  App.rebuildHistory = rebuildHistory;
  App.snapshotGapDays = snapshotGapDays;
  App.maybeBackfill = maybeBackfill;
  App.seedDemo = seedDemo;

  // 初始化
  function init() {
    // tab bar 事件（點資產 tab 時退回資產首頁）
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.addEventListener('click', () => {
        if (b.dataset.tab === 'assets' && V.resetAssetsNav) V.resetAssetsNav();
        if (b.dataset.tab === 'report' && V.resetReportNav) V.resetReportNav();
        if (b.dataset.tab === 'portfolio' && V.resetPortfolioNav) V.resetPortfolioNav();
        switchTab(b.dataset.tab);
      }));

    // 左右滑切換分頁
    initSwipe();

    // 從快取立即顯示
    renderCurrent();

    // App 鎖定：啟用則先顯示鎖定畫面，解鎖後才進背景作業
    if (App.Auth && App.Auth.isEnabled()) {
      App.Auth.showLock(startBackground);
    } else {
      startBackground();
    }

    // 回到前景：背景超過逾時則重新鎖定，否則同步 + 視情況刷新
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') { if (App.Auth) App.Auth.noteHidden(); return; }
      if (App.Auth && App.Auth.shouldRelock()) {
        // 鎖定畫面已在顯示就不重複呼叫（避免蓋掉解鎖 callback / 重觸發驗證）
        if (!document.getElementById('lock-overlay')) App.Auth.showLock(() => { foregroundSync(); });
        return;
      }
      foregroundSync();
    });

    // 註冊 Service Worker；新版接管時自動重載一次，更新立即生效
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      const hadController = !!navigator.serviceWorker.controller;
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || reloaded) return; // 首次安裝不重載，避免迴圈
        // 有開 App 鎖定時不自動重載：重載會再觸發一次 Face ID（造成開啟需驗證兩次）。
        // 網路優先已確保內容最新，新版 SW 會在下次啟動接管。
        if (App.Auth && App.Auth.isEnabled()) return;
        reloaded = true;
        window.location.reload();
      });
    }
  }

  // 啟動後的背景作業：雲端拉取 + 報價刷新 + 預載台股代碼表
  function startBackground() {
    (async () => {
      if (App.Sync && App.Sync.enabled()) {
        const r = await App.Sync.pull();
        if (r.changed) renderCurrent();
      }
      const hasTx = S.getTransactions().length > 0;
      if (hasTx) await refresh();
      Api.loadTwUniverse(false).catch(() => {});
      maybeBackfill(); // 登入後自動補齊歷史缺口（每天最多一次）
    })();
  }

  async function foregroundSync() {
    if (App.Sync && App.Sync.enabled()) {
      const r = await App.Sync.pull();
      if (r.changed) renderCurrent();
    }
    const ts = S.getPricesTs();
    if (!ts || Date.now() - ts > 600000) refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
