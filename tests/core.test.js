'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const core = require(path.join(__dirname, '..', 'js', 'core.js'));

// ---------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------

test('parseCSV: basic comma-delimited file with header', () => {
  const csv = 'Company,Email\nAcme Inc,jane@acme.com\nGlobex,bob@globex.com\n';
  const result = core.parseCSV(csv);
  assert.equal(result.delimiter, ',');
  assert.deepEqual(result.headers, ['Company', 'Email']);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], ['Acme Inc', 'jane@acme.com']);
  assert.equal(result.malformedRows.length, 0);
});

test('parseCSV: quoted fields with embedded commas and newlines', () => {
  const csv = 'Company,Notes\n"Acme, Inc","Line one\nLine two"\nGlobex,"no newline here"\n';
  const result = core.parseCSV(csv);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0][0], 'Acme, Inc');
  assert.equal(result.rows[0][1], 'Line one\nLine two');
  assert.equal(result.rows[1][1], 'no newline here');
});

test('parseCSV: escaped double-quotes inside quoted field', () => {
  const csv = 'Company,Nickname\n"Acme","The ""Best"" Co"\n';
  const result = core.parseCSV(csv);
  assert.equal(result.rows[0][1], 'The "Best" Co');
});

test('parseCSV: delimiter auto-detection — semicolon', () => {
  const csv = 'Company;Email\nAcme;jane@acme.com\nGlobex;bob@globex.com\n';
  const result = core.parseCSV(csv);
  assert.equal(result.delimiter, ';');
  assert.deepEqual(result.headers, ['Company', 'Email']);
  assert.equal(result.rows.length, 2);
});

test('parseCSV: delimiter auto-detection — tab', () => {
  const csv = 'Company\tEmail\nAcme\tjane@acme.com\nGlobex\tbob@globex.com\n';
  const result = core.parseCSV(csv);
  assert.equal(result.delimiter, '\t');
  assert.equal(result.rows.length, 2);
});

test('parseCSV: BOM is stripped from the first header', () => {
  const csv = '﻿Company,Email\nAcme,jane@acme.com\n';
  const result = core.parseCSV(csv);
  assert.equal(result.headers[0], 'Company');
});

test('parseCSV: malformed rows (wrong column count) are surfaced, not dropped or crashed on', () => {
  const csv = 'Company,Email,Title\nAcme,jane@acme.com,CEO\nBrokenRow,onlytwo\nGlobex,bob@globex.com,CTO\n';
  const result = core.parseCSV(csv);
  assert.equal(result.rows.length, 2);
  assert.equal(result.malformedRows.length, 1);
  assert.match(result.malformedRows[0].reason, /Expected 3 columns, found 2/);
});

test('parseCSV: empty file produces an error, not a crash', () => {
  const result = core.parseCSV('');
  assert.equal(result.rows.length, 0);
  assert.ok(result.error);
});

test('parseCSV: whitespace-only file produces an error', () => {
  const result = core.parseCSV('   \n  \n');
  assert.equal(result.rows.length, 0);
  assert.ok(result.error);
});

test('parseCSV: header-only file (zero data rows) parses cleanly with zero rows', () => {
  const result = core.parseCSV('Company,Email\n');
  assert.deepEqual(result.headers, ['Company', 'Email']);
  assert.equal(result.rows.length, 0);
  assert.equal(result.malformedRows.length, 0);
});

test('parseCSV: non-string input does not throw', () => {
  const result = core.parseCSV(null);
  assert.ok(result.error);
  assert.equal(result.rows.length, 0);
});

test('rowsToObjects: maps rows onto headers', () => {
  const objs = core.rowsToObjects(['A', 'B'], [['1', '2'], ['3', '4']]);
  assert.deepEqual(objs, [{ A: '1', B: '2' }, { A: '3', B: '4' }]);
});

test('toCSV: round-trips values that need quoting', () => {
  const headers = ['Company', 'Notes'];
  const rows = [{ Company: 'Acme, Inc', Notes: 'has "quotes" and\nnewline' }];
  const csv = core.toCSV(headers, rows);
  const reparsed = core.parseCSV(csv);
  assert.deepEqual(reparsed.headers, headers);
  assert.equal(reparsed.rows[0][0], 'Acme, Inc');
  assert.equal(reparsed.rows[0][1], 'has "quotes" and\nnewline');
});

// ---------------------------------------------------------------------
// Column mapping
// ---------------------------------------------------------------------

test('suggestColumnMapping: matches common real-world header variants', () => {
  const headers = ['Account Name', 'Website', 'Email Address', 'First Name', 'Last Name'];
  const mapping = core.suggestColumnMapping(headers);
  assert.equal(mapping.company, 'Account Name');
  assert.equal(mapping.domain, 'Website');
  assert.equal(mapping.email, 'Email Address');
  assert.equal(mapping.firstName, 'First Name');
  assert.equal(mapping.lastName, 'Last Name');
});

test('suggestColumnMapping: leaves unmatched fields null rather than guessing', () => {
  const headers = ['Weird Column 1', 'Weird Column 2'];
  const mapping = core.suggestColumnMapping(headers);
  assert.equal(mapping.company, null);
  assert.equal(mapping.domain, null);
});

// ---------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------

test('normalizeCompanyName: strips common legal suffixes', () => {
  assert.equal(core.normalizeCompanyName('Acme Inc.'), 'Acme');
  assert.equal(core.normalizeCompanyName('Acme, LLC'), 'Acme');
  assert.equal(core.normalizeCompanyName('Globex Corporation'), 'Globex');
  assert.equal(core.normalizeCompanyName('Initech Ltd'), 'Initech');
});

test('normalizeCompanyName: fixes ALL CAPS and all-lowercase casing', () => {
  assert.equal(core.normalizeCompanyName('ACME WIDGETS'), 'Acme Widgets');
  assert.equal(core.normalizeCompanyName('acme widgets'), 'Acme Widgets');
});

test('normalizeCompanyName: leaves mixed-case stylized names alone', () => {
  assert.equal(core.normalizeCompanyName('eBay'), 'eBay');
});

test('companyKey: two differently-formatted names normalize to the same key', () => {
  assert.equal(core.companyKey('Acme Inc.'), core.companyKey('ACME, LLC'));
});

// ---------------------------------------------------------------------
// Domain extraction / validation
// ---------------------------------------------------------------------

test('extractDomain: from a plain URL', () => {
  assert.equal(core.extractDomain('https://www.acme.com/pricing'), 'acme.com');
});

test('extractDomain: from a bare domain', () => {
  assert.equal(core.extractDomain('acme.com'), 'acme.com');
});

test('extractDomain: from an email address', () => {
  assert.equal(core.extractDomain('jane@sub.acme.com'), 'sub.acme.com');
});

test('extractDomain: strips port and trailing dot', () => {
  assert.equal(core.extractDomain('acme.com:8080'), 'acme.com');
  assert.equal(core.extractDomain('acme.com.'), 'acme.com');
});

test('extractDomain: returns null for garbage input', () => {
  assert.equal(core.extractDomain('not a domain at all'), null);
  assert.equal(core.extractDomain(''), null);
  assert.equal(core.extractDomain(null), null);
});

test('isValidDomain: rejects malformed domains', () => {
  assert.equal(core.isValidDomain('acme'), false);
  assert.equal(core.isValidDomain('.acme.com'), false);
  assert.equal(core.isValidDomain('acme..com'), false);
});

test('isValidDomain: accepts well-formed domains', () => {
  assert.equal(core.isValidDomain('acme.com'), true);
  assert.equal(core.isValidDomain('sub.acme.co.uk'), true);
});

// ---------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------

test('levenshtein: identical strings have distance 0', () => {
  assert.equal(core.levenshtein('acme', 'acme'), 0);
});

test('levenshtein: known distances', () => {
  assert.equal(core.levenshtein('kitten', 'sitting'), 3);
  assert.equal(core.levenshtein('', 'abc'), 3);
});

test('similarity: identical strings score 1', () => {
  assert.equal(core.similarity('acme', 'acme'), 1);
});

test('similarity: near-duplicate company names score high', () => {
  const sim = core.similarity('acmewidgets', 'acmewidget');
  assert.ok(sim > 0.85, 'expected high similarity, got ' + sim);
});

test('similarity: unrelated strings score low', () => {
  const sim = core.similarity('acme', 'globex');
  assert.ok(sim < 0.5, 'expected low similarity, got ' + sim);
});

// ---------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------

test('findDuplicates: exact domain match groups two records', () => {
  const records = [
    { company: 'Acme Inc', domain: 'acme.com', email: '' },
    { company: 'Acme Widgets', domain: 'acme.com', email: '' },
    { company: 'Totally Different Co', domain: 'other.com', email: '' }
  ];
  const result = core.findDuplicates(records);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].ids.sort(), [0, 1]);
  assert.equal(result.groups[0].reason, 'exact-domain');
});

test('findDuplicates: exact normalized-name match groups records without domains', () => {
  const records = [
    { company: 'Acme Inc.', domain: '', email: '' },
    { company: 'ACME, LLC', domain: '', email: '' },
    { company: 'Zebra Corp', domain: '', email: '' }
  ];
  const result = core.findDuplicates(records);
  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0].ids.sort(), [0, 1]);
  assert.equal(result.groups[0].reason, 'exact-name');
});

test('findDuplicates: fuzzy match respects adjustable threshold', () => {
  const records = [
    { company: 'Acme Widgets', domain: '', email: '' },
    { company: 'Acme Widget', domain: '', email: '' }
  ];
  const strict = core.findDuplicates(records, { threshold: 0.99 });
  const loose = core.findDuplicates(records, { threshold: 0.8 });
  assert.equal(strict.groups.length, 0, 'near-identical names should not match at a 0.99 threshold');
  assert.equal(loose.groups.length, 1, 'near-identical names should match at a 0.8 threshold');
});

test('findDuplicates: unrelated records produce no groups', () => {
  const records = [
    { company: 'Acme Inc', domain: 'acme.com', email: '' },
    { company: 'Totally Different Co', domain: 'other.com', email: '' }
  ];
  const result = core.findDuplicates(records);
  assert.equal(result.groups.length, 0);
});

test('findDuplicates: blocking keeps buckets small (no full O(n^2) scan) and still finds matches', () => {
  const records = [];
  for (let i = 0; i < 500; i++) {
    records.push({ company: 'Company ' + i, domain: 'domain' + i + '.com', email: '' });
  }
  // Plant one deliberate duplicate pair.
  records.push({ company: 'Special Match Co', domain: 'special.com', email: '' });
  records.push({ company: 'Special Match Co', domain: 'special.com', email: '' });

  const start = Date.now();
  const result = core.findDuplicates(records);
  const elapsed = Date.now() - start;

  assert.ok(elapsed < 3000, 'dedup on 502 rows should be fast (blocking), took ' + elapsed + 'ms');
  const found = result.groups.some((g) => g.ids.length === 2 && g.reason === 'exact-domain');
  assert.ok(found, 'expected the planted duplicate pair to be found');
});

test('findDuplicates: soft row-count cap produces a performance warning', () => {
  const records = [];
  for (let i = 0; i < 10; i++) {
    records.push({ company: 'Company ' + i, domain: 'domain' + i + '.com', email: '' });
  }
  const result = core.findDuplicates(records, { maxRows: 5 });
  assert.ok(result.performanceWarning, 'expected a performance warning above the soft cap');
});

test('findDuplicates: below the cap, no performance warning', () => {
  const records = [{ company: 'Acme', domain: 'acme.com', email: '' }];
  const result = core.findDuplicates(records, { maxRows: 5000 });
  assert.equal(result.performanceWarning, null);
});

// ---------------------------------------------------------------------
// Completeness / enrichment-readiness rubric
// ---------------------------------------------------------------------

test('defaultRubric: returns a non-empty, user-visible list of fields', () => {
  const rubric = core.defaultRubric();
  assert.ok(Array.isArray(rubric));
  assert.ok(rubric.length > 0);
  rubric.forEach((item) => {
    assert.ok(item.field);
    assert.ok(item.label);
    assert.equal(typeof item.weight, 'number');
  });
});

test('scoreCompleteness: fully populated record scores 100 and is ready', () => {
  const rubric = core.defaultRubric();
  const record = { company: 'Acme', domain: 'acme.com', email: 'jane@acme.com', firstName: 'Jane', lastName: 'Doe', title: 'CEO' };
  const result = core.scoreCompleteness(record, rubric);
  assert.equal(result.score, 100);
  assert.equal(result.missing.length, 0);
  assert.equal(result.readyForEnrichment, true);
});

test('scoreCompleteness: missing a required field marks record not ready', () => {
  const rubric = core.defaultRubric();
  const record = { company: 'Acme', domain: '', email: 'jane@acme.com' };
  const result = core.scoreCompleteness(record, rubric);
  assert.equal(result.readyForEnrichment, false);
  assert.ok(result.missing.some((m) => m.field === 'domain' && m.required === true));
});

test('scoreCompleteness: missing only optional fields keeps record ready', () => {
  const rubric = core.defaultRubric();
  const record = { company: 'Acme', domain: 'acme.com', email: 'jane@acme.com' };
  const result = core.scoreCompleteness(record, rubric);
  assert.equal(result.readyForEnrichment, true);
  assert.ok(result.score < 100);
  assert.ok(result.score > 0);
});

test('scoreCompleteness: custom user-edited rubric is respected', () => {
  const customRubric = [
    { field: 'company', label: 'Company', weight: 50, required: true },
    { field: 'industry', label: 'Industry', weight: 50, required: true }
  ];
  const record = { company: 'Acme', industry: '' };
  const result = core.scoreCompleteness(record, customRubric);
  assert.equal(result.score, 50);
  assert.equal(result.readyForEnrichment, false);
  assert.equal(result.missing.length, 1);
  assert.equal(result.missing[0].field, 'industry');
});

test('scoreCompleteness: null/undefined rubric falls back to default (direct API call, no crash)', () => {
  const result1 = core.scoreCompleteness({ company: 'Acme' }, null);
  const result2 = core.scoreCompleteness({ company: 'Acme' }, undefined);
  assert.equal(typeof result1.score, 'number');
  assert.equal(typeof result2.score, 'number');
  // Falling back to the default rubric means company is scored.
  assert.ok(result1.score > 0);
  assert.ok(result2.score > 0);
});

test('scoreCompleteness: explicitly empty rubric (all criteria unchecked) is respected, not silently replaced by the hidden default', () => {
  // Regression test: this reproduces the "uncheck every Include box in the
  // rubric editor" UI path — App.activeRubric() returns [], which must NOT
  // be silently swapped for the hardcoded defaultRubric(). See rubric.js.
  const result = core.scoreCompleteness({ company: 'Acme', domain: 'acme.com', email: 'jane@acme.com' }, []);
  assert.equal(result.score, 0);
  assert.deepEqual(result.missing, []);
  assert.equal(result.readyForEnrichment, false);
});

// ---------------------------------------------------------------------
// findDuplicates: defensive input handling
// ---------------------------------------------------------------------

test('findDuplicates: null records list degrades to an empty result instead of throwing', () => {
  const result = core.findDuplicates(null, {});
  assert.deepEqual(result.groups, []);
  assert.equal(result.performanceWarning, null);
});

test('findDuplicates: undefined records list degrades to an empty result instead of throwing', () => {
  const result = core.findDuplicates(undefined, {});
  assert.deepEqual(result.groups, []);
});

// ---------------------------------------------------------------------
// Bundled sample data
// ---------------------------------------------------------------------

test('sample-leads.csv: parses with zero malformed rows (the "ACME, LLC" comma is properly quoted)', () => {
  const fs = require('node:fs');
  const csvPath = path.join(__dirname, '..', 'samples', 'sample-leads.csv');
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const result = core.parseCSV(csvText);
  assert.deepEqual(result.malformedRows, []);
  const objs = core.rowsToObjects(result.headers, result.rows);
  const acmeLlc = objs.find((o) => o['Company Name'] === 'ACME, LLC');
  assert.ok(acmeLlc, 'expected a properly-parsed "ACME, LLC" row (comma preserved, not split into extra columns)');
  assert.equal(acmeLlc['Website'], 'acme.com');
});

test('js/sample-data.js: bundled JS string is byte-identical to samples/sample-leads.csv', () => {
  const fs = require('node:fs');
  const csvPath = path.join(__dirname, '..', 'samples', 'sample-leads.csv');
  const csvText = fs.readFileSync(csvPath, 'utf8');
  const sandbox = {};
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'sample-data.js'), 'utf8');
  const fn = new Function('window', code); // eslint-disable-line no-new-func
  fn(sandbox);
  assert.equal(sandbox.LDHK_SAMPLE_CSV, csvText);
});
