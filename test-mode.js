// ============================================================
// test-mode.js — opt-in DRY RUN for the submission forms.
//
// Add ?test=1 to any form URL (weekly / workshop / social). The form then:
//   • shows a purple "TEST MODE" banner,
//   • marks its submission payload with testMode:true,
//   • the backend builds the would-be sheet row and returns it WITHOUT
//     writing to the sheet, syncing, or emailing,
//   • the form shows that preview instead of the normal confirmation.
//
// Nothing is persisted, so it's safe against production. Wire-up per form:
//   1. <script src="../test-mode.js"></script>
//   2. before submit: if (window.shoonyaTestMode()) payload.testMode = true;
//   3. on success:   if (json.testMode) { box.innerHTML = window.shoonyaShowTestPreview(json); ...; return; }
// ============================================================
(function () {
  var on = false;
  try { on = new URLSearchParams(location.search).get('test') === '1'; } catch (e) {}

  window.shoonyaTestMode = function () { return on; };

  if (!on) return;

  // Sticky banner so it's always obvious you're not submitting for real
  function addBanner() {
    if (document.getElementById('shoonya-test-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'shoonya-test-banner';
    bar.textContent = '🧪 TEST MODE — fill the form freely. Nothing is saved or emailed; you’ll see a preview of what would be saved.';
    bar.style.cssText = 'position:sticky;top:0;z-index:99999;background:#8a3ffc;color:#fff;' +
      'font:600 13px/1.45 system-ui,-apple-system,sans-serif;padding:9px 14px;text-align:center;';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addBanner);
  } else {
    addBanner();
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Renders the backend's preview (headers + row) as a labelled table.
  window.shoonyaShowTestPreview = function (json) {
    var p = json.preview || {};
    var headers = p.headers || [];
    var row = p.row || [];
    var bodyRows;
    if (headers.length) {
      bodyRows = headers.map(function (h, i) {
        var v = row[i];
        return '<tr>' +
          '<td style="padding:5px 12px;font-weight:600;color:#6B3FA0;white-space:nowrap;vertical-align:top;border-bottom:1px solid #eee;">' + esc(h) + '</td>' +
          '<td style="padding:5px 12px;vertical-align:top;border-bottom:1px solid #eee;">' + esc(v) + '</td>' +
        '</tr>';
      }).join('');
    } else {
      bodyRows = row.map(function (v, i) {
        return '<tr><td style="padding:5px 12px;color:#999;">col ' + (i + 1) + '</td>' +
               '<td style="padding:5px 12px;">' + esc(v) + '</td></tr>';
      }).join('');
    }
    return '<div style="border:2px solid #8a3ffc;border-radius:10px;padding:16px;margin:14px 0;background:#faf7ff;text-align:left;">' +
      '<div style="font-weight:800;color:#6B3FA0;margin-bottom:6px;">🧪 TEST MODE — this is what WOULD be saved</div>' +
      '<div style="font-size:13px;color:#555;margin-bottom:12px;">Nothing was written. Type: <strong>' + esc(json.type || '') + '</strong>' +
        (json.sheetName ? ' · Sheet: <strong>' + esc(json.sheetName) + '</strong>' : '') + '</div>' +
      '<table style="border-collapse:collapse;font-size:13px;width:100%;">' + bodyRows + '</table>' +
    '</div>';
  };
})();
