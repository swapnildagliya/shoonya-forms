// ============================================================
// SHOONYA — Shared top-nav header
// ------------------------------------------------------------
// Renders a consistent dark navigation bar across every page:
//   smart-form/index.html · schedule.html · register.html · profile.html
//
// To use on a page:
//   <div id="shared-header"></div>
//   <script src="shared-header.js"></script>          (root pages)
//   <script src="../shared-header.js"></script>        (subfolder pages)
//
// The script auto-detects whether it's loaded from a subfolder and adjusts
// internal links so Home / Schedule / Register/Profile resolve correctly.
// Login state is read from localStorage.shoonya_session — same key used by
// register.html and login-panel.js.
// ============================================================

(function () {
  // ── Detect base path ──────────────────────────────────────────────────
  // Find the URL of THIS script tag, then compare to current page URL.
  // If we're a level deeper than the script, we need '../' to navigate up.
  let basePath = '';
  const me = document.currentScript || (function () {
    const all = document.getElementsByTagName('script');
    for (let i = all.length - 1; i >= 0; i--) {
      if (/shared-header\.js(\?|$)/.test(all[i].src || '')) return all[i];
    }
    return null;
  })();
  if (me) {
    try {
      const scriptDir = new URL(me.src, window.location.href).pathname.replace(/[^/]+$/, '');
      const pageDir   = window.location.pathname.replace(/[^/]+$/, '');
      if (pageDir.length > scriptDir.length && pageDir.indexOf(scriptDir) === 0) {
        const extra = pageDir.slice(scriptDir.length).split('/').filter(Boolean).length;
        basePath = '../'.repeat(extra);
      }
    } catch (e) { /* fall through to '' */ }
  }

  // ── Login state ───────────────────────────────────────────────────────
  let profile = null;
  try {
    const sess = JSON.parse(localStorage.getItem('shoonya_session') || '{}');
    if (sess && sess.profile && sess.profile.email) profile = sess.profile;
  } catch (e) {}

  const profileLabel = profile
    ? '👤 ' + (String(profile.name || profile.email).split(' ')[0])
    : '👤 Log in';
  const profileHref = profile ? basePath + 'profile.html' : basePath + 'register.html';

  // ── Detect current page (for active-state styling) ───────────────────
  const path = window.location.pathname;
  const isHome     = /(?:^|\/)(?:smart-form\/)?index\.html?$/.test(path) || path.endsWith('/');
  const isSchedule = /\/schedule\.html$/.test(path);
  const isRegister = /\/register\.html$/.test(path);
  const isProfile  = /\/profile\.html$/.test(path);

  // ── Render ────────────────────────────────────────────────────────────
  const styleHTML = `
    <style>
      .sh-wrap { background: #1a1a2e; color: #fff; padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
      .sh-brand { font-size: 14px; font-weight: 500; color: #fff; text-decoration: none; letter-spacing: 0.4px; text-transform: uppercase; }
      .sh-brand:hover { color: #FBC70F; }
      .sh-nav { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
      .sh-btn {
        background: rgba(255,255,255,0.06);
        color: #fff;
        border: 1px solid rgba(255,255,255,0.15);
        padding: 8px 14px;
        min-height: 36px;
        border-radius: 4px;
        font-size: 13px;
        font-family: inherit;
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: background .15s, border-color .15s, color .15s;
      }
      .sh-btn:hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.3); }
      .sh-btn:focus-visible { outline: 2px solid #FBC70F; outline-offset: 2px; }
      .sh-btn.active { background: rgba(181,100,247,0.22); border-color: #B564F7; color: #fff; }
      .sh-dropdown { position: relative; display: inline-block; }
      .sh-dropdown-menu {
        position: absolute;
        top: calc(100% + 6px);
        right: 0;
        background: #1a1a2e;
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 4px;
        min-width: 180px;
        z-index: 1000;
        padding: 4px 0;
        box-shadow: 0 6px 20px rgba(0,0,0,0.35);
      }
      .sh-dropdown-menu a {
        display: block;
        padding: 10px 14px;
        color: #fff;
        text-decoration: none;
        font-size: 13px;
      }
      .sh-dropdown-menu a:hover { background: rgba(255,255,255,0.10); }
      .sh-dropdown-menu a:focus-visible { outline: 2px solid #FBC70F; outline-offset: -2px; }
      .sh-dropdown-menu[hidden] { display: none; }
      @media (max-width: 560px) {
        .sh-wrap { padding: 10px 12px; }
        .sh-brand { font-size: 12px; }
        .sh-btn { padding: 8px 11px; font-size: 12px; }
      }
    </style>
  `;

  const html = `
    <header class="sh-wrap" role="banner">
      <a class="sh-brand" href="https://shoonyadance.com" aria-label="Shoonya Dance Centre — main site">Shoonya Dance Centre</a>
      <nav class="sh-nav" aria-label="Primary">
        <a class="sh-btn ${isHome ? 'active' : ''}" href="${basePath}index.html">🏠 Home</a>
        <div class="sh-dropdown">
          <button type="button" class="sh-btn ${isSchedule ? 'active' : ''}" id="sh-schedule-btn" aria-haspopup="true" aria-expanded="false">📅 Schedule ▾</button>
          <div class="sh-dropdown-menu" id="sh-schedule-menu" role="menu" hidden>
            <a role="menuitem" href="${basePath}schedule.html?view=weekly">Weekly classes</a>
            <a role="menuitem" href="${basePath}schedule.html?view=workshops">Workshops</a>
            <a role="menuitem" href="${basePath}schedule.html?view=socials">Social nights</a>
          </div>
        </div>
        ${profile
          ? `<a class="sh-btn ${isProfile ? 'active' : ''}" href="${profileHref}">${profileLabel}</a>`
          : `<a class="sh-btn ${isRegister ? 'active' : ''}" href="${basePath}register.html">Register</a>
             <a class="sh-btn" href="${profileHref}">${profileLabel}</a>`}
      </nav>
    </header>
  `;

  // ── Insert into placeholder (or top of body) ─────────────────────────
  function inject() {
    const placeholder = document.getElementById('shared-header');
    if (placeholder) {
      placeholder.innerHTML = styleHTML + html;
    } else {
      const wrap = document.createElement('div');
      wrap.id = 'shared-header';
      wrap.innerHTML = styleHTML + html;
      document.body.insertBefore(wrap, document.body.firstChild);
    }
    wireDropdown();
  }

  function wireDropdown() {
    const btn  = document.getElementById('sh-schedule-btn');
    const menu = document.getElementById('sh-schedule-menu');
    if (!btn || !menu) return;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      const open = !menu.hidden;
      menu.hidden = open;
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
