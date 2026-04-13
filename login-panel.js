// ============================================================
// SHOONYA — Teacher Login Panel
// Inject this on every form with: <script src="../login-panel.js"></script>
// Depends on: config.js (APPS_SCRIPT_URL)
// ============================================================

(function () {

  // ── Storage key ────────────────────────────────────────
  const STORAGE_KEY = 'shoonya_session';

  // ── State ───────────────────────────────────────────────
  let currentProfile = null;
  let currentPin     = null;

  // ── Session helpers ─────────────────────────────────────
  function saveSession(profile, pin) {
    currentProfile = profile;
    currentPin     = pin;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ profile, pin }));
    } catch (e) {}
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clearSession() {
    currentProfile = null;
    currentPin     = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ── Field pre-fill ──────────────────────────────────────
  function fill(id, value) {
    const el = document.getElementById(id);
    if (el && value) {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function prefillForm(profile) {
    const parts = (profile.name || '').trim().split(/\s+/);
    const first = parts[0] || '';
    const last  = parts.slice(1).join(' ') || '';

    // Handle both naming conventions (firstName vs first-name)
    fill('firstName',    first);
    fill('first-name',   first);
    fill('lastName',     last);
    fill('last-name',    last);
    fill('displayName',  profile.name || '');
    fill('display-name', profile.name || '');
    fill('email',        profile.email || '');

    // Smart-form: hook into its remember-me row
    const remName = document.getElementById('remembered-name');
    const remRow  = document.getElementById('remember-row');
    if (remName) remName.textContent = first;
    if (remRow)  remRow.style.display = '';

    // Let forms do extra work if needed
    window.dispatchEvent(new CustomEvent('shoonya:login', { detail: profile }));
  }

  // ── Apps Script call ────────────────────────────────────
  async function appsPost(payload) {
    const url = (typeof APPS_SCRIPT_URL !== 'undefined') ? APPS_SCRIPT_URL : '';
    if (!url) throw new Error('APPS_SCRIPT_URL not set');

    const res  = await fetch(url, {
      method: 'POST', redirect: 'follow', body: JSON.stringify(payload)
    });
    const text = await res.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Bad response from server');
    return JSON.parse(match[0]);
  }

  // ── Render panel ─────────────────────────────────────────
  function renderPanel() {
    const style = `
<style>
#shoonya-login-panel {
  position: relative;
  z-index: 100;
  background: #fff;
  border-bottom: 1.5px solid #eee;
  font-family: 'Helvetica Neue', Arial, sans-serif;
  font-size: 0.84rem;
}
#slp-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 16px;
  gap: 10px;
  flex-wrap: wrap;
  cursor: pointer;
  user-select: none;
}
#slp-bar .slp-left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #1a1a1a;
}
#slp-bar .slp-avatar {
  width: 28px; height: 28px;
  background: #6B3FA0;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-size: 0.7rem; font-weight: 800;
  flex-shrink: 0;
}
#slp-bar .slp-right {
  display: flex; align-items: center; gap: 12px;
  color: #888; font-size: 0.78rem;
}
#slp-bar .slp-logout {
  color: #6B3FA0;
  cursor: pointer;
  font-weight: 700;
  text-decoration: underline;
  font-size: 0.78rem;
  background: none; border: none; padding: 0;
}
#slp-bar .slp-chevron {
  font-size: 0.7rem;
  color: #aaa;
  transition: transform 0.2s;
}
#slp-bar.open .slp-chevron { transform: rotate(180deg); }

/* Collapsed login prompt */
#slp-prompt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  gap: 10px;
  cursor: pointer;
}
#slp-prompt .slp-prompt-text { color: #888; font-size: 0.82rem; }
#slp-prompt .slp-prompt-link {
  color: #6B3FA0; font-weight: 700; font-size: 0.82rem;
  white-space: nowrap;
}

/* Expanded drawer */
#slp-drawer {
  padding: 14px 16px 16px;
  border-top: 1px solid #f0ebff;
  background: #faf7ff;
  display: none;
}
#slp-drawer.open { display: block; }

.slp-form-row {
  display: flex; gap: 8px; align-items: flex-end;
  flex-wrap: wrap;
}
.slp-field { flex: 1; min-width: 130px; }
.slp-field label {
  display: block;
  font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: #888; margin-bottom: 4px;
}
.slp-field input {
  width: 100%;
  padding: 8px 10px;
  border: 1.5px solid #e0e0e0;
  border-radius: 7px;
  font-size: 0.88rem;
  font-family: inherit;
  color: #1a1a1a;
  -webkit-appearance: none;
}
.slp-field input:focus { outline: none; border-color: #6B3FA0; }
.slp-btn-login {
  padding: 8px 16px;
  background: #6B3FA0;
  color: #fff;
  border: none; border-radius: 7px;
  font-size: 0.85rem; font-weight: 800;
  cursor: pointer; white-space: nowrap;
  transition: background 0.2s;
  align-self: flex-end;
}
.slp-btn-login:hover:not(:disabled) { background: #5a3388; }
.slp-btn-login:disabled { opacity: 0.5; cursor: default; }

.slp-links {
  display: flex; gap: 12px; margin-top: 10px;
  font-size: 0.78rem; flex-wrap: wrap;
}
.slp-links a {
  color: #6B3FA0; cursor: pointer; text-decoration: underline;
}

.slp-msg {
  font-size: 0.78rem;
  padding: 7px 10px;
  border-radius: 6px;
  margin-top: 8px;
  display: none;
}
.slp-msg.error   { background: #fdecea; color: #c0392b; display: block; }
.slp-msg.success { background: #e8f5e9; color: #1e7e34; display: block; }
.slp-msg.info    { background: #f0ebff; color: #6B3FA0; display: block; }

/* Forgot PIN sub-form */
#slp-forgot { display: none; margin-top: 12px; }
#slp-forgot.open { display: block; }
.slp-forgot-title {
  font-size: 0.78rem; font-weight: 700; color: #555; margin-bottom: 8px;
}
.slp-spinner {
  display: inline-block;
  width: 12px; height: 12px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: slp-spin 0.7s linear infinite;
  vertical-align: middle; margin-right: 4px;
}
@keyframes slp-spin { to { transform: rotate(360deg); } }
</style>`;

    const loggedOutHTML = `
<div id="slp-prompt" onclick="slpToggleDrawer()">
  <span class="slp-prompt-text">👤 Teacher? Log in to pre-fill your details.</span>
  <span class="slp-prompt-link">Log in ↓</span>
</div>
<div id="slp-drawer">
  <div class="slp-form-row">
    <div class="slp-field">
      <label>Email</label>
      <input type="email" id="slp-email" placeholder="your@email.com" autocomplete="email">
    </div>
    <div class="slp-field">
      <label>PIN</label>
      <input type="password" id="slp-pin" placeholder="••••"
        inputmode="numeric" maxlength="6"
        onkeydown="if(event.key==='Enter')slpLogin()">
    </div>
    <button class="slp-btn-login" id="slp-login-btn" onclick="slpLogin()">Log in</button>
  </div>
  <div class="slp-msg" id="slp-msg"></div>
  <div class="slp-links">
    <a onclick="slpToggleForgot()">Forgot PIN?</a>
    <a href="../register.html">New here? Register →</a>
  </div>
  <div id="slp-forgot">
    <div class="slp-forgot-title">Reset PIN — we'll email you a code</div>
    <div class="slp-form-row">
      <div class="slp-field">
        <label>Email</label>
        <input type="email" id="slp-reset-email" placeholder="your@email.com">
      </div>
      <button class="slp-btn-login" onclick="slpRequestCode()">Send Code</button>
    </div>
    <div id="slp-reset-step2" style="display:none; margin-top:10px;">
      <div class="slp-form-row">
        <div class="slp-field">
          <label>Code (from email)</label>
          <input type="number" id="slp-reset-code" placeholder="123456" maxlength="6">
        </div>
        <div class="slp-field">
          <label>New PIN</label>
          <input type="password" id="slp-new-pin" placeholder="••••"
            inputmode="numeric" maxlength="6">
        </div>
        <button class="slp-btn-login" onclick="slpResetPin()">Set PIN</button>
      </div>
    </div>
    <div class="slp-msg" id="slp-reset-msg"></div>
  </div>
</div>`;

    function loggedInHTML(profile) {
      const initials = (profile.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      const firstName = (profile.name || '').split(' ')[0];
      return `
<div id="slp-bar" onclick="slpToggleDrawer()">
  <div class="slp-left">
    <div class="slp-avatar">${initials}</div>
    <span>Hi, ${firstName}</span>
  </div>
  <div class="slp-right">
    <span>Logged in</span>
    <button class="slp-logout" onclick="event.stopPropagation();slpLogout()">Log out</button>
    <span class="slp-chevron">▼</span>
  </div>
</div>
<div id="slp-drawer">
  <div style="font-size:0.8rem;color:#555;margin-bottom:10px;">
    ${profile.dance_styles || ''}<br>
    <a href="../profile.html" style="color:#6B3FA0;font-weight:700;">View / edit my profile →</a>
  </div>
</div>`;
    }

    // Build and inject
    const panel = document.createElement('div');
    panel.id = 'shoonya-login-panel';
    panel.innerHTML = style;

    const session = loadSession();
    if (session && session.profile) {
      currentProfile = session.profile;
      currentPin     = session.pin;
      panel.innerHTML += loggedInHTML(session.profile);
    } else {
      panel.innerHTML += loggedOutHTML;
    }

    // Inject at top of body
    document.body.insertBefore(panel, document.body.firstChild);

    // If already logged in, prefill
    if (currentProfile) {
      // Wait for DOM to settle
      setTimeout(() => prefillForm(currentProfile), 50);
    }

    // Expose loggedInHTML for re-render after login
    window._slpLoggedInHTML = loggedInHTML;
  }

  // ── Panel interactions ──────────────────────────────────

  window.slpToggleDrawer = function () {
    const drawer = document.getElementById('slp-drawer');
    const bar    = document.getElementById('slp-bar');
    if (!drawer) return;
    const isOpen = drawer.classList.contains('open');
    drawer.classList.toggle('open', !isOpen);
    if (bar) bar.classList.toggle('open', !isOpen);
  };

  window.slpLogin = async function () {
    const email = (document.getElementById('slp-email')?.value || '').trim().toLowerCase();
    const pin   = (document.getElementById('slp-pin')?.value || '').trim();
    const btn   = document.getElementById('slp-login-btn');
    const msg   = document.getElementById('slp-msg');

    if (!email) return slpMsg('slp-msg', 'error', 'Please enter your email.');
    if (!pin)   return slpMsg('slp-msg', 'error', 'Please enter your PIN.');

    btn.disabled = true;
    btn.innerHTML = '<span class="slp-spinner"></span>Logging in…';
    slpClearMsg('slp-msg');

    try {
      const result = await appsPost({ action: 'login', email, pin });
      if (result.ok) {
        saveSession(result.profile, pin);
        // Re-render panel as logged-in
        const panel = document.getElementById('shoonya-login-panel');
        const style = panel.querySelector('style').outerHTML;
        panel.innerHTML = style + window._slpLoggedInHTML(result.profile);
        prefillForm(result.profile);
      } else {
        slpMsg('slp-msg', 'error', result.error || 'Login failed. Please try again.');
        btn.disabled = false;
        btn.innerHTML = 'Log in';
      }
    } catch (err) {
      slpMsg('slp-msg', 'error', 'Connection error. Please try again.');
      btn.disabled = false;
      btn.innerHTML = 'Log in';
    }
  };

  window.slpLogout = function () {
    clearSession();
    location.reload();
  };

  window.slpToggleForgot = function () {
    const el = document.getElementById('slp-forgot');
    if (!el) return;
    const isOpen = el.classList.contains('open');
    el.classList.toggle('open', !isOpen);
    // Pre-fill reset email from login email
    const loginEmail = document.getElementById('slp-email')?.value;
    if (loginEmail) {
      const resetEl = document.getElementById('slp-reset-email');
      if (resetEl) resetEl.value = loginEmail;
    }
  };

  window.slpRequestCode = async function () {
    const email = (document.getElementById('slp-reset-email')?.value || '').trim().toLowerCase();
    if (!email) return slpMsg('slp-reset-msg', 'error', 'Please enter your email.');

    slpClearMsg('slp-reset-msg');
    try {
      const result = await appsPost({ action: 'requestCode', email });
      if (result.ok) {
        document.getElementById('slp-reset-step2').style.display = '';
        slpMsg('slp-reset-msg', 'success', 'Code sent to ' + email);
      } else {
        slpMsg('slp-reset-msg', 'error', result.error || 'Could not send code.');
      }
    } catch (err) {
      slpMsg('slp-reset-msg', 'error', 'Connection error.');
    }
  };

  window.slpResetPin = async function () {
    const email  = (document.getElementById('slp-reset-email')?.value || '').trim().toLowerCase();
    const code   = (document.getElementById('slp-reset-code')?.value || '').trim();
    const newPin = (document.getElementById('slp-new-pin')?.value || '').trim();

    if (!code)   return slpMsg('slp-reset-msg', 'error', 'Please enter the code.');
    if (!newPin) return slpMsg('slp-reset-msg', 'error', 'Please choose a new PIN.');

    slpClearMsg('slp-reset-msg');
    try {
      const result = await appsPost({ action: 'resetPin', email, code, newPin });
      if (result.ok) {
        slpMsg('slp-reset-msg', 'success', 'PIN updated! You can now log in.');
        document.getElementById('slp-forgot').classList.remove('open');
        document.getElementById('slp-reset-step2').style.display = 'none';
        // Pre-fill the login fields
        const emailEl = document.getElementById('slp-email');
        if (emailEl) emailEl.value = email;
      } else {
        slpMsg('slp-reset-msg', 'error', result.error || 'Could not reset PIN.');
      }
    } catch (err) {
      slpMsg('slp-reset-msg', 'error', 'Connection error.');
    }
  };

  // ── Message helpers ─────────────────────────────────────

  function slpMsg(id, type, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'slp-msg ' + type;
    el.textContent = text;
  }

  function slpClearMsg(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = 'slp-msg';
    el.textContent = '';
  }

  window.slpMsg      = slpMsg;
  window.slpClearMsg = slpClearMsg;

  // ── Auto-init on DOM ready ───────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderPanel);
  } else {
    renderPanel();
  }

})();
