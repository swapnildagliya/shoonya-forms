// ============================================================
// SHOONYA — Teacher Login Panel (Modal Overlay)
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

    fill('firstName',    first);
    fill('first-name',   first);
    fill('lastName',     last);
    fill('last-name',    last);
    fill('displayName',  profile.name || '');
    fill('display-name', profile.name || '');
    fill('email',        profile.email || '');

    const remName = document.getElementById('remembered-name');
    const remRow  = document.getElementById('remember-row');
    if (remName) remName.textContent = first;
    if (remRow)  remRow.style.display = '';

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

  // ── Inject styles ────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
/* ── Login Status Bar (slim top bar) ── */
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
}
#slp-bar .slp-left {
  display: flex; align-items: center; gap: 8px;
  font-weight: 600; color: #1a1a1a;
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
  color: #6B3FA0; cursor: pointer; font-weight: 700;
  text-decoration: underline; font-size: 0.78rem;
  background: none; border: none; padding: 0;
}

/* ── NOT LOGGED IN prompt bar ── */
#slp-prompt {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 8px 16px; gap: 10px; cursor: pointer;
}
#slp-prompt .slp-prompt-text { color: #888; font-size: 0.82rem; }
#slp-prompt .slp-prompt-link {
  color: #6B3FA0; font-weight: 700; font-size: 0.82rem;
  white-space: nowrap;
}

/* ── Modal Overlay ── */
#slp-modal-overlay {
  display: none;
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.45);
  z-index: 9999;
  align-items: center;
  justify-content: center;
  animation: slp-fade-in 0.2s ease;
}
#slp-modal-overlay.open { display: flex; }

@keyframes slp-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

#slp-modal {
  background: #fff;
  border-radius: 14px;
  padding: 28px 24px 24px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.25);
  position: relative;
  animation: slp-slide-up 0.25s ease;
  font-family: 'Helvetica Neue', Arial, sans-serif;
}
@keyframes slp-slide-up {
  from { transform: translateY(30px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

#slp-modal .slp-modal-close {
  position: absolute;
  top: 12px; right: 14px;
  background: none; border: none;
  font-size: 1.3rem; color: #999;
  cursor: pointer; line-height: 1;
  padding: 4px;
}
#slp-modal .slp-modal-close:hover { color: #333; }

#slp-modal .slp-modal-title {
  font-size: 1.1rem; font-weight: 800;
  color: #1a1a1a; margin-bottom: 4px;
}
#slp-modal .slp-modal-sub {
  font-size: 0.82rem; color: #888; margin-bottom: 18px;
}

.slp-modal-field { margin-bottom: 14px; }
.slp-modal-field label {
  display: block;
  font-size: 0.72rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: #888; margin-bottom: 5px;
}
.slp-modal-field input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid #e0e0e0;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  color: #1a1a1a;
  box-sizing: border-box;
  -webkit-appearance: none;
}
.slp-modal-field input:focus { outline: none; border-color: #6B3FA0; }

.slp-btn-login {
  width: 100%;
  padding: 11px 16px;
  background: #6B3FA0;
  color: #fff;
  border: none; border-radius: 8px;
  font-size: 0.9rem; font-weight: 800;
  cursor: pointer;
  transition: background 0.2s;
  margin-top: 4px;
}
.slp-btn-login:hover:not(:disabled) { background: #5a3388; }
.slp-btn-login:disabled { opacity: 0.5; cursor: default; }

.slp-modal-links {
  display: flex; gap: 14px; margin-top: 14px;
  font-size: 0.8rem; flex-wrap: wrap;
  justify-content: center;
}
.slp-modal-links a {
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
#slp-forgot { display: none; margin-top: 14px; }
#slp-forgot.open { display: block; }
.slp-forgot-title {
  font-size: 0.8rem; font-weight: 700; color: #555; margin-bottom: 10px;
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
`;
    document.head.appendChild(style);
  }

  // ── Render ────────────────────────────────────────────────
  function renderPanel() {
    injectStyles();

    // Build the top bar (status only — no drawer)
    const panel = document.createElement('div');
    panel.id = 'shoonya-login-panel';

    const session = loadSession();
    if (session && session.profile) {
      currentProfile = session.profile;
      currentPin     = session.pin;
      panel.innerHTML = loggedInBarHTML(session.profile);
    } else {
      panel.innerHTML = `
<div id="slp-prompt" onclick="slpOpenModal()">
  <span class="slp-prompt-text">👤 Teacher? Log in to pre-fill your details.</span>
  <span class="slp-prompt-link">Log in →</span>
</div>`;
    }

    document.body.insertBefore(panel, document.body.firstChild);

    // Build the modal (always present, hidden by default)
    const overlay = document.createElement('div');
    overlay.id = 'slp-modal-overlay';
    overlay.innerHTML = `
<div id="slp-modal">
  <button class="slp-modal-close" onclick="slpCloseModal()">&times;</button>
  <div class="slp-modal-title">Teacher Login</div>
  <div class="slp-modal-sub">Log in to pre-fill your details and track submissions.</div>

  <div class="slp-modal-field">
    <label>Email</label>
    <input type="email" id="slp-email" placeholder="your@email.com" autocomplete="email">
  </div>
  <div class="slp-modal-field">
    <label>PIN</label>
    <input type="password" id="slp-pin" placeholder="••••"
      inputmode="numeric" maxlength="6"
      onkeydown="if(event.key==='Enter')slpLogin()">
  </div>
  <button class="slp-btn-login" id="slp-login-btn" onclick="slpLogin()">Log in</button>

  <div class="slp-msg" id="slp-msg"></div>

  <div class="slp-modal-links">
    <a onclick="slpToggleForgot()">Forgot PIN?</a>
    <a href="../register.html">New here? Register →</a>
  </div>

  <div id="slp-forgot">
    <div class="slp-forgot-title">Reset PIN — we'll email you a code</div>
    <div class="slp-modal-field">
      <label>Email</label>
      <input type="email" id="slp-reset-email" placeholder="your@email.com">
    </div>
    <button class="slp-btn-login" onclick="slpRequestCode()" style="margin-top:8px;">Send Code</button>
    <div id="slp-reset-step2" style="display:none; margin-top:12px;">
      <div class="slp-modal-field">
        <label>Code (from email)</label>
        <input type="number" id="slp-reset-code" placeholder="123456" maxlength="6">
      </div>
      <div class="slp-modal-field">
        <label>New PIN</label>
        <input type="password" id="slp-new-pin" placeholder="••••"
          inputmode="numeric" maxlength="6">
      </div>
      <button class="slp-btn-login" onclick="slpResetPin()">Set PIN</button>
    </div>
    <div class="slp-msg" id="slp-reset-msg"></div>
  </div>
</div>`;

    // Close on overlay click (not on modal itself)
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) slpCloseModal();
    });

    document.body.appendChild(overlay);

    // If already logged in, prefill
    if (currentProfile) {
      setTimeout(() => prefillForm(currentProfile), 50);
    }
  }

  function loggedInBarHTML(profile) {
    const initials = (profile.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
    const firstName = (profile.name || '').split(' ')[0];
    return `
<div id="slp-bar">
  <div class="slp-left">
    <div class="slp-avatar">${initials}</div>
    <span>Hi, ${firstName}</span>
  </div>
  <div class="slp-right">
    <span>Logged in</span>
    <button class="slp-logout" onclick="slpLogout()">Log out</button>
  </div>
</div>`;
  }

  // ── Modal open/close ──────────────────────────────────────

  window.slpOpenModal = function () {
    const overlay = document.getElementById('slp-modal-overlay');
    if (overlay) {
      overlay.classList.add('open');
      // Focus email field
      setTimeout(() => {
        const emailField = document.getElementById('slp-email');
        if (emailField) emailField.focus();
      }, 100);
    }
  };

  window.slpCloseModal = function () {
    const overlay = document.getElementById('slp-modal-overlay');
    if (overlay) overlay.classList.remove('open');
  };

  // Legacy: slpToggleDrawer now opens the modal
  window.slpToggleDrawer = function () {
    slpOpenModal();
  };

  // ── Login ─────────────────────────────────────────────────

  window.slpLogin = async function () {
    const email = (document.getElementById('slp-email')?.value || '').trim().toLowerCase();
    const pin   = (document.getElementById('slp-pin')?.value || '').trim();
    const btn   = document.getElementById('slp-login-btn');

    if (!email) return slpMsg('slp-msg', 'error', 'Please enter your email.');
    if (!pin)   return slpMsg('slp-msg', 'error', 'Please enter your PIN.');

    btn.disabled = true;
    btn.innerHTML = '<span class="slp-spinner"></span>Logging in…';
    slpClearMsg('slp-msg');

    try {
      const result = await appsPost({ action: 'login', email, pin });
      if (result.ok) {
        saveSession(result.profile, pin);
        // Update the top bar to show logged-in state
        const panel = document.getElementById('shoonya-login-panel');
        panel.innerHTML = loggedInBarHTML(result.profile);
        // Close modal
        slpCloseModal();
        // Prefill form
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
