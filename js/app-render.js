/**
 * app-render.js — all DOM rendering for the Lead Data Hygiene Kit
 * workspace (stats, malformed-row list, data table, dedup review, rubric
 * editor, export panel). Extends window.LDHKApp.
 *
 * Purely reads `App.state` and writes to the DOM — no network calls.
 */
(function (App) {
  'use strict';

  var $ = App.$, el = App.el, esc = App.esc, state = App.state;

  function renderAll() {
    renderStats();
    renderMalformed();
    renderTable();
    renderDedup();
    renderRubricTable();
    renderExportPanel();
  }

  function renderStats() {
    var total = state.records.length;
    var excluded = state.records.filter(function (r) { return r.excluded; }).length;
    var invalidDomain = state.records.filter(function (r) { return r.domain && !r.domainExtracted; }).length;
    var rubric = App.activeRubric();
    var readyCount = 0;
    App.activeRecords().forEach(function (r) {
      if (LDHK.scoreCompleteness(App.scoreInputFor(r), rubric).readyForEnrichment) readyCount++;
    });
    var unresolvedGroups = state.dupeResult.groups.filter(function (g) { return !state.groupResolutions[App.groupKey(g)]; }).length;

    var stats = [
      { num: total, label: 'Total rows imported' },
      { num: state.parsed.malformedRows.length, label: 'Malformed rows flagged' },
      { num: state.dupeResult.groups.length, label: 'Duplicate groups found' },
      { num: unresolvedGroups, label: 'Groups needing review' },
      { num: excluded, label: 'Merged / discarded' },
      { num: readyCount + ' / ' + (total - excluded), label: 'Enrichment-ready' },
      { num: invalidDomain, label: 'Rows with unusable domain' }
    ];
    var row = $('#statRow');
    row.innerHTML = '';
    stats.forEach(function (s) {
      row.appendChild(el('div', { class: 'stat-card' }, [
        el('div', { class: 'num' }, [String(s.num)]),
        el('div', { class: 'label' }, [s.label])
      ]));
    });

    var warnBox = $('#perfWarning');
    if (state.dupeResult.performanceWarning) {
      warnBox.innerHTML = '';
      warnBox.appendChild(el('div', { class: 'alert alert-warn' }, [
        el('div', {}, [el('strong', {}, ['Performance notice']), state.dupeResult.performanceWarning])
      ]));
      warnBox.classList.remove('hidden');
    } else {
      warnBox.classList.add('hidden');
      warnBox.innerHTML = '';
    }
  }

  function renderMalformed() {
    var panel = $('#malformedPanel');
    var rows = state.parsed.malformedRows;
    if (!rows.length) { panel.classList.add('hidden'); return; }
    panel.classList.remove('hidden');
    var list = $('#malformedList');
    list.innerHTML = '';
    rows.forEach(function (r) {
      list.appendChild(el('div', { class: 'malformed-row' }, [
        el('span', { class: 'loc' }, ['Line ' + r.line]),
        r.reason,
        el('span', { class: 'raw' }, [r.raw])
      ]));
    });
  }

  function scoreColor(score) {
    if (score >= 80) return 'var(--good)';
    if (score >= 50) return 'var(--warn)';
    return 'var(--bad)';
  }

  function renderTable() {
    var tbody = $('#dataTableBody');
    tbody.innerHTML = '';
    var rubric = App.activeRubric();
    state.records.forEach(function (r) {
      var result = LDHK.scoreCompleteness(App.scoreInputFor(r), rubric);
      var tr = el('tr', { style: r.excluded ? 'opacity:.45' : '' }, []);
      tr.appendChild(el('td', {}, [r.excluded ? '—' : String(r.id + 1)]));
      tr.appendChild(el('td', { title: esc(r.company) }, [esc(r.normalizedCompany || r.company || '(blank)')]));
      var domainCell = r.domainExtracted
        ? el('span', { class: 'pill pill-good' }, [r.domainExtracted])
        : (r.domain ? el('span', { class: 'pill pill-bad' }, ['invalid: ' + esc(r.domain).slice(0, 24)]) : el('span', { class: 'pill pill-neutral' }, ['missing']));
      tr.appendChild(el('td', {}, [domainCell]));
      tr.appendChild(el('td', {}, [esc(r.email) || '—']));
      tr.appendChild(el('td', {}, [esc([r.firstName, r.lastName].filter(Boolean).join(' ')) || '—']));
      tr.appendChild(el('td', {}, [esc(r.title) || '—']));
      var scoreTd = el('td', {}, []);
      scoreTd.appendChild(el('span', { class: 'score-bar-track' }, [
        el('span', { class: 'score-bar-fill', style: 'width:' + result.score + '%;background:' + scoreColor(result.score) }, [])
      ]));
      scoreTd.appendChild(document.createTextNode(result.score + '%'));
      tr.appendChild(scoreTd);
      tr.appendChild(el('td', {}, [
        result.readyForEnrichment
          ? el('span', { class: 'pill pill-good' }, ['ready'])
          : el('span', { class: 'pill pill-warn' }, [result.missing.filter(function (m) { return m.required; }).length + ' missing'])
      ]));
      var statusTd = el('td', {}, []);
      if (r.excluded) {
        statusTd.appendChild(el('span', { class: 'pill pill-neutral' }, [r.mergedInto !== null ? 'merged → #' + (r.mergedInto + 1) : 'discarded']));
      } else {
        statusTd.appendChild(el('button', { class: 'btn btn-sm btn-bad', onclick: function () { App.discardRecord(r.id); } }, ['Discard']));
      }
      tr.appendChild(statusTd);
      tbody.appendChild(tr);
    });
  }

  function reasonLabel(reason) {
    return { 'exact-domain': 'exact domain match', 'exact-name': 'exact normalized-name match', 'fuzzy-name': 'fuzzy name match' }[reason] || reason;
  }

  function renderDedup() {
    var container = $('#dedupGroups');
    container.innerHTML = '';
    $('#thresholdRange').value = state.threshold;
    $('#thresholdNumber').value = state.threshold;

    if (!state.dupeResult.groups.length) {
      container.appendChild(el('p', { class: 'small-note' }, ['No duplicate candidates found at the current threshold.']));
      return;
    }

    state.dupeResult.groups.forEach(function (g) {
      var key = App.groupKey(g);
      var resolution = state.groupResolutions[key];
      var groupEl = el('div', { class: 'dupe-group' + (resolution ? ' resolved' : '') }, []);
      var header = el('div', { class: 'dupe-group-header' }, [
        el('span', {}, [g.ids.length + ' records · ' + Math.round(g.score * 100) + '% match']),
        el('span', { class: 'reason' }, [reasonLabel(g.reason)])
      ]);
      if (resolution) {
        header.appendChild(el('span', { class: 'resolved-tag' }, [resolution === 'merged' ? '✓ Merged' : '✓ Kept separate']));
      }
      groupEl.appendChild(header);

      var cards = el('div', { class: 'dupe-cards' }, []);
      g.ids.forEach(function (id) {
        var r = state.records[id];
        var radioId = 'primary-' + key + '-' + id;
        cards.appendChild(el('div', { class: 'dupe-card' }, [
          el('label', { class: 'field-inline', style: 'margin-bottom:6px;' }, [
            el('input', { type: 'radio', name: 'primary-' + key, value: id, id: radioId, checked: g.ids[0] === id ? 'checked' : null }, []),
            el('span', { class: 'name' }, [esc(r.normalizedCompany || r.company || '(blank)')])
          ]),
          el('div', { class: 'field' }, ['Domain: ', el('b', {}, [esc(r.domainExtracted || r.domain || '—')])]),
          el('div', { class: 'field' }, ['Email: ', el('b', {}, [esc(r.email || '—')])]),
          el('div', { class: 'field' }, ['Contact: ', el('b', {}, [esc([r.firstName, r.lastName].filter(Boolean).join(' ')) || '—'])]),
          el('div', { class: 'field' }, ['Title: ', el('b', {}, [esc(r.title || '—')])]),
          el('div', { class: 'field small-note' }, ['Row #' + (id + 1)])
        ]));
      });
      groupEl.appendChild(cards);

      var actions = el('div', { class: 'dupe-actions' }, [
        el('button', {
          class: 'btn btn-primary btn-sm', onclick: function () {
            var checked = $('input[name="primary-' + key + '"]:checked', groupEl);
            var primaryId = checked ? parseInt(checked.value, 10) : g.ids[0];
            App.mergeGroup(g, primaryId);
          }
        }, ['Merge into selected']),
        el('button', { class: 'btn btn-sm btn-ghost', onclick: function () { App.keepSeparate(g); } }, ['Keep both — not duplicates'])
      ]);
      groupEl.appendChild(actions);

      container.appendChild(groupEl);
    });
  }

  function renderRubricTable() {
    var tbody = $('#rubricBody');
    tbody.innerHTML = '';

    var note = $('#addRubricNote');
    if (note) {
      if (App.activeRubric().length === 0) {
        note.textContent = 'No fields are included — nothing is being scored. Every row above will show 0% / not ready until you check at least one "Include" box.';
        note.classList.add('alert', 'alert-warn');
      } else {
        note.textContent = 'Weights don\'t need to sum to 100 — the score is normalized against the weight of included fields only.';
        note.classList.remove('alert', 'alert-warn');
      }
    }

    state.rubric.forEach(function (row, idx) {
      var tr = el('tr', {}, []);
      var includeTd = el('td', {}, [
        el('input', {
          type: 'checkbox', checked: row.included ? 'checked' : null,
          onchange: function (e) { state.rubric[idx].included = e.target.checked; renderAll(); }
        }, [])
      ]);
      var labelTd = el('td', {}, [row.label]);
      var weightTd = el('td', {}, [
        el('input', {
          type: 'number', min: '0', max: '100', value: String(row.weight),
          onchange: function (e) { state.rubric[idx].weight = Math.max(0, parseInt(e.target.value, 10) || 0); renderAll(); }
        }, [])
      ]);
      var reqTd = el('td', {}, [
        el('input', {
          type: 'checkbox', checked: row.required ? 'checked' : null,
          onchange: function (e) { state.rubric[idx].required = e.target.checked; renderAll(); }
        }, [])
      ]);
      tr.appendChild(includeTd);
      tr.appendChild(labelTd);
      tr.appendChild(weightTd);
      tr.appendChild(reqTd);
      tbody.appendChild(tr);
    });
  }

  function renderExportPanel() {
    var active = App.activeRecords();
    var rubric = App.activeRubric();
    var notReady = active.filter(function (r) { return !LDHK.scoreCompleteness(App.scoreInputFor(r), rubric).readyForEnrichment; });
    $('#exportCleanedCount').textContent = active.length + ' record' + (active.length === 1 ? '' : 's');
    $('#exportEnrichmentCount').textContent = notReady.length + ' record' + (notReady.length === 1 ? '' : 's');
  }

  App.renderAll = renderAll;
  App.renderStats = renderStats;
  App.renderMalformed = renderMalformed;
  App.renderTable = renderTable;
  App.renderDedup = renderDedup;
  App.renderRubricTable = renderRubricTable;
  App.renderExportPanel = renderExportPanel;
})(window.LDHKApp);
