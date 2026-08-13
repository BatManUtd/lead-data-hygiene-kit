/**
 * app.js — entry point that wires DOM events to the Lead Data Hygiene Kit
 * app. All actual logic lives in app-state.js, app-import.js,
 * app-render.js, and app-actions.js (all merged onto window.LDHKApp) and
 * in js/core.js (window.LDHK, pure logic). This file only attaches event
 * listeners on DOMContentLoaded.
 *
 * No network calls anywhere in this file.
 */
(function (App) {
  'use strict';

  var $ = App.$;

  function init() {
    $('#loadSampleBtn').addEventListener('click', App.loadSample);
    $('#fileInput').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) App.handleFile(e.target.files[0]);
    });
    var dz = $('#dropzone');
    dz.addEventListener('click', function () { $('#fileInput').click(); });
    dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('drag-over'); });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('drag-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) App.handleFile(e.dataTransfer.files[0]);
    });

    $('#confirmMappingBtn').addEventListener('click', App.confirmMapping);
    $('#resetBtn').addEventListener('click', App.resetAll);

    $('#thresholdRange').addEventListener('input', App.onThresholdChange);
    $('#thresholdNumber').addEventListener('input', App.onThresholdChange);

    $('#exportCleanedBtn').addEventListener('click', function () { App.exportCSV('cleaned'); });
    $('#exportEnrichmentBtn').addEventListener('click', function () { App.exportCSV('needs-enrichment'); });
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.LDHKApp);
