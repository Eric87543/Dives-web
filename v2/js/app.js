/* =========================================================================
 * app.js (v2) — 控制器：分頁 / 刷新 / 鎖定 / 同步
 * ======================================================================= */
(function () {
  const V = App.Views, S = App.Store, C = App.Calc, UI = App.UI, Api = App.Api;
  let tab = 'home';

  function renderCurrent() {
    const root = document.getElementById('view'); if (!root) return;
    root.scrollTop = 0;
    if (tab === 'home') V.home(root);
    else if (tab === 'stats') V.stats(root);
    else V.settings(root);
    document.getElementById('fab').style.display = tab === 'home' ? 'flex' : 'none';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    const el = document.getElementById('last-updated'); const ts = S.getPricesTs();
    if (el) el.textContent = ts ? new Date(ts).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function switchTab(t) { tab = t; renderCurrent(); }

  function stockMetas() {
    return S.getAccounts().filter(a => a.kind === 'stock' && a.symbol).map(a => ({ code: a.symbol, market: a.market || App.Util.guessMarketBySymbol(a.symbol) }));
  }

  let refreshing = false;
  async function refresh(doSync) {
    if (refreshing) return; refreshing = true;
    const btn = document.getElementById('refresh-btn'); btn && btn.classList.add('spin');
    try {
      if (doSync && App.Sync && App.Sync.enabled()) { const r = await App.Sync.pull(); if (r.changed) renderCurrent(); }
      await Api.refreshPrices(stockMetas());
      const isNew = C.saveTodaySnapshot(); if (isNew && App.Sync) App.Sync.markDirty();
      renderCurrent();
    } catch (e) { console.error(e); UI.toast('更新失敗', 'error'); }
    finally { refreshing = false; btn && btn.classList.remove('spin'); }
  }

  function afterChange(symbols) {
    C.saveTodaySnapshot(); if (App.Sync) App.Sync.markDirty(); renderCurrent(); refresh();
  }

  App.renderCurrent = renderCurrent; App.switchTab = switchTab; App.refresh = refresh; App.afterChange = afterChange;

  function startBg() {
    (async () => {
      if (App.Sync && App.Sync.enabled()) { const r = await App.Sync.pull(); if (r.changed) renderCurrent(); }
      if (stockMetas().length) refresh();
      Api.loadTwUniverse(false).catch(() => {});
    })();
  }
  async function fgSync() {
    if (App.Sync && App.Sync.enabled()) { const r = await App.Sync.pull(); if (r.changed) renderCurrent(); }
    const ts = S.getPricesTs(); if (!ts || Date.now() - ts > 600000) refresh();
  }

  function init() {
    document.querySelectorAll('.tab-btn').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    document.getElementById('fab').addEventListener('click', () => V.openAddAccount());
    document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));
    renderCurrent();

    if (App.Auth && App.Auth.isEnabled()) App.Auth.showLock(startBg); else startBg();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { if (App.Auth) App.Auth.noteHidden(); return; }
      if (App.Auth && App.Auth.shouldRelock()) { App.Auth.showLock(() => fgSync()); return; }
      fgSync();
    });
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
