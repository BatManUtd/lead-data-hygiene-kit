/**
 * normalize.js — company-name normalization and domain extraction for
 * Lead Data Hygiene Kit.
 *
 * Pure, dependency-free. Runs unmodified in Node (via `require`) and in the
 * browser (plain <script> tag, attaches to `window.LDHK_NORMALIZE`).
 *
 * ZERO network calls. Domain "validation" here is regex/string parsing
 * only — it never performs DNS resolution, reachability checks, or any
 * lookup of any kind. A string can pass validation here and still not
 * resolve to anything real; that is by design, see README.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.LDHK_NORMALIZE = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Company name normalization
  // ---------------------------------------------------------------------

  var LEGAL_SUFFIXES = [
    'inc', 'incorporated', 'llc', 'l.l.c', 'ltd', 'limited', 'corp', 'corporation',
    'co', 'company', 'plc', 'gmbh', 'llp', 'lp', 'pllc', 'pty', 'pty ltd',
    'sa', 's.a', 'ag', 'nv', 'bv', 'oy', 'as', 'srl', 'kk', 'co ltd', 'holdings',
    'group', 'international', 'intl'
  ];

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Normalize a company name for comparison/display: trims whitespace,
   * collapses internal whitespace, strips common legal suffixes and
   * trailing punctuation, and applies title-ish casing when the input is
   * ALL CAPS or all lowercase (mixed case is left as-is, since it may be
   * intentional stylization like "eBay").
   */
  function normalizeCompanyName(name) {
    var raw = String(name || '').trim();
    if (!raw) return '';
    var cleaned = raw.replace(/\s+/g, ' ').replace(/[.,]+$/g, '').trim();

    // Strip a trailing legal suffix (with optional leading comma).
    var withoutSuffix = cleaned;
    var suffixPattern = new RegExp(
      '[,]?\\s+(' + LEGAL_SUFFIXES.map(escapeRegex).join('|') + ')\\.?$',
      'i'
    );
    var prevLen;
    do {
      prevLen = withoutSuffix.length;
      withoutSuffix = withoutSuffix.replace(suffixPattern, '').trim();
    } while (withoutSuffix.length !== prevLen && withoutSuffix.length > 0);

    var result = withoutSuffix || cleaned;

    var isAllUpper = result === result.toUpperCase() && /[A-Z]/.test(result);
    var isAllLower = result === result.toLowerCase() && /[a-z]/.test(result);
    if (isAllUpper || isAllLower) {
      result = result.replace(/\w\S*/g, function (word) {
        // Preserve short all-caps acronyms like "IBM" only when original was
        // all-upper AND word length <= 3 (heuristic, not perfect).
        if (isAllUpper && word.length <= 3) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      });
    }
    return result;
  }

  /**
   * The key used to compare normalized company names for exact-match
   * dedup: lowercase, suffix-stripped, punctuation/whitespace-collapsed.
   */
  function companyKey(name) {
    var n = normalizeCompanyName(name).toLowerCase();
    return n.replace(/[^a-z0-9]+/g, '');
  }

  // ---------------------------------------------------------------------
  // Domain extraction / validation (pure string parsing — NO DNS/HTTP)
  // ---------------------------------------------------------------------

  var DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

  /**
   * Pull a bare, lowercase registrable-looking domain out of a URL, email,
   * or raw domain string, using string parsing only. This never contacts
   * the network — it does not check the domain resolves or exists.
   */
  function extractDomain(value) {
    if (!value) return null;
    var v = String(value).trim();
    if (!v) return null;

    // Email address: take the part after @.
    var atIdx = v.indexOf('@');
    if (atIdx !== -1) {
      v = v.slice(atIdx + 1);
    } else {
      // Strip protocol.
      v = v.replace(/^[a-z]+:\/\//i, '');
      // Strip path/query/fragment.
      v = v.split(/[/?#]/)[0];
      // Strip credentials (user:pass@host) if present without an @ split above.
      var atIdx2 = v.indexOf('@');
      if (atIdx2 !== -1) v = v.slice(atIdx2 + 1);
    }
    // Strip port.
    v = v.replace(/:\d+$/, '');
    // Strip leading www.
    v = v.replace(/^www\./i, '');
    v = v.trim().toLowerCase().replace(/\.$/, '');
    if (!v) return null;
    return isValidDomain(v) ? v : null;
  }

  /**
   * Structural validation only (regex against RFC-ish hostname rules).
   * Does NOT perform DNS resolution, reachability checks, or any network
   * call — it only tells you the string looks like a domain.
   */
  function isValidDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    if (domain.length > 253) return false;
    return DOMAIN_RE.test(domain);
  }

  return {
    normalizeCompanyName: normalizeCompanyName,
    companyKey: companyKey,
    extractDomain: extractDomain,
    isValidDomain: isValidDomain
  };
});
