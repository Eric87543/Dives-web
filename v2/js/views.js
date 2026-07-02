/* =========================================================================
 * views.js (v2) — 淨資產首頁 / 新增編輯帳戶 / 統計 / 設定
 * ======================================================================= */
window.App = window.App || {};

App.Views = (function () {
  const U = App.Util, S = App.Store, C = App.Calc, UI = App.UI;

  const collapsed = {}; // 類別收合狀態

  function money(v) { return S.getHide() ? '••••••' : U.fmtWhole(v); }

  /* ===================== 首頁：淨資產 ===================== */
  function home(root) {
    const prices = S.getPrices(), fx = S.getFxRate() || 31.5;
    const sum = C.summary(prices, fx);

    let html = `<div class="nw-head">
      <div class="nw-label">我的淨資產 (TWD) <button class="eye" id="nw-eye">${S.getHide() ? '🙈' : '👁'}</button></div>
      <div class="nw-value">${money(sum.netWorth)}</div>
    </div>
    <div class="acct-list">`;

    for (const cat of S.CATS) {
      const accs = S.getAccounts().filter(a => a.category === cat.key);
      const total = sum.byCat[cat.key];
      if (!accs.length && cat.key !== 'liquid' && cat.key !== 'investment') continue; // 空類別隱藏（除主要兩類）
      const isColl = collapsed[cat.key];
      const shown = cat.key === 'liability' ? -total : total;
      html += `<div class="cat-block" style="--cc:${cat.color}">
        <div class="cat-head ${cat.key === 'liquid' ? 'liquid' : ''}" data-cat="${cat.key}">
          <span class="cat-name">${cat.label}</span>
          <span class="cat-total ${cat.key === 'liability' && total > 0 ? 'neg' : ''}">${cat.key === 'liability' && total > 0 ? '−' : ''}${money(total)}</span>
        </div>`;
      if (!isColl) {
        for (const a of accs) html += accountRow(a, prices, fx);
      }
      html += `</div>`;
    }
    html += `</div>`;
    root.innerHTML = html;

    root.querySelector('#nw-eye').addEventListener('click', () => { S.setHide(!S.getHide()); home(root); });
    root.querySelectorAll('.cat-head').forEach(h => h.addEventListener('click', () => { const k = h.dataset.cat; collapsed[k] = !collapsed[k]; home(root); }));
    root.querySelectorAll('.acct-row').forEach(r => r.addEventListener('click', () => openAccountForm(S.getAccounts().find(a => a.id === r.dataset.id))));
  }

  function accountRow(a, prices, fx) {
    const twd = C.accountValueTwd(a, prices, fx);
    let sub = '';
    if (a.kind === 'stock') {
      const pd = prices[a.symbol];
      const px = pd && pd.price != null ? pd.price : (a.lastPrice || a.costBasis || 0);
      sub = `持有 ${U.formatShares(a.shares || 0)}, ${C.isUsStock(a) ? '$' : ''}${U.formatPrice(px)}`;
    } else if (a.currency === 'USD') {
      sub = `USD ${U.formatPrice(a.balance || 0)}, r${(fx).toFixed(3)}`;
    } else {
      sub = a.note || '修改餘額';
    }
    return `<div class="acct-row" data-id="${a.id}">
      <div class="acct-ic" style="background:${S.cat(a.category).color}22;color:${S.cat(a.category).color}">${a.kind === 'stock' ? '📈' : '💳'}</div>
      <div class="acct-main"><div class="acct-name">${a.name}</div><div class="acct-sub">${sub}</div></div>
      <div class="acct-val ${a.category === 'liability' ? 'neg' : ''}">${a.category === 'liability' ? '−' : ''}${money(twd)}</div>
    </div>`;
  }

  /* ===================== 新增帳戶（選類別）===================== */
  function openAddAccount() {
    const body = `
      <div class="add-cat" data-cat="liquid" data-kind="cash" style="background:#34C759">流動資金</div>
      <div class="add-grp">投資</div>
      <div class="add-sub" data-cat="investment" data-kind="stock">📈 股票</div>
      <div class="add-sub" data-cat="investment" data-kind="fund">💰 投資基金</div>
      <div class="add-sub" data-cat="investment" data-kind="crypto">₿ 加密貨幣</div>
      <div class="add-sub" data-cat="investment" data-kind="metal">🥇 貴金屬</div>
      <div class="add-sub" data-cat="investment" data-kind="other">🌱 其他投資</div>
      <div class="add-cat" data-cat="fixed" data-kind="fixed" style="background:#3B5BDB">固定資產</div>
      <div class="add-cat" data-cat="receivable" data-kind="receivable" style="background:#9DA9F5;color:#111">應收款</div>
      <div class="add-cat" data-cat="liability" data-kind="liability" style="background:#C7D0F7;color:#111">負債</div>`;
    const ov = UI.openSheet('新增帳戶', body, '');
    ov.querySelectorAll('[data-kind]').forEach(el => el.addEventListener('click', () => {
      UI.closeSheet();
      openAccountForm(null, { category: el.dataset.cat, kind: el.dataset.kind });
    }));
  }

  /* ===================== 新增/編輯帳戶表單 ===================== */
  function openAccountForm(editing, preset) {
    const a = editing || {};
    const kind = editing ? a.kind : preset.kind;
    const category = editing ? a.category : preset.category;
    const isStock = kind === 'stock';
    const cur = a.currency || 'TWD';

    const body = `
      ${isStock ? `
        <label class="fld">股票代碼
          ${editing ? `<div class="locked">${a.symbol} ${a.name || ''}</div>`
          : `<input class="input" id="af-sym" placeholder="代碼或名稱（2330、AAPL…）" autocomplete="off"><div class="suggest" id="af-sug"></div>`}
        </label>
        <label class="fld">持股股數<input class="input" id="af-shares" type="number" inputmode="decimal" value="${a.shares != null ? a.shares : ''}"></label>
        <label class="fld">平均成本（每股，選填）<input class="input" id="af-cost" type="number" inputmode="decimal" value="${a.costBasis != null ? a.costBasis : ''}"></label>
      ` : `
        <label class="fld">名稱<input class="input" id="af-name" value="${a.name || ''}" placeholder="帳戶名稱"></label>
        <label class="fld">餘額<input class="input" id="af-bal" type="number" inputmode="decimal" value="${a.balance != null ? a.balance : ''}"></label>
        <label class="fld">幣別
          <div class="cur-seg">
            <button class="cur-btn ${cur === 'TWD' ? 'active' : ''}" data-cur="TWD">台幣</button>
            <button class="cur-btn ${cur === 'USD' ? 'active' : ''}" data-cur="USD">美金</button>
          </div>
        </label>
        <label class="fld">備註（選填）<input class="input" id="af-note" value="${a.note || ''}"></label>
      `}`;
    const footer = `${editing ? '<button class="btn btn-danger" id="af-del">刪除</button>' : ''}
      <button class="btn btn-ghost" id="af-cancel">取消</button><button class="btn btn-primary" id="af-ok">${editing ? '儲存' : '新增'}</button>`;
    const ov = UI.openSheet(editing ? '編輯帳戶' : ('新增' + S.cat(category).label), body, footer);
    const $ = s => ov.querySelector(s);
    let curSel = cur;
    ov.querySelectorAll('.cur-btn').forEach(b => b.addEventListener('click', () => { curSel = b.dataset.cur; ov.querySelectorAll('.cur-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }));

    let picked = editing ? { code: a.symbol, name: a.name, market: a.market } : null;
    if (isStock && !editing) {
      const inp = $('#af-sym'), sug = $('#af-sug'); let timer = null;
      inp.addEventListener('input', () => {
        const q = inp.value.trim(); clearTimeout(timer); if (!q) { sug.innerHTML = ''; return; }
        timer = setTimeout(async () => {
          const res = await App.Api.searchSymbols(q);
          sug.innerHTML = res.map(r => `<div class="sug-item" data-code="${r.code}" data-name="${encodeURIComponent(r.name)}" data-mk="${r.market}"><span class="sc">${r.code}</span><span class="sn">${r.name}</span><span class="sm">${U.marketLabel(r.market)}</span></div>`).join('');
          sug.querySelectorAll('.sug-item').forEach(it => it.addEventListener('click', () => {
            picked = { code: it.dataset.code, name: decodeURIComponent(it.dataset.name), market: it.dataset.mk };
            inp.value = picked.code + ' ' + picked.name; sug.innerHTML = ''; $('#af-shares').focus();
          }));
        }, 220);
      });
    }

    $('#af-cancel').addEventListener('click', UI.closeSheet);
    if ($('#af-del')) $('#af-del').addEventListener('click', () => UI.confirmDialog('刪除此帳戶?', () => { S.deleteAccount(a.id); UI.closeSheet(); App.afterChange(); }, '刪除'));
    $('#af-ok').addEventListener('click', () => {
      if (isStock) {
        const shares = parseFloat($('#af-shares').value);
        if (!editing && !picked) return UI.toast('請選擇股票', 'info');
        if (!(shares > 0)) return UI.toast('請輸入股數', 'info');
        const cost = parseFloat($('#af-cost').value);
        if (editing) S.updateAccount(a.id, { shares, costBasis: isNaN(cost) ? a.costBasis : cost });
        else S.addAccount({ name: picked.name, category: 'investment', kind: 'stock', symbol: picked.code, market: picked.market, shares, costBasis: isNaN(cost) ? undefined : cost, currency: U.normalizeMarketKey(picked.market) === U.Market.us ? 'USD' : 'TWD' });
        UI.closeSheet(); App.afterChange([picked ? picked.code : a.symbol]);
      } else {
        const name = ($('#af-name').value || '').trim();
        const bal = parseFloat($('#af-bal').value);
        if (!name) return UI.toast('請輸入名稱', 'info');
        if (isNaN(bal)) return UI.toast('請輸入餘額', 'info');
        const note = ($('#af-note').value || '').trim();
        if (editing) S.updateAccount(a.id, { name, balance: bal, currency: curSel, note });
        else S.addAccount({ name, category, kind, balance: bal, currency: curSel, note });
        UI.closeSheet(); App.afterChange();
      }
    });
  }

  /* ===================== 統計 ===================== */
  function stats(root) {
    const snaps = S.getSnapshots().slice().sort((a, b) => a.date < b.date ? -1 : 1);
    root.innerHTML = `<div class="stat-title">淨資產趨勢</div>
      <div class="card2"><div class="chart-host" id="nw-chart"></div></div>
      <div class="stat-note">每日淨資產變化（開啟 App 或按重新整理時記錄）</div>`;
    const points = snaps.map(s => ({ date: new Date(s.date + 'T00:00:00+08:00'), values: { tw: s.assets, us: 0 } }));
    // 用堆疊圖顯示資產(不含負債的淨值以 total 呈現) — 這裡以淨資產單線
    drawNetWorth(root.querySelector('#nw-chart'), snaps);
  }

  function drawNetWorth(host, snaps) {
    if (!snaps.length) { host.innerHTML = '<div class="chart-empty">暫無資料</div>'; return; }
    const pts = snaps.map(s => ({ date: new Date(s.date + 'T00:00:00+08:00'), values: { tw: s.netWorth, us: 0 } }));
    App.Charts.trend(host, pts, { twKey: 'tw', usKey: 'us', twLabel: '淨資產', usLabel: '', valueFmt: v => 'NT$ ' + U.fmtKMBB(v), xLabels: monthLabels(pts) });
  }
  function monthLabels(points) {
    if (!points.length) return [];
    const out = [], seen = new Set(); const multi = new Set(points.map(p => p.date.getFullYear())).size > 1;
    points.forEach((p, i) => { const k = p.date.getFullYear() + '-' + p.date.getMonth(); if (!seen.has(k)) { seen.add(k); out.push({ idx: i, label: multi ? `${String(p.date.getFullYear()).slice(2)}/${p.date.getMonth() + 1}月` : `${p.date.getMonth() + 1}月` }); } });
    if (out.length <= 6) return out; const step = Math.ceil(out.length / 6); return out.filter((_, i) => i % step === 0);
  }

  /* ===================== 帳戶 CSV ===================== */
  function exportCsv() {
    const head = 'Name,Category,Kind,Currency,Balance,Symbol,Market,Shares,CostBasis,Note';
    const esc = v => { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const lines = [head];
    for (const a of S.getAccounts())
      lines.push([a.name, a.category, a.kind, a.currency || '', a.balance != null ? a.balance : '', a.symbol || '', a.market || '', a.shares != null ? a.shares : '', a.costBasis != null ? a.costBasis : '', a.note || ''].map(esc).join(','));
    return lines.join('\n');
  }
  function importCsv(text) {
    const rows = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!rows.length) return { ok: false, msg: '空檔' };
    const start = rows[0].toLowerCase().includes('category') ? 1 : 0;
    const out = [];
    for (let i = start; i < rows.length; i++) {
      const p = rows[i].split(','); if (p.length < 3) continue;
      const acc = { name: p[0], category: p[1], kind: p[2], currency: p[3] || 'TWD' };
      if (p[4] !== '') acc.balance = parseFloat(p[4]);
      if (p[5]) acc.symbol = p[5]; if (p[6]) acc.market = p[6];
      if (p[7] !== '') acc.shares = parseFloat(p[7]); if (p[8] !== '' && p[8] != null) acc.costBasis = parseFloat(p[8]);
      if (p[9]) acc.note = p[9];
      acc.id = S.uuid(); acc.updatedAt = Date.now();
      out.push(acc);
    }
    if (!out.length) return { ok: false, msg: '無可匯入帳戶' };
    S.setAccounts(out);
    return { ok: true, count: out.length };
  }

  /* ===================== 設定 ===================== */
  function settings(root) {
    root.innerHTML = `<div class="page2">
      <div class="card2">
        <div class="s-title">雲端同步（GitHub Gist）</div>
        <div class="s-row"><input class="input" id="sync-token" type="password" placeholder="貼上 GitHub Token（gist 權限）" value="${App.Sync && App.Sync.enabled() ? '••••••••' : ''}"><button class="btn btn-primary" id="sync-save">${App.Sync && App.Sync.enabled() ? '更新' : '啟用'}</button></div>
        <div class="s-row" style="margin-top:8px"><button class="btn btn-ghost" style="flex:1" id="sync-now" ${App.Sync && App.Sync.enabled() ? '' : 'disabled'}>立即同步</button>${App.Sync && App.Sync.enabled() ? '<button class="btn btn-ghost" style="flex:1" id="sync-off">停用</button>' : ''}</div>
        <div class="s-hint" id="sync-status">${App.Sync && App.Sync.enabled() ? '同步已啟用' : '各裝置貼同一 token 即同步'}</div>
        <div class="s-hint"><a href="https://github.com/settings/tokens/new?scopes=gist&description=dives2-sync" target="_blank" style="color:#7C6CF0">→ 產生 GitHub Token</a></div>
      </div>
      <div class="card2"><div class="s-title">App 鎖定</div><div id="lock-body"></div></div>
      <div class="card2">
        <div class="s-title">資料備份</div>
        <button class="btn btn-block btn-primary" id="s-export">匯出帳戶 CSV</button>
        <label class="btn btn-block btn-ghost" for="s-import">匯入帳戶 CSV</label>
        <input type="file" id="s-import" accept=".csv" style="display:none">
      </div>
      <div class="card2">
        <div class="s-title">進階</div>
        <div class="s-hint">CORS 代理</div><input class="input" id="s-proxy" value="${S.getProxy()}">
        <button class="btn btn-block btn-ghost" id="s-adv" style="margin-top:8px">儲存</button>
      </div>
      <div class="card2"><div class="s-title" style="color:#FF453A">危險區域</div><button class="btn btn-block btn-danger" id="s-clear">清空所有帳戶</button></div>
    </div>`;

    // 同步
    const st = root.querySelector('#sync-status');
    if (App.Sync) App.Sync.onStatus(s => { if (!s) return; if (s === 'syncing') st.textContent = '同步中…'; else if (s.startsWith('synced:')) { const t = +s.slice(7); st.textContent = t ? '已同步 · ' + new Date(t).toLocaleString('zh-TW') : '已同步'; } else if (s.startsWith('error:')) st.textContent = '同步失敗：' + s.slice(6); });
    root.querySelector('#sync-save').addEventListener('click', async () => { const t = root.querySelector('#sync-token').value.trim(); if (!t || t.startsWith('••')) return UI.toast('請貼上 Token', 'info'); UI.toast('啟用中…', 'info'); const r = await App.Sync.enable(t); if (r.error) return UI.toast('失敗：' + r.error, 'error'); UI.toast('同步已啟用', 'success'); App.renderCurrent(); });
    if (root.querySelector('#sync-now')) root.querySelector('#sync-now').addEventListener('click', async () => { const r = await App.Sync.pull(); if (r.error) UI.toast('失敗：' + r.error, 'error'); else { UI.toast('同步完成', 'success'); if (r.changed) App.renderCurrent(); } });
    if (root.querySelector('#sync-off')) root.querySelector('#sync-off').addEventListener('click', () => UI.confirmDialog('停用同步?', () => { App.Sync.disable(); settings(root); }, '停用'));

    // CSV
    root.querySelector('#s-export').addEventListener('click', () => {
      const blob = new Blob([exportCsv()], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `networth_${U.isoDate()}.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); UI.toast('已匯出', 'success');
    });
    root.querySelector('#s-import').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const r = importCsv(String(rd.result)); if (r.ok) { UI.toast('匯入 ' + r.count + ' 個帳戶', 'success'); App.afterChange(); } else UI.toast(r.msg, 'error'); }; rd.readAsText(f); e.target.value = ''; });

    // 進階
    root.querySelector('#s-adv').addEventListener('click', () => { S.setProxy(root.querySelector('#s-proxy').value.trim()); UI.toast('已儲存', 'success'); });
    root.querySelector('#s-clear').addEventListener('click', () => UI.confirmDialog('清空所有帳戶與快照?無法復原。', () => { S.clearAll(); UI.toast('已清空', 'info'); App.afterChange(); }, '清空'));

    // App 鎖定
    renderLockBody(root.querySelector('#lock-body'), root);
  }

  async function renderLockBody(el, root) {
    const A = App.Auth; if (!el || !A) return;
    if (!A.isEnabled()) { el.innerHTML = `<div class="s-hint">啟用後開啟 App 需密碼或 Face ID</div><button class="btn btn-block btn-primary" id="lk-on" style="margin-top:8px">啟用 App 鎖定</button>`; el.querySelector('#lk-on').addEventListener('click', () => openLockSetup(false, () => settings(root))); return; }
    const faceAvail = await A.isWebAuthnAvailable(), hasFace = A.hasWebAuthn(), t = A.getTimeout();
    el.innerHTML = `<div class="lock-row"><span>密碼</span><button class="btn btn-ghost btn-sm" id="lk-pin">變更</button></div>
      ${faceAvail ? `<div class="lock-row"><span>Face ID / 指紋</span><label class="switch"><input type="checkbox" id="lk-face" ${hasFace ? 'checked' : ''}><span></span></label></div>` : '<div class="s-hint">此裝置不支援生物辨識</div>'}
      <div class="lock-row"><span>自動鎖定</span><select class="input" id="lk-to" style="width:auto"><option value="0">立即</option><option value="1">1 分鐘</option><option value="5">5 分鐘</option><option value="15">15 分鐘</option><option value="60">1 小時</option></select></div>
      <button class="btn btn-block btn-danger" id="lk-off" style="margin-top:10px">停用 App 鎖定</button>`;
    el.querySelector('#lk-to').value = String(t);
    el.querySelector('#lk-pin').addEventListener('click', () => openLockSetup(true, () => UI.toast('密碼已變更', 'success')));
    el.querySelector('#lk-to').addEventListener('change', e => { A.setTimeout(+e.target.value); UI.toast('已更新', 'success'); });
    el.querySelector('#lk-off').addEventListener('click', () => UI.confirmDialog('停用 App 鎖定?', () => { A.disable(); settings(root); }, '停用'));
    const ft = el.querySelector('#lk-face');
    if (ft) ft.addEventListener('change', async () => { if (ft.checked) { try { await A.registerWebAuthn(); UI.toast('已啟用 Face ID', 'success'); } catch (e) { ft.checked = false; UI.toast('取消或失敗', 'error'); } } else { A.disableWebAuthn(); UI.toast('已關閉', 'info'); } });
  }
  function openLockSetup(isChange, onDone) {
    const ov = UI.openSheet(isChange ? '變更密碼' : '設定密碼', `<label class="fld">密碼（4–6 位數字）<input class="input" id="p1" type="password" inputmode="numeric" maxlength="6"></label><label class="fld">再次輸入<input class="input" id="p2" type="password" inputmode="numeric" maxlength="6"></label><div class="s-hint" id="pe" style="color:#FF453A;min-height:16px"></div>`, `<button class="btn btn-ghost" id="pc">取消</button><button class="btn btn-primary" id="po">確認</button>`);
    const $ = s => ov.querySelector(s); $('#p1').focus();
    $('#pc').addEventListener('click', UI.closeSheet);
    $('#po').addEventListener('click', async () => { const a = $('#p1').value, b = $('#p2').value; if (!/^\d{4,6}$/.test(a)) return $('#pe').textContent = '請輸入 4–6 位數字'; if (a !== b) return $('#pe').textContent = '兩次不一致'; if (isChange) await App.Auth.setPin(a); else await App.Auth.enable(a); UI.closeSheet(); onDone && onDone(); });
  }

  return { home, stats, settings, openAddAccount, openAccountForm };
})();
