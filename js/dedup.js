/**
 * dedup.js — fuzzy matching and duplicate detection for Lead Data Hygiene Kit.
 *
 * Pure, dependency-free (aside from normalize.js for domain/name keys).
 * Runs unmodified in Node (via `require`) and in the browser (plain
 * <script> tag loaded after normalize.js, attaches to `window.LDHK_DEDUP`).
 *
 * ZERO network calls, ZERO auto-merge/auto-delete. `findDuplicates` only
 * ever returns SUGGESTED groups — every merge or discard decision is made
 * explicitly by the user in the UI (see js/app-actions.js).
 */
(function (root, factory) {
  var normalize = typeof module === 'object' && module.exports
    ? require('./normalize.js')
    : root.LDHK_NORMALIZE;
  var mod = factory(normalize);
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.LDHK_DEDUP = mod;
  }
})(typeof self !== 'undefined' ? self : this, function (normalize) {
  'use strict';

  var extractDomain = normalize.extractDomain;
  var companyKey = normalize.companyKey;

  // ---------------------------------------------------------------------
  // Fuzzy matching
  // ---------------------------------------------------------------------

  /**
   * Classic Levenshtein edit distance, iterative two-row DP (O(n*m) time,
   * O(min(n,m)) space).
   */
  function levenshtein(a, b) {
    a = String(a || '');
    b = String(b || '');
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    if (a.length > b.length) { var tmp = a; a = b; b = tmp; }

    var prevRow = new Array(a.length + 1);
    for (var i = 0; i <= a.length; i++) prevRow[i] = i;

    for (var j = 1; j <= b.length; j++) {
      var currRow = new Array(a.length + 1);
      currRow[0] = j;
      for (var k = 1; k <= a.length; k++) {
        var cost = a[k - 1] === b[j - 1] ? 0 : 1;
        currRow[k] = Math.min(
          prevRow[k] + 1,      // deletion
          currRow[k - 1] + 1,  // insertion
          prevRow[k - 1] + cost // substitution
        );
      }
      prevRow = currRow;
    }
    return prevRow[a.length];
  }

  /**
   * Normalized similarity in [0, 1], 1 = identical, derived from edit
   * distance relative to the longer string's length.
   */
  function similarity(a, b) {
    a = String(a || '');
    b = String(b || '');
    var maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    var dist = levenshtein(a, b);
    return 1 - dist / maxLen;
  }

  // ---------------------------------------------------------------------
  // Duplicate detection (exact + fuzzy, with blocking to avoid O(n^2))
  // ---------------------------------------------------------------------

  /**
   * Blocking key: groups records so fuzzy comparison only happens within
   * a bucket, not across the whole dataset. Uses normalized domain when
   * present (strongest signal), else first letter of the normalized
   * company name. This keeps comparisons roughly O(n) instead of O(n^2)
   * on typical datasets.
   */
  function blockingKey(record) {
    var domain = extractDomain(record.domain) || extractDomain(record.email);
    if (domain) {
      // Bucket by domain prefix (first 3 chars) rather than the whole
      // domain, so near-duplicate domains still land in the same bucket.
      return 'd:' + domain.slice(0, 3);
    }
    var key = companyKey(record.company);
    return 'c:' + (key.charAt(0) || '?');
  }

  /**
   * Find candidate duplicate groups among records (plain objects expected
   * to have .company, .domain, .email — missing fields are tolerated).
   *
   * Options:
   *   threshold: similarity threshold in [0,1] for fuzzy name match (default 0.85)
   *   maxRows: soft cap before returning a performance warning instead of
   *            running the full comparison (default 5000)
   *
   * Returns:
   *   {
   *     groups: [{ ids: [recordIndex...], reason: 'exact-domain'|'exact-name'|'fuzzy-name', score }],
   *     performanceWarning: string|null
   *   }
   *
   * Every group is a SUGGESTION for the user to review — nothing here
   * merges or deletes any record.
   */
  function findDuplicates(records, options) {
    records = records || [];
    options = options || {};
    var threshold = typeof options.threshold === 'number' ? options.threshold : 0.85;
    var maxRows = typeof options.maxRows === 'number' ? options.maxRows : 5000;

    var performanceWarning = null;
    if (records.length > maxRows) {
      performanceWarning = 'Dataset has ' + records.length + ' rows, above the recommended cap of ' +
        maxRows + '. Dedup is still running using blocking to stay fast, but review may take longer ' +
        'and matches above the cap are not guaranteed exhaustive.';
    }

    // Bucket by blocking key.
    var buckets = {};
    records.forEach(function (rec, idx) {
      var key = blockingKey(rec);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(idx);
    });

    var groups = [];
    var claimed = {}; // idx -> group index, so a record isn't reported in two groups

    Object.keys(buckets).forEach(function (key) {
      var idxs = buckets[key];
      for (var a = 0; a < idxs.length; a++) {
        for (var b = a + 1; b < idxs.length; b++) {
          var i1 = idxs[a], i2 = idxs[b];
          if (claimed[i1] !== undefined && claimed[i2] !== undefined && claimed[i1] === claimed[i2]) continue;
          var r1 = records[i1], r2 = records[i2];

          var d1 = extractDomain(r1.domain) || extractDomain(r1.email);
          var d2 = extractDomain(r2.domain) || extractDomain(r2.email);
          var reason = null;
          var score = 0;

          if (d1 && d2 && d1 === d2) {
            reason = 'exact-domain';
            score = 1;
          } else {
            var k1 = companyKey(r1.company);
            var k2 = companyKey(r2.company);
            if (k1 && k2 && k1 === k2) {
              reason = 'exact-name';
              score = 1;
            } else if (k1 && k2) {
              var sim = similarity(k1, k2);
              if (sim >= threshold) {
                reason = 'fuzzy-name';
                score = sim;
              }
            }
          }

          if (!reason) continue;

          var existingGroup = claimed[i1] !== undefined ? claimed[i1] : claimed[i2];
          if (existingGroup !== undefined) {
            var g = groups[existingGroup];
            if (g.ids.indexOf(i1) === -1) g.ids.push(i1);
            if (g.ids.indexOf(i2) === -1) g.ids.push(i2);
            g.score = Math.max(g.score, score);
            claimed[i1] = existingGroup;
            claimed[i2] = existingGroup;
          } else {
            var newIdx = groups.length;
            groups.push({ ids: [i1, i2], reason: reason, score: score });
            claimed[i1] = newIdx;
            claimed[i2] = newIdx;
          }
        }
      }
    });

    return { groups: groups, performanceWarning: performanceWarning };
  }

  return {
    levenshtein: levenshtein,
    similarity: similarity,
    blockingKey: blockingKey,
    findDuplicates: findDuplicates
  };
});
