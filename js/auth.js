/* =========================================================================
 * auth.js — App 鎖定（本機隱私閘門）
 *   PIN：SHA-256(salt+pin) 存本機
 *   Face ID / Touch ID：WebAuthn platform passkey（iOS 16.4+ 主畫面 PWA 可用）
 *   逾時：背景超過設定分鐘數，回前景需重新解鎖
 * 註：無後端，屬本機解鎖閘門，非伺服器身分驗證。
 * ======================================================================= */
window.App = window.App || {};

App.Auth = (function () {
  const K = {
    enabled: 'dives_lock_enabled',
    pin: 'dives_lock_pin', salt: 'dives_lock_salt', pinLen: 'dives_lock_pinlen',
    cred: 'dives_lock_cred', timeout: 'dives_lock_timeout',
  };

  let unlocked = false;
  let hiddenAt = 0;
  let webAuthnAvail = null; // 快取生物辨識可用性（一次會話內不變；避免設定頁非同步造成閃動）

  // ---- 小工具 ----
  function rand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  async function sha256hex(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function b64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
  function unb64(s) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

  // ---- 狀態 ----
  function isEnabled() { return localStorage.getItem(K.enabled) === '1'; }
  function hasWebAuthn() { return !!localStorage.getItem(K.cred); }
  function getTimeout() { const v = localStorage.getItem(K.timeout); return v == null ? 5 : +v; } // 分鐘
  function setTimeout_(min) { localStorage.setItem(K.timeout, String(min)); }
  function pinLen() { return +localStorage.getItem(K.pinLen) || 4; }

  async function isWebAuthnAvailable() {
    if (webAuthnAvail !== null) return webAuthnAvail;
    try {
      webAuthnAvail = !!(window.PublicKeyCredential &&
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch (e) { webAuthnAvail = false; }
    return webAuthnAvail;
  }
  function webAuthnAvailableSync() { return webAuthnAvail; } // 已快取回 true/false；未知回 null

  // ---- PIN ----
  async function setPin(pin) {
    const salt = b64(rand(16));
    localStorage.setItem(K.salt, salt);
    localStorage.setItem(K.pin, await sha256hex(salt + pin));
    localStorage.setItem(K.pinLen, String(pin.length));
  }
  async function verifyPin(pin) {
    const salt = localStorage.getItem(K.salt) || '';
    const want = localStorage.getItem(K.pin) || '';
    return want && (await sha256hex(salt + pin)) === want;
  }

  // ---- WebAuthn（Face ID）----
  async function registerWebAuthn() {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rand(32),
        rp: { name: 'Dives', id: location.hostname },
        user: { id: rand(16), name: 'dives-user', displayName: 'Dives' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000, attestation: 'none',
      }
    });
    localStorage.setItem(K.cred, b64(cred.rawId));
    return true;
  }
  function disableWebAuthn() { localStorage.removeItem(K.cred); }

  async function tryFaceId() {
    const id = localStorage.getItem(K.cred);
    if (!id) return false;
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: rand(32), rpId: location.hostname,
          allowCredentials: [{ type: 'public-key', id: unb64(id) }],
          userVerification: 'required', timeout: 60000,
        }
      });
      return true; // 本機閘門：assertion 成功即解鎖
    } catch (e) { return false; }
  }

  // ---- 啟用 / 停用 ----
  async function enable(pin) { await setPin(pin); localStorage.setItem(K.enabled, '1'); unlocked = true; }
  function disable() {
    [K.enabled, K.pin, K.salt, K.pinLen, K.cred].forEach(k => localStorage.removeItem(k));
    unlocked = true;
  }

  // ---- 逾時 ----
  function noteHidden() { hiddenAt = Date.now(); }
  function shouldRelock() {
    if (!isEnabled()) return false;
    if (!unlocked) return true;
    const ms = getTimeout() * 60000;
    return (Date.now() - hiddenAt) > ms;
  }

  // ---- 鎖定畫面 ----
  let onUnlockCb = null;
  function showLock(onUnlock) {
    unlocked = false;
    onUnlockCb = onUnlock || null;
    if (document.getElementById('lock-overlay')) return;
    const faceEnabled = hasWebAuthn();
    const ov = document.createElement('div');
    ov.id = 'lock-overlay';
    ov.className = 'lock-overlay';
    ov.innerHTML = `
      <div class="lock-box">
        <img class="lock-icon" src="icons/icon-192.png" alt="">
        <div class="lock-title">Dives</div>
        <div class="lock-sub" id="lock-sub">輸入密碼解鎖</div>
        <div class="pin-dots" id="pin-dots"></div>
        <div class="pin-pad" id="pin-pad"></div>
        ${faceEnabled ? `<button class="faceid-btn" id="faceid-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 16v2a2 2 0 0 1-2 2h-2"/><path d="M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 9.5v1"/><path d="M15 9.5v1"/><path d="M12 9v3.5"/><path d="M9.2 15c.8.7 1.8 1 2.8 1s2-.3 2.8-1"/></svg>
          <span id="faceid-label">使用 Face ID</span>
        </button>` : ''}
      </div>`;
    document.body.appendChild(ov);

    const len = pinLen();
    let entered = '';
    const dotsEl = ov.querySelector('#pin-dots');
    const subEl = ov.querySelector('#lock-sub');
    function renderDots(err) {
      dotsEl.innerHTML = Array.from({ length: len }, (_, i) =>
        `<span class="pin-dot ${i < entered.length ? 'filled' : ''} ${err ? 'err' : ''}"></span>`).join('');
    }
    renderDots();

    const pad = ov.querySelector('#pin-pad');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    pad.innerHTML = keys.map(k =>
      k === '' ? `<span class="pin-key empty"></span>` : `<button class="pin-key" data-k="${k}">${k}</button>`).join('');

    async function submit() {
      if (await verifyPin(entered)) {
        unlock();
      } else {
        entered = '';
        subEl.textContent = '密碼錯誤，請重試';
        renderDots(true);
        if (navigator.vibrate) navigator.vibrate(200);
        window.setTimeout(() => { subEl.textContent = '輸入密碼解鎖'; renderDots(); }, 800);
      }
    }
    pad.querySelectorAll('.pin-key[data-k]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.k;
      if (k === '⌫') { entered = entered.slice(0, -1); renderDots(); return; }
      if (entered.length >= len) return;
      entered += k; renderDots();
      if (entered.length === len) submit();
    }));

    const faceBtn = ov.querySelector('#faceid-btn');
    const setFaceLabel = txt => { const l = faceBtn && faceBtn.querySelector('#faceid-label'); if (l) l.textContent = txt; };
    let facing = false;
    async function faceFlow() {
      if (facing) return; facing = true;
      setFaceLabel('驗證中…');
      const ok = await tryFaceId();
      facing = false;
      if (ok) unlock();
      else { setFaceLabel('使用 Face ID'); subEl.textContent = 'Face ID 失敗，可改用密碼'; }
    }
    if (faceEnabled) {
      subEl.textContent = '點一下以 Face ID 解鎖，或輸入密碼';
      // iOS WebAuthn 需在使用者手勢中呼叫才會直接跳臉部辨識(免再點「使用通行密鑰」)。
      // 因此改為：點畫面任一處(數字鍵除外)即以手勢觸發 Face ID → 一次點擊直達。
      ov.addEventListener('pointerdown', e => {
        if (e.target.closest('.pin-key')) return; // 想改用密碼 → 不攔，保留給下一次
        faceFlow();
      });
    }
  }

  function unlock() {
    unlocked = true;
    hiddenAt = Date.now();
    const ov = document.getElementById('lock-overlay');
    if (ov) { ov.classList.add('hide'); setTimeout(() => ov.remove(), 250); }
    const cb = onUnlockCb; onUnlockCb = null;
    if (cb) cb();
  }

  isWebAuthnAvailable(); // 預熱快取：開 App 即查一次，設定頁渲染時可同步取用、不再閃動

  return {
    isEnabled, hasWebAuthn, isWebAuthnAvailable, webAuthnAvailableSync, getTimeout, setTimeout: setTimeout_,
    setPin, verifyPin, registerWebAuthn, disableWebAuthn, tryFaceId,
    enable, disable, noteHidden, shouldRelock, showLock, unlock,
  };
})();
