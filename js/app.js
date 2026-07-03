/* =========================================================================
 * app.js — 主控制器：分頁路由、報價刷新、初始化
 * ======================================================================= */
(function () {
  const V = App.Views, S = App.Store, C = App.Calc, UI = App.UI, Api = App.Api;
  App.VERSION = 'v31';

  let currentTab = 'assets';
  const TABS = [
    { id: 'portfolio', label: '持倉', icon: '📊' },
    { id: 'history', label: '歷史', icon: '📈' },
    { id: 'report', label: '報表', icon: '📋' },
    { id: 'settings', label: '設定', icon: '⚙️' },
  ];

  function renderCurrent() {
    const root = document.getElementById('view');
    if (!root) return;
    root.scrollTop = 0;
    switch (currentTab) {
      case 'portfolio': V.portfolio(root); break;
      case 'assets': V.assets(root); break;
      case 'history': V.history(root); break;
      case 'report': V.report(root); break;
      case 'settings': V.settings(root); break;
    }
    // FAB 只在持倉頁顯示
    document.getElementById('fab').style.display = currentTab === 'portfolio' ? 'flex' : 'none';
    // tab bar 高亮
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === currentTab));
    updateHeader();
  }

  function switchTab(id) { currentTab = id; renderCurrent(); }

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
  App.seedDemo = seedDemo;

  // 初始化
  function init() {
    // tab bar 事件
    document.querySelectorAll('.tab-btn').forEach(b =>
      b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.getElementById('fab').addEventListener('click', () => V.openTxForm(null));
    document.getElementById('refresh-btn').addEventListener('click', () => refresh(undefined, true));

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
        App.Auth.showLock(() => { foregroundSync(); });
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
      if (hasTx) refresh();
      Api.loadTwUniverse(false).catch(() => {});
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
