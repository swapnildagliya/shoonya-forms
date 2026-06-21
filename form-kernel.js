// ============================================================
// form-kernel.js — shared, declarative form engine for the Shoonya
// teacher-submission forms (weekly / workshop / social-night / festival).
//
// PURPOSE: today each field is hand-maintained in ~5 places (collect / draft /
// review / payload / backend) and they drift. The kernel lets each form declare
// a single FIELD_SPEC — an array of field descriptors — that ALL frontend paths
// read from, so collect/draft/restore/review/payload can't fall out of sync.
//
// No dependencies. Attaches to window.FormKernel. Frontend-only: it never
// changes any backend key or shape — payloadKey + the per-field collect/restore
// overrides reproduce the EXACT payload each form already sends.
//
// FIELD DESCRIPTOR shape:
//   {
//     key,                 // canonical state key (used in the draft + as default payloadKey)
//     label,               // human label (review modal)
//     dom,                 // element id OR container id this field reads (informational / used by std kinds)
//     kind,                // 'text' | 'chip-single' | 'chip-multi' | 'checkbox' | 'number' | 'custom'
//     draft = true,        // include in localStorage autosave/restore
//     review = true,       // include in the review modal
//     payload = true,      // include in the submit payload
//     payloadKey,          // payload property name (defaults to `key`)
//     default,             // value used by buildPayload when state value is undefined
//     collect(ctx),        // OPTIONAL override → returns the field's state value from the DOM
//     restore(val, ctx),   // OPTIONAL override → writes a state value back into the DOM
//     reviewValue(val,ctx),// OPTIONAL override → string/array for the review row (return '' to hide)
//     payloadValue(val,st),// OPTIONAL override → final payload value (else identity on state value)
//   }
//
// Standard kinds have built-in collect/restore/review keyed off `dom`:
//   text     → input/textarea .value (trimmed by default; set trim:false to keep raw)
//   number   → input .value (string, untrimmed — matches the forms' current behavior)
//   chip-single → selected chip textContent (paren-suffix stripped), restore selects matching chip
//   chip-multi  → array of selected chip textContents, restore selects matching chips
//   checkbox → boolean .checked
// ============================================================
(function (root) {
  'use strict';

  // ---- small DOM helpers (null-safe) ----
  function byId(id) { return document.getElementById(id); }
  function val(id) { var e = byId(id); return e ? e.value : ''; }
  function txt(el) { return el ? el.textContent : ''; }
  function stripParen(s) { return String(s == null ? '' : s).replace(/\(.*\)/, '').trim(); }

  function selectedSingle(containerId) {
    var c = byId(containerId);
    if (!c) return '';
    var chip = c.querySelector('.chip.selected');
    return chip ? stripParen(chip.textContent) : '';
  }
  function selectedMulti(containerId) {
    var c = byId(containerId);
    if (!c) return [];
    return Array.prototype.slice.call(c.querySelectorAll('.chip.selected'))
      .map(function (ch) { return ch.textContent.trim(); });
  }
  function restoreChip1(containerId, value) {
    if (!value) return;
    var c = byId(containerId);
    if (!c) return;
    var chips = Array.prototype.slice.call(c.querySelectorAll('.chip'));
    var match = chips.find(function (ch) { return ch.textContent.trim() === value; });
    if (match && !match.classList.contains('selected')) {
      chips.forEach(function (ch) { ch.classList.remove('selected'); });
      match.classList.add('selected');
    }
  }
  function restoreChipN(containerId, values) {
    if (!values || !values.length) return;
    var c = byId(containerId);
    if (!c) return;
    c.querySelectorAll('.chip').forEach(function (ch) {
      var k = ch.textContent.replace(/^⭐\s*/, '').trim();
      if (values.indexOf(k) !== -1) ch.classList.add('selected');
      else ch.classList.remove('selected');
    });
  }

  // ---- built-in collect/restore/review per kind ----
  function stdCollect(f, ctx) {
    switch (f.kind) {
      case 'text': {
        var v = val(f.dom);
        return f.trim === false ? v : String(v || '').trim();
      }
      case 'number':
        return val(f.dom);                         // string, untrimmed (matches current forms)
      case 'checkbox': {
        var e = byId(f.dom); return e ? !!e.checked : false;
      }
      case 'chip-single':
        return selectedSingle(f.dom);
      case 'chip-multi':
        return selectedMulti(f.dom);
      default:
        return undefined;
    }
  }
  function stdRestore(f, value, ctx) {
    switch (f.kind) {
      case 'text':
      case 'number': {
        var e = byId(f.dom);
        if (e && value != null && value !== '') e.value = value;
        return;
      }
      case 'checkbox': {
        var cb = byId(f.dom);
        if (cb && cb.checked !== !!value) {
          cb.checked = !!value;
          if (typeof f.onToggle === 'function') f.onToggle(cb);
        }
        return;
      }
      case 'chip-single':
        restoreChip1(f.dom, value); return;
      case 'chip-multi':
        restoreChipN(f.dom, value); return;
      default:
        return;
    }
  }
  function stdReview(f, value) {
    if (Array.isArray(value)) return value.length ? value.join(', ') : '';
    return value == null ? '' : String(value);
  }

  // ---- kernel API ----
  function collect(spec, ctx) {
    ctx = ctx || {};
    var state = {};
    spec.forEach(function (f) {
      var v = typeof f.collect === 'function' ? f.collect(ctx) : stdCollect(f, ctx);
      state[f.key] = v;
    });
    return state;
  }

  function buildPayload(spec, extra, ctx) {
    ctx = ctx || {};
    var state = (ctx && ctx.state) ? ctx.state : collect(spec, ctx);
    var payload = {};
    spec.forEach(function (f) {
      if (f.payload === false) return;
      var pk = f.payloadKey || f.key;
      var v = state[f.key];
      if (v === undefined && f.default !== undefined) v = f.default;
      if (typeof f.payloadValue === 'function') v = f.payloadValue(v, state, ctx);
      payload[pk] = v;
    });
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] !== undefined) {
          payload[k] = extra[k];
        }
      }
    }
    return payload;
  }

  // A field's DRAFT value can differ from its payload/collect value (e.g. a chip
  // field whose draft snapshot is a richer object than the payload string). Use
  // draftCollect/draftRestore when present, else fall back to collect/restore.
  function fieldDraftCollect(f, ctx) {
    if (typeof f.draftCollect === 'function') return f.draftCollect(ctx);
    if (typeof f.collect === 'function') return f.collect(ctx);
    return stdCollect(f, ctx);
  }
  function fieldDraftRestore(f, v, ctx) {
    if (typeof f.draftRestore === 'function') return f.draftRestore(v, ctx);
    if (typeof f.restore === 'function') return f.restore(v, ctx);
    return stdRestore(f, v, ctx);
  }

  function saveDraft(spec, storageKey, ctx) {
    ctx = ctx || {};
    var draft = { v: 1, savedAt: new Date().toISOString() };
    spec.forEach(function (f) {
      if (f.draft === false) return;
      draft[f.key] = fieldDraftCollect(f, ctx);
    });
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch (e) {}
    return draft;
  }

  function restoreDraft(spec, storageKeyOrObj, maybeObj, ctx) {
    // Accept (spec, storageKey[, ctx]) OR (spec, draftObject[, ctx]).
    var draft, c;
    if (typeof storageKeyOrObj === 'string') {
      c = maybeObj || {};
      try { draft = JSON.parse(localStorage.getItem(storageKeyOrObj) || 'null'); } catch (e) { draft = null; }
    } else {
      draft = storageKeyOrObj; c = maybeObj || {};
    }
    if (!draft) return null;
    spec.forEach(function (f) {
      if (f.draft === false) return;
      if (!(f.key in draft)) return;
      fieldDraftRestore(f, draft[f.key], c);
    });
    return draft;
  }

  function buildReview(spec, ctx) {
    ctx = ctx || {};
    var state = (ctx && ctx.state) ? ctx.state : collect(spec, ctx);
    var rows = [];
    spec.forEach(function (f) {
      if (f.review === false) return;
      var v = state[f.key];
      var rv = typeof f.reviewValue === 'function' ? f.reviewValue(v, ctx) : stdReview(f, v);
      // jump: explicit null/false disables the Edit button; only undefined defaults to #dom.
      var jump = (f.jump === undefined) ? ('#' + f.dom) : f.jump;
      rows.push({ key: f.key, label: f.label || f.key, value: rv, jump: jump });
    });
    return rows;
  }

  function validate(spec, rules, ctx) {
    ctx = ctx || {};
    var state = (ctx && ctx.state) ? ctx.state : collect(spec, ctx);
    var errs = [];
    spec.forEach(function (f) {
      if (!f.required) return;
      var v = state[f.key];
      var empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
      if (empty) errs.push(typeof f.required === 'string' ? f.required : (f.label || f.key));
    });
    if (typeof rules === 'function') {
      var extra = rules(state, ctx);
      if (Array.isArray(extra)) errs = errs.concat(extra);
    }
    return errs;
  }

  function showError(el, msg) {
    if (!el) return;
    el.innerHTML = msg;
    el.style.display = '';
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
  }

  // submit() mirrors the weekly form's submit EXACTLY:
  //   Content-Type text/plain;charset=utf-8 · read res.json() · ok:false handling
  //   · test-mode preview · sendToBackup fallback on failure · draft clear on success.
  async function submit(opts) {
    opts = opts || {};
    var url = opts.url;
    var payload = opts.payload;
    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    var json;
    try { json = await res.json(); }
    catch (_) {
      throw new Error('Server returned non-JSON (HTTP ' + res.status + ' ' + res.statusText + '). Your draft is saved.');
    }
    if (json && json.ok === false) {
      throw new Error(json.error || ('Submission failed (HTTP ' + res.status + ').'));
    }
    return json;
  }

  root.FormKernel = {
    // primitives (exposed so forms can reuse them in custom collect/restore)
    byId: byId, val: val, txt: txt, stripParen: stripParen,
    selectedSingle: selectedSingle, selectedMulti: selectedMulti,
    restoreChip1: restoreChip1, restoreChipN: restoreChipN,
    // engine
    collect: collect,
    buildPayload: buildPayload,
    saveDraft: saveDraft,
    restoreDraft: restoreDraft,
    buildReview: buildReview,
    validate: validate,
    submit: submit,
    showError: showError,
  };
})(typeof window !== 'undefined' ? window : this);
