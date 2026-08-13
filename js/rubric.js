/**
 * rubric.js — enrichment-readiness scoring for Lead Data Hygiene Kit.
 *
 * Pure, dependency-free. Runs unmodified in Node (via `require`) and in the
 * browser (plain <script> tag, attaches to `window.LDHK_RUBRIC`).
 *
 * The rubric itself is fully visible and user-editable in the UI (see
 * js/app-render.js) — this module only computes a score against whatever
 * rubric it is given, it does not hardcode or hide the checklist.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.LDHK_RUBRIC = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Default rubric: which fields must be present for a record to be
   * considered "enrichment-ready" and how much each is worth. Fully
   * visible and user-editable in the UI — not a hidden formula.
   */
  function defaultRubric() {
    return [
      { field: 'company', label: 'Company Name', weight: 25, required: true },
      { field: 'domain', label: 'Website / Domain', weight: 25, required: true },
      { field: 'email', label: 'Email', weight: 20, required: true },
      { field: 'firstName', label: 'First Name', weight: 10, required: false },
      { field: 'lastName', label: 'Last Name', weight: 10, required: false },
      { field: 'title', label: 'Job Title', weight: 10, required: false }
    ];
  }

  /**
   * Score a mapped record (plain object keyed by canonical field names)
   * against a rubric. Returns:
   *   { score: 0-100, missing: [{field,label,required}], readyForEnrichment: bool }
   *
   * readyForEnrichment is true only when every REQUIRED field is present;
   * the numeric score reflects the weighted completeness across all
   * rubric fields regardless of required/optional.
   */
  function scoreCompleteness(record, rubric) {
    // Only fall back to the default rubric when no rubric was supplied at
    // all (null/undefined) — e.g. a caller invoking this API directly. An
    // explicitly-empty array (e.g. the user unchecked every "Include" box
    // in the UI) is a deliberate choice and must be respected rather than
    // silently swapped for the hidden default: the rubric is required to
    // be fully visible/editable, never a hidden hardcoded formula.
    rubric = (rubric === null || rubric === undefined) ? defaultRubric() : rubric;

    if (rubric.length === 0) {
      // Nothing is selected to score against — say so explicitly instead
      // of returning a vacuous readyForEnrichment:true that would look
      // like a real pass in the UI.
      return { score: 0, missing: [], readyForEnrichment: false };
    }

    var totalWeight = 0;
    var earnedWeight = 0;
    var missing = [];
    var missingRequired = false;

    rubric.forEach(function (item) {
      var weight = typeof item.weight === 'number' ? item.weight : 0;
      totalWeight += weight;
      var value = record[item.field];
      var present = value !== undefined && value !== null && String(value).trim() !== '';
      if (present) {
        earnedWeight += weight;
      } else {
        missing.push({ field: item.field, label: item.label, required: !!item.required });
        if (item.required) missingRequired = true;
      }
    });

    var score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
    return { score: score, missing: missing, readyForEnrichment: !missingRequired };
  }

  return {
    defaultRubric: defaultRubric,
    scoreCompleteness: scoreCompleteness
  };
});
