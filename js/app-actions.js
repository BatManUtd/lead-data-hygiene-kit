/**
 * app-actions.js — dedup recompute, merge/discard/undo actions, and CSV
 * export for the Lead Data Hygiene Kit UI. Extends window.LDHKApp.
 *
 * Every merge or discard here is triggered by an explicit user click (see
 * app-render.js button handlers) and is always undoable via the toast this
 * file shows. Nothing in this file auto-merges or auto-deletes anything.
 * Export writes an in-browser Blob download only — no network call.
 */
(function (App) {
  'use strict';

  var $ = App.$, el = App.el, esc = App.esc, state = App.state;

  // ---------------------------------------------------------------------
  // Dedup
  // ---------------------------------------------------------------------

  function recomputeDedup() {
    state.dupeResult = LDHK.findDuplicates(state.records, {
      threshold: state.threshold,
      maxRows: App.SOFT_ROW_CAP
    });
    // Drop resolutions for groups that no longer exist under the new threshold.
    var currentKeys = {};
    state.dupeResult.groups.forEach(function (g) { currentKeys[App.groupKey(g)] = true; });
    Object.keys(state.groupResolutions).forEach(function (k) {
      if (!currentKeys[k]) delete state.groupResolutions[k];
    });
  }

  function onThresholdChange(e) {
    var v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    v = Math.min(1, Math.max(0.5, v));
    state.threshold = Math.round(v * 100) / 100;
    $('#thresholdRange').value = state.threshold;
    $('#thresholdNumber').value = state.threshold;
    recomputeDedup();
    App.renderDedup();
    App.renderStats();
  }

  // ---------------------------------------------------------------------
  // Actions: merge / keep-separate / discard (all explicit + undoable)
  // ---------------------------------------------------------------------

  function pushHistory(label, undoFn) {
    state.actionHistory.push({ label: label, undo: undoFn });
    showUndoToast(label);
  }

  function mergeGroup(group, primaryId) {
    var key = App.groupKey(group);
    var others = group.ids.filter(function (id) { return id !== primaryId; });
    var prevStates = others.map(function (id) {
      var r = state.records[id];
      return { id: id, excluded: r.excluded, mergedInto: r.mergedInto };
    });
    others.forEach(function (id) {
      state.records[id].excluded = true;
      state.records[id].mergedInto = primaryId;
    });
    var prevResolution = state.groupResolutions[key];
    state.groupResolutions[key] = 'merged';

    pushHistory('Merged ' + group.ids.length + ' records into "' + esc(state.records[primaryId].normalizedCompany || state.records[primaryId].company) + '"', function () {
      prevStates.forEach(function (p) {
        state.records[p.id].excluded = p.excluded;
        state.records[p.id].mergedInto = p.mergedInto;
      });
      if (prevResolution) state.groupResolutions[key] = prevResolution; else delete state.groupResolutions[key];
      App.renderAll();
    });
    App.renderAll();
  }

  function keepSeparate(group) {
    var key = App.groupKey(group);
    var prevResolution = state.groupResolutions[key];
    state.groupResolutions[key] = 'kept-separate';
    pushHistory('Kept ' + group.ids.length + ' records separate', function () {
      if (prevResolution) state.groupResolutions[key] = prevResolution; else delete state.groupResolutions[key];
      App.renderAll();
    });
    App.renderAll();
  }

  function discardRecord(id) {
    var r = state.records[id];
    if (r.excluded) return;
    var prev = { excluded: r.excluded, excludeReason: r.excludeReason };
    r.excluded = true;
    r.excludeReason = 'manual';
    pushHistory('Discarded "' + esc(r.company || '(blank company)') + '"', function () {
      r.excluded = prev.excluded;
      r.excludeReason = prev.excludeReason;
      App.renderAll();
    });
    App.renderAll();
  }

  function showUndoToast(label) {
    var existing = $('#undoToast');
    if (existing) existing.remove();
    var toast = el('div', { id: 'undoToast', class: 'undo-toast' }, [
      el('span', {}, [label]),
      el('button', { onclick: function () {
        var last = state.actionHistory.pop();
        if (last) last.undo();
        toast.remove();
      } }, ['Undo'])
    ]);
    document.body.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 7000);
  }

  // ---------------------------------------------------------------------
  // Export (in-browser Blob download, no server round-trip)
  // ---------------------------------------------------------------------

  var EXPORT_HEADERS = ['Company', 'Domain', 'Email', 'First Name', 'Last Name', 'Title', 'Phone',
    'Industry', 'Employees', 'Country', 'State', 'City', 'LinkedIn', 'Enrichment Score', 'Enrichment Ready', 'Missing Required Fields'];

  function recordToExportRow(r, result) {
    return [
      r.normalizedCompany || r.company, r.domainExtracted || r.domain, r.email, r.firstName, r.lastName,
      r.title, r.phone, r.industry, r.employeeCount, r.country, r.state, r.city, r.linkedin,
      result.score, result.readyForEnrichment ? 'yes' : 'no',
      result.missing.filter(function (m) { return m.required; }).map(function (m) { return m.label; }).join('; ')
    ];
  }

  function exportCSV(kind) {
    var rubric = App.activeRubric();
    var active = App.activeRecords();
    var scored = active.map(function (r) { return { r: r, result: LDHK.scoreCompleteness(App.scoreInputFor(r), rubric) }; });
    var subset = kind === 'cleaned' ? scored : scored.filter(function (s) { return !s.result.readyForEnrichment; });
    var rows = subset.map(function (s) { return recordToExportRow(s.r, s.result); });
    var csvText = LDHK.toCSV(EXPORT_HEADERS, rows);
    var blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = kind === 'cleaned' ? 'cleaned.csv' : 'needs-enrichment.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  App.recomputeDedup = recomputeDedup;
  App.onThresholdChange = onThresholdChange;
  App.mergeGroup = mergeGroup;
  App.keepSeparate = keepSeparate;
  App.discardRecord = discardRecord;
  App.exportCSV = exportCSV;
})(window.LDHKApp);
