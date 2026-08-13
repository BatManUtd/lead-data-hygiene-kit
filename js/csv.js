/**
 * csv.js — CSV parsing and column-mapping suggestions for Lead Data Hygiene Kit.
 *
 * Pure, dependency-free. Runs unmodified in Node (via `require`) and in the
 * browser (plain <script> tag, attaches to `window.LDHK_CSV`).
 *
 * ZERO network calls. ZERO DOM access. Parsing only — never resolves,
 * fetches, or looks anything up.
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.LDHK_CSV = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------------
  // CSV Parsing
  // ---------------------------------------------------------------------

  /**
   * Strip a UTF-8 BOM (EF BB BF, decoded as ﻿) from the start of text.
   */
  function stripBOM(text) {
    if (typeof text !== 'string') return text;
    if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
    return text;
  }

  /**
   * Guess the field delimiter by counting occurrences of each candidate
   * outside of quoted spans, on the first few lines. Falls back to comma.
   */
  function detectDelimiter(text) {
    var candidates = [',', ';', '\t'];
    var sampleLines = text.split(/\r\n|\r|\n/).slice(0, 10).join('\n');
    var counts = { ',': 0, ';': 0, '\t': 0 };
    var inQuotes = false;
    for (var i = 0; i < sampleLines.length; i++) {
      var ch = sampleLines[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && counts.hasOwnProperty(ch)) {
        counts[ch]++;
      }
    }
    var best = candidates[0];
    var bestCount = -1;
    for (var j = 0; j < candidates.length; j++) {
      var c = candidates[j];
      if (counts[c] > bestCount) {
        bestCount = counts[c];
        best = c;
      }
    }
    return bestCount > 0 ? best : ',';
  }

  /**
   * RFC4180-ish CSV parser with support for:
   *  - quoted fields containing embedded delimiters and newlines
   *  - escaped quotes ("" inside a quoted field)
   *  - CRLF / LF / CR line endings
   *  - auto-detected delimiter (comma / semicolon / tab)
   *  - BOM stripping
   *
   * Malformed rows (wrong column count, or an unterminated quote at EOF)
   * are captured separately rather than dropped or thrown.
   *
   * Returns:
   *   {
   *     delimiter, headers: string[],
   *     rows: string[][],            // well-formed rows (matching header count)
   *     malformedRows: { line: number, raw: string, reason: string }[],
   *     totalDataRows: number
   *   }
   */
  function parseCSV(rawText) {
    if (typeof rawText !== 'string') {
      return { delimiter: ',', headers: [], rows: [], malformedRows: [], totalDataRows: 0, error: 'Input is not text.' };
    }
    var text = stripBOM(rawText);
    if (text.trim().length === 0) {
      return { delimiter: ',', headers: [], rows: [], malformedRows: [], totalDataRows: 0, error: 'File is empty.' };
    }
    var delimiter = detectDelimiter(text);

    // Tokenize into records (arrays of fields), tracking the 1-based
    // source line each record STARTS on for error reporting.
    var records = [];
    var recordStartLines = [];
    var field = '';
    var record = [];
    var inQuotes = false;
    var line = 1;
    var recordStartLine = 1;
    var i = 0;
    var len = text.length;
    var sawUnterminatedQuote = false;

    function pushField() {
      record.push(field);
      field = '';
    }
    function pushRecord() {
      pushField();
      records.push(record);
      recordStartLines.push(recordStartLine);
      record = [];
    }

    while (i < len) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        if (ch === '\n') line++;
        field += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        pushField();
        i++;
        continue;
      }
      if (ch === '\r') {
        // Treat CRLF or lone CR as a line break.
        if (text[i + 1] === '\n') i++;
        pushRecord();
        line++;
        recordStartLine = line;
        i++;
        continue;
      }
      if (ch === '\n') {
        pushRecord();
        line++;
        recordStartLine = line;
        i++;
        continue;
      }
      field += ch;
      i++;
    }
    // Flush trailing field/record if the file didn't end with a newline.
    if (field.length > 0 || record.length > 0) {
      if (inQuotes) sawUnterminatedQuote = true;
      pushRecord();
    }

    // Drop fully-blank trailing records (common with trailing newline).
    while (records.length > 0) {
      var last = records[records.length - 1];
      if (last.length === 1 && last[0] === '') {
        records.pop();
        recordStartLines.pop();
      } else {
        break;
      }
    }

    if (records.length === 0) {
      return { delimiter: delimiter, headers: [], rows: [], malformedRows: [], totalDataRows: 0, error: 'File has no rows.' };
    }

    var headers = records[0].map(function (h) { return h.trim(); });
    var dataRecords = records.slice(1);
    var dataStartLines = recordStartLines.slice(1);

    var rows = [];
    var malformedRows = [];
    for (var r = 0; r < dataRecords.length; r++) {
      var rec = dataRecords[r];
      var isBlank = rec.length === 1 && rec[0].trim() === '';
      if (isBlank) continue;
      if (rec.length !== headers.length) {
        malformedRows.push({
          line: dataStartLines[r],
          raw: rec.join(delimiter),
          reason: 'Expected ' + headers.length + ' columns, found ' + rec.length + '.'
        });
        continue;
      }
      rows.push(rec);
    }

    if (sawUnterminatedQuote) {
      malformedRows.push({
        line: dataStartLines[dataStartLines.length - 1] || line,
        raw: '(end of file)',
        reason: 'Unterminated quoted field at end of file — last record may be truncated.'
      });
    }

    return {
      delimiter: delimiter,
      headers: headers,
      rows: rows,
      malformedRows: malformedRows,
      totalDataRows: dataRecords.length
    };
  }

  /**
   * Convert parsed headers+rows into an array of plain objects keyed by header.
   */
  function rowsToObjects(headers, rows) {
    return rows.map(function (row) {
      var obj = {};
      for (var i = 0; i < headers.length; i++) {
        obj[headers[i]] = row[i] !== undefined ? row[i] : '';
      }
      return obj;
    });
  }

  /**
   * Serialize headers + array-of-arrays (or array-of-objects, given headers)
   * back into CSV text. Always quotes fields containing the delimiter,
   * quotes, or newlines. Always uses comma as the output delimiter for
   * maximum downstream compatibility, regardless of the input delimiter.
   */
  function toCSV(headers, rows) {
    var out = [];
    out.push(headers.map(csvEscape).join(','));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var values;
      if (Array.isArray(row)) {
        values = row;
      } else {
        values = headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
      }
      out.push(values.map(csvEscape).join(','));
    }
    return out.join('\r\n');
  }

  function csvEscape(value) {
    var s = value === null || value === undefined ? '' : String(value);
    if (/[",\r\n]/.test(s)) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // ---------------------------------------------------------------------
  // Column mapping suggestions
  // ---------------------------------------------------------------------

  // Canonical fields this tool understands, with header aliases used to
  // auto-suggest a mapping. Users always confirm/adjust before processing.
  var CANONICAL_FIELDS = [
    { key: 'company', label: 'Company Name', aliases: ['company', 'company name', 'account name', 'company_name', 'account', 'organization', 'org', 'business name', 'employer'] },
    { key: 'domain', label: 'Website / Domain', aliases: ['domain', 'website', 'url', 'company domain', 'web site', 'company website', 'site'] },
    { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address', 'work email', 'contact email'] },
    { key: 'firstName', label: 'First Name', aliases: ['first name', 'firstname', 'first', 'given name'] },
    { key: 'lastName', label: 'Last Name', aliases: ['last name', 'lastname', 'last', 'surname', 'family name'] },
    { key: 'title', label: 'Job Title', aliases: ['title', 'job title', 'role', 'position'] },
    { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'telephone', 'mobile'] },
    { key: 'industry', label: 'Industry', aliases: ['industry', 'sector', 'vertical'] },
    { key: 'employeeCount', label: 'Employee Count', aliases: ['employee count', 'employees', 'company size', 'headcount', '# employees'] },
    { key: 'country', label: 'Country', aliases: ['country', 'nation'] },
    { key: 'state', label: 'State / Region', aliases: ['state', 'region', 'province', 'state/province'] },
    { key: 'city', label: 'City', aliases: ['city', 'town'] },
    { key: 'linkedin', label: 'LinkedIn URL', aliases: ['linkedin', 'linkedin url', 'linkedin profile'] }
  ];

  function normalizeHeader(h) {
    return String(h || '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
  }

  /**
   * Given the raw CSV headers, suggest a mapping of canonical field key ->
   * source header (or null if no confident match). This is a SUGGESTION
   * only — the UI must let the user confirm or override every mapping
   * before any processing runs.
   */
  function suggestColumnMapping(headers) {
    var mapping = {};
    var usedHeaders = {};
    CANONICAL_FIELDS.forEach(function (field) {
      var match = null;
      for (var i = 0; i < headers.length; i++) {
        var norm = normalizeHeader(headers[i]);
        if (usedHeaders[headers[i]]) continue;
        if (field.aliases.indexOf(norm) !== -1) {
          match = headers[i];
          break;
        }
      }
      mapping[field.key] = match;
      if (match) usedHeaders[match] = true;
    });
    return mapping;
  }

  return {
    stripBOM: stripBOM,
    detectDelimiter: detectDelimiter,
    parseCSV: parseCSV,
    rowsToObjects: rowsToObjects,
    toCSV: toCSV,
    csvEscape: csvEscape,
    CANONICAL_FIELDS: CANONICAL_FIELDS,
    normalizeHeader: normalizeHeader,
    suggestColumnMapping: suggestColumnMapping
  };
});
