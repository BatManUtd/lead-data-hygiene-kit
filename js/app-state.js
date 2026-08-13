/**
 * app-state.js — shared state, DOM helpers, and record-building for the
 * Lead Data Hygiene Kit UI.
 *
 * Creates `window.LDHKApp`, a plain namespace object that app-import.js,
 * app-render.js, app-actions.js, and app.js all extend with more
 * functions. This keeps each file small and focused while letting them
 * share one `state` object and one set of DOM helpers, without a bundler.
 *
 * No network calls anywhere in this file.
 */
window.LDHKApp = (function () {
  'use strict';

  var SOFT_ROW_CAP = 5000;

  var state = {
    parsed: null,           // result of LDHK.parseCSV
    mapping: null,          // canonical field -> source header (confirmed)
    records: [],            // built records, index === id
    threshold: 0.85,
    dupeResult: { groups: [], performanceWarning: null },
    groupResolutions: {},   // groupKey -> 'merged' | 'kept-separate'
    rubric: null,
    actionHistory: []       // [{label, undo: fn}]
  };

  function buildDefaultRubricRows() {
    var defaults = {};
    LDHK.defaultRubric().forEach(function (r) { defaults[r.field] = r; });
    return LDHK.CANONICAL_FIELDS.map(function (f) {
      var d = defaults[f.key];
      return {
        field: f.key,
        label: f.label,
        included: !!d,
        weight: d ? d.weight : 5,
        required: d ? !!d.required : false
      };
    });
  }
  state.rubric = buildDefaultRubricRows();

  function activeRubric() {
    return state.rubric.filter(function (r) { return r.included; });
  }

  // ---------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------------------------------------------------------------
  // Records
  // ---------------------------------------------------------------------

  function isLikelyEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
  }

  function buildRecords() {
    var objs = LDHK.rowsToObjects(state.parsed.headers, state.parsed.rows);
    var mapping = state.mapping;
    function get(o, key) {
      var h = mapping[key];
      return h ? String(o[h] || '').trim() : '';
    }
    state.records = objs.map(function (o, i) {
      var companyRaw = get(o, 'company');
      var domainRaw = get(o, 'domain');
      var emailRaw = get(o, 'email');
      var domainExtracted = LDHK.extractDomain(domainRaw) || LDHK.extractDomain(emailRaw);
      return {
        id: i,
        company: companyRaw,
        normalizedCompany: LDHK.normalizeCompanyName(companyRaw),
        domain: domainRaw,
        domainExtracted: domainExtracted,
        email: emailRaw,
        emailValid: isLikelyEmail(emailRaw),
        firstName: get(o, 'firstName'),
        lastName: get(o, 'lastName'),
        title: get(o, 'title'),
        phone: get(o, 'phone'),
        industry: get(o, 'industry'),
        employeeCount: get(o, 'employeeCount'),
        country: get(o, 'country'),
        state: get(o, 'state'),
        city: get(o, 'city'),
        linkedin: get(o, 'linkedin'),
        excluded: false,
        excludeReason: null,
        mergedInto: null
      };
    });
  }

  function scoreInputFor(rec) {
    return {
      company: rec.normalizedCompany,
      domain: rec.domainExtracted || '',
      email: rec.emailValid ? rec.email : '',
      firstName: rec.firstName,
      lastName: rec.lastName,
      title: rec.title,
      phone: rec.phone,
      industry: rec.industry,
      employeeCount: rec.employeeCount,
      country: rec.country,
      state: rec.state,
      city: rec.city,
      linkedin: rec.linkedin
    };
  }

  function activeRecords() { return state.records.filter(function (r) { return !r.excluded; }); }

  function groupKey(g) { return g.ids.slice().sort(function (a, b) { return a - b; }).join('-'); }

  return {
    SOFT_ROW_CAP: SOFT_ROW_CAP,
    state: state,
    buildDefaultRubricRows: buildDefaultRubricRows,
    activeRubric: activeRubric,
    $: $,
    $all: $all,
    el: el,
    esc: esc,
    isLikelyEmail: isLikelyEmail,
    buildRecords: buildRecords,
    scoreInputFor: scoreInputFor,
    activeRecords: activeRecords,
    groupKey: groupKey
  };
})();
