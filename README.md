# Lead Data Hygiene Kit

A pure offline, single-page tool that cleans, normalizes, and dedupes a raw
leads or companies CSV export, and shows exactly which records are
enrichment-ready versus missing the fields a paid enrichment vendor needs —
before any of it hits your CRM or costs you money.

Everything runs client-side, in your browser tab. Nothing is uploaded
anywhere. See [What this does not do](#what-this-does-not-do) below.

## Who this is for

RevOps and demand-gen teams who just exported a leads or companies list from
a form fill, a list-build vendor, or an event badge scanner, and need it
clean and triaged before it goes into the CRM or gets sent to an enrichment
tool (Clearbit, ZoomInfo, Apollo, etc.).

## How to open it

There is no build step and no server. Just open the file directly:

1. Download or clone this folder.
2. Double-click `index.html`, or open it via **File → Open** in your browser.
3. That's it — the page works entirely from disk with zero network calls.

## Walkthrough: the sample-data demo

1. Open `index.html`. The import screen loads instantly — it is never blank.
2. Click **"Load sample data (78 messy rows)"**. This loads a bundled,
   deliberately messy CSV (mixed casing, legal-suffix variants, missing
   domains, near-duplicate company names including one with a comma in it) —
   the kind of thing a real CRM export actually looks like. (Malformed-row
   handling — see the Methodology notes below — isn't triggered by this
   sample; paste or import your own ragged CSV to see that panel.)
3. **Confirm column mapping.** The tool guesses which source column maps to
   Company, Domain, Email, etc. from the header text, but nothing is
   processed until you confirm or correct that mapping yourself.
4. **Review the cleaned table.** Company names are normalized (legal
   suffixes stripped, casing fixed), domains are extracted and validated by
   string parsing only, and every row gets an enrichment-readiness score.
5. **Review duplicates.** The tool groups likely-duplicate records (exact
   domain match, exact normalized-name match, or fuzzy name match above an
   adjustable similarity threshold) and shows them side by side. Nothing is
   ever auto-merged — you pick which record survives, or dismiss the group
   as "not duplicates." Every action can be undone from the toast that
   appears after you take it.
6. **Edit the rubric.** The enrichment-readiness checklist (which fields
   matter, how much each is worth, which are required) is a plain editable
   table, not a hidden formula — toggle fields on/off, change weights, or
   change what counts as "required."
7. **Export.** Download `cleaned.csv` (everything you kept) and
   `needs-enrichment.csv` (just the records missing required fields) as
   in-browser downloads.

## Methodology notes

- **CSV parsing** is hand-written (see `js/core.js`, `parseCSV`) and handles
  quoted fields with embedded commas/newlines, escaped quotes (`""`),
  CRLF/LF/CR line endings, a UTF-8 BOM, and auto-detects comma / semicolon /
  tab delimiters by counting occurrences outside quoted spans. Rows whose
  column count doesn't match the header are captured as **malformed rows**
  and shown to you, not silently dropped or allowed to crash the app.
- **Company name normalization** strips a fixed list of common legal
  suffixes (Inc, LLC, Ltd, Corp, GmbH, etc.) and fixes ALL-CAPS / all-lower
  casing, while leaving intentionally mixed-case names (like "eBay") alone.
  This is string manipulation only — nothing is looked up.
- **Domain extraction** pulls a bare domain out of a URL, email address, or
  raw string using regex/string parsing (strip protocol, path, port, `www.`
  prefix) and validates it structurally against a hostname pattern. It never
  performs DNS resolution or checks reachability — a domain can pass
  validation here and still not exist.
- **Duplicate detection** combines exact matching (normalized domain or
  normalized company name) with fuzzy matching (Levenshtein edit-distance
  similarity, default threshold 0.85, adjustable in the UI). To avoid an
  O(n²) blowup, records are first bucketed ("blocked") by domain prefix or
  company-name first letter, and only compared within their bucket. Above
  5,000 rows a visible performance notice appears; dedup still runs, using
  the same blocking strategy, but is not guaranteed exhaustive at very large
  sizes.
- **The enrichment-readiness rubric** defaults to Company / Domain / Email as
  required fields and First Name / Last Name / Title as optional, but every
  weight, inclusion, and required flag is editable in the UI — the score
  shown per row is always computing exactly what's in that table.

## Honest limitations

- Fuzzy name matching is a heuristic (edit distance on normalized names). It
  will occasionally flag genuinely different companies with similar short
  names as candidates, and will occasionally miss duplicates whose names
  differ more than the threshold allows even though they're the same
  company. That's why every group is a suggestion for a human to confirm,
  never an automatic merge.
- The legal-suffix stripping list is not exhaustive and is English/
  US-Europe-centric; unusual or non-Latin-script legal suffixes may not be
  recognized.
- Domain "validity" here means "looks like a domain," not "resolves" or
  "is registered" — this tool does no live lookups at all (by design; see
  below).
- Blocking by domain-prefix or name-first-letter means two duplicate records
  that differ in both their domain and the first letter of their company
  name will not be compared and will not be flagged. This is a deliberate
  performance trade-off, documented rather than hidden.
- The bundled sample data is intentionally messy fiction — it is not real
  company or lead data.

## What this does not do

This tool is a pure offline analysis layer over CSV files you already have,
produced by some other system you already trust and have already consented
data through (your CRM, your existing analytics tool, your existing
enrichment vendor's own export). By design, it never does, and never will,
any of the following:

- **No live tracking, browser or device fingerprinting.**
- **No IP geolocation, reverse-DNS, or WHOIS lookups.** Domain "validation"
  here is string-pattern matching only, not resolution.
- **No scraping of any live website or social platform.**
- **No cookies** — real or synthetic — are set or read.
- **No network calls of any kind.** No `fetch`, no `XMLHttpRequest`, no
  WebSockets, no CDN scripts, no external fonts, no analytics beacons, no
  tracking pixels. Open your browser's Network tab while using this tool —
  it will stay empty.
- **No live enrichment API calls** to any vendor. This tool tells you what's
  *missing*; filling it in is a separate, explicit step you take elsewhere.
- **No persistence beyond the current tab.** Nothing is written to a
  server, a database, or even browser storage between sessions — refreshing
  the page clears your working state (export before you do).

## Project structure

```
index.html              Single entry point — open this directly, no build step
css/styles.css          All styling
js/csv.js               Pure logic: CSV parsing (quoting, delimiters, BOM, malformed rows)
js/normalize.js         Pure logic: company-name normalization, domain extraction/validation
js/dedup.js             Pure logic: Levenshtein/similarity, duplicate-group detection
js/rubric.js            Pure logic: enrichment-readiness scoring against a rubric
js/core.js              Thin aggregator — merges csv.js/normalize.js/dedup.js/rubric.js
                         into one `LDHK` API (window.LDHK, or `require('./js/core.js')`
                         in Node), so the rest of the app and the tests call one surface
js/sample-data.js       Bundled demo CSV, inlined as a JS string (see below)
js/app-state.js         Shared UI state, DOM helpers, record-building (window.LDHKApp)
js/app-import.js        File/paste import, column-mapping, malformed-row + dedup wiring
js/app-render.js        All DOM rendering (stats, tables, dedup review, rubric, export)
js/app-actions.js       User-triggered actions (merge, discard, export) and undo history
js/app.js               Entry point — attaches DOM event listeners on DOMContentLoaded,
                         no logic of its own
samples/sample-leads.csv  The same demo CSV as a plain file, for reference/reuse
tests/core.test.js     node --test suite covering the LDHK logic modules via core.js
```

`js/sample-data.js` embeds the exact same bytes as `samples/sample-leads.csv`
as a JS string, so the "Load sample data" button works instantly with zero
network calls — including zero calls to fetch a local file, which some
browsers restrict under `file://`.

## Running the tests

```
node --test tests/
```

49 tests cover CSV parsing (including quoting, delimiters, BOM, and
malformed-row handling), column-mapping suggestions, company-name
normalization, domain extraction/validation, Levenshtein/similarity,
duplicate detection (exact, fuzzy, threshold, blocking performance, the
soft row-count cap, and defensive handling of a null/undefined records
list), the completeness rubric (including the default-vs-explicitly-empty
rubric distinction), and the bundled sample CSV.
