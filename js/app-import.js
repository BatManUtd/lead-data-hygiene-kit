/**
 * app-import.js — import (sample data / file upload) and column-mapping
 * step for the Lead Data Hygiene Kit UI. Extends window.LDHKApp.
 *
 * No network calls anywhere in this file — "Load sample data" reads an
 * inline JS string (see js/sample-data.js), and file import reads the
 * File the user picked via FileReader, never a URL.
 */
(function (App) {
  'use strict';

  var $ = App.$, el = App.el, esc = App.esc, state = App.state;

  function setStep(n) {
    App.$all('.step').forEach(function (s) {
      var idx = parseInt(s.getAttribute('data-step'), 10);
      s.classList.toggle('active', idx === n);
      s.classList.toggle('done', idx < n);
    });
  }

  function loadSample() {
    // The sample CSV ships as an inline string baked into sample-data.js
    // so "Load sample data" works instantly offline with zero fetch/XHR
    // calls of any kind.
    var csvText = window.LDHK_SAMPLE_CSV || '';
    parseAndShowMapping(csvText, 'sample-leads.csv (bundled demo data)');
  }

  function handleFile(file) {
    clearImportError();
    if (!file) return;
    if (file.size === 0) {
      showImportError('That file is empty (0 bytes). Choose a CSV/TSV file that has a header row and at least one data row.');
      return;
    }
    var name = file.name || '';
    var ext = (name.split('.').pop() || '').toLowerCase();
    if (['csv', 'tsv', 'txt'].indexOf(ext) === -1) {
      showImportError('"' + esc(name) + '" doesn’t look like a CSV/TSV/TXT file (unrecognized extension ".' + esc(ext) + '"). Export your list as CSV and try again.');
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      showImportError('Could not read that file. It may be corrupted or in an unsupported encoding.');
    };
    reader.onload = function (e) {
      parseAndShowMapping(String(e.target.result || ''), name);
    };
    reader.readAsText(file, 'UTF-8');
  }

  function showImportError(msg) {
    var box = $('#importError');
    box.innerHTML = '';
    box.appendChild(el('div', { class: 'alert alert-bad' }, [
      el('div', {}, [el('strong', {}, ['Could not load file']), msg])
    ]));
    box.classList.remove('hidden');
  }
  function clearImportError() {
    $('#importError').classList.add('hidden');
    $('#importError').innerHTML = '';
  }

  function parseAndShowMapping(text, sourceLabel) {
    clearImportError();
    var parsed = LDHK.parseCSV(text);
    if (parsed.error) {
      showImportError(parsed.error);
      return;
    }
    if (!parsed.headers.length) {
      showImportError('No header row was found in this file.');
      return;
    }
    if (parsed.rows.length === 0) {
      showImportError('This file has a header row ("' + esc(parsed.headers.join(', ')) + '") but zero data rows below it. Add rows and re-upload.');
      return;
    }
    state.parsed = parsed;
    state.mapping = LDHK.suggestColumnMapping(parsed.headers);
    $('#sourceLabel').textContent = sourceLabel;
    $('#parseSummary').textContent = parsed.rows.length + ' data row' + (parsed.rows.length === 1 ? '' : 's') +
      ' detected, delimiter "' + (parsed.delimiter === '\t' ? 'tab' : parsed.delimiter) + '"' +
      (parsed.malformedRows.length ? ', ' + parsed.malformedRows.length + ' malformed row(s) flagged' : '') + '.';

    renderMapping();
    setStep(2);
    $('#mappingPanel').classList.remove('hidden');
    $('#mappingPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderMapping() {
    var grid = $('#mappingGrid');
    grid.innerHTML = '';
    grid.appendChild(el('div', { class: 'mg-head' }, ['Field this tool uses']));
    grid.appendChild(el('div', { class: 'mg-head' }, ['Your column']));
    grid.appendChild(el('div', { class: 'mg-head' }, ['']));

    LDHK.CANONICAL_FIELDS.forEach(function (f) {
      var select = el('select', { 'data-field': f.key }, []);
      select.appendChild(el('option', { value: '' }, ['— not in this file —']));
      state.parsed.headers.forEach(function (h) {
        var opt = el('option', { value: h }, [h]);
        if (state.mapping[f.key] === h) opt.selected = true;
        select.appendChild(opt);
      });
      var status = el('span', { class: 'mg-status ' + (state.mapping[f.key] ? 'matched' : 'unmatched') },
        [state.mapping[f.key] ? '✓ auto-matched' : 'not set']);
      select.addEventListener('change', function () {
        state.mapping[f.key] = select.value || null;
        status.textContent = select.value ? '✓ confirmed' : 'not set';
        status.className = 'mg-status ' + (select.value ? 'matched' : 'unmatched');
      });
      grid.appendChild(el('label', {}, [f.label + (f.key === 'company' || f.key === 'domain' || f.key === 'email' ? ' *' : '')]));
      grid.appendChild(select);
      grid.appendChild(status);
    });
  }

  function confirmMapping() {
    if (!state.mapping.company) {
      alert('Please map a Company Name column before continuing — it is required for dedup and scoring.');
      return;
    }
    App.buildRecords();
    setStep(3);
    $('#workspace').classList.remove('hidden');
    App.recomputeDedup();
    App.renderAll();
    $('#workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetAll() {
    state.parsed = null;
    state.mapping = null;
    state.records = [];
    state.dupeResult = { groups: [], performanceWarning: null };
    state.groupResolutions = {};
    state.rubric = App.buildDefaultRubricRows();
    state.actionHistory = [];
    $('#mappingPanel').classList.add('hidden');
    $('#workspace').classList.add('hidden');
    clearImportError();
    $('#fileInput').value = '';
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  App.setStep = setStep;
  App.loadSample = loadSample;
  App.handleFile = handleFile;
  App.showImportError = showImportError;
  App.clearImportError = clearImportError;
  App.parseAndShowMapping = parseAndShowMapping;
  App.renderMapping = renderMapping;
  App.confirmMapping = confirmMapping;
  App.resetAll = resetAll;
})(window.LDHKApp);
