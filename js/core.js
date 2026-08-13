/**
 * core.js — Lead Data Hygiene Kit
 *
 * Thin aggregator that merges the four focused logic modules (csv.js,
 * normalize.js, dedup.js, rubric.js) into one public API, `LDHK`, so the
 * rest of the app (and existing tests) can keep calling `LDHK.parseCSV`,
 * `LDHK.findDuplicates`, etc. without caring how the logic is split across
 * files on disk.
 *
 * Runs unmodified in Node (via `require`) and in the browser — load
 * csv.js, normalize.js, dedup.js, and rubric.js with plain <script> tags
 * BEFORE this file, then this file merges them onto `window.LDHK`.
 *
 * ZERO network calls anywhere in this module or the ones it aggregates.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var csv = require('./csv.js');
    var normalize = require('./normalize.js');
    var dedup = require('./dedup.js');
    var rubric = require('./rubric.js');
    module.exports = factory(csv, normalize, dedup, rubric);
  } else {
    root.LDHK = factory(root.LDHK_CSV, root.LDHK_NORMALIZE, root.LDHK_DEDUP, root.LDHK_RUBRIC);
  }
})(typeof self !== 'undefined' ? self : this, function (csv, normalize, dedup, rubric) {
  'use strict';

  var api = {};
  [csv, normalize, dedup, rubric].forEach(function (part) {
    Object.keys(part).forEach(function (key) { api[key] = part[key]; });
  });
  return api;
});
