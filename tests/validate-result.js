#!/usr/bin/env node
/**
 * Output schema validator.
 *
 * Validates a research result file (state/runs/*.json) against the contract
 * declared in config/output-schema.json. Doesn't enforce full JSON Schema —
 * checks the structural and semantic constraints that matter for this
 * project (required fields, types, confidence values, source indices in
 * bounds, claim ↔ source linkage).
 *
 * Usage:
 *   node tests/validate-result.js <path-to-result.json>
 *   node tests/validate-result.js                  # validates the most recent state/runs/*.json
 *
 * Exit 0 on pass, 1 on fail.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'config', 'output-schema.json');
const RUNS_DIR = path.join(ROOT, 'state', 'runs');

const errors = [];
const warns = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warns.push(msg); }

function pickResultPath(arg) {
  if (arg) return path.resolve(arg);
  if (!fs.existsSync(RUNS_DIR)) return null;
  const files = fs.readdirSync(RUNS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ f, m: fs.statSync(path.join(RUNS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  if (!files.length) return null;
  return path.join(RUNS_DIR, files[0].f);
}

function isString(v) { return typeof v === 'string'; }
function isInt(v) { return Number.isInteger(v); }
function isArray(v) { return Array.isArray(v); }
function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function isIsoDate(v) {
  if (!isString(v)) return false;
  const d = new Date(v);
  return !isNaN(d.getTime());
}
function isDate(v) {
  if (!isString(v)) return false;
  return /^\d{4}-\d{2}(-\d{2})?$/.test(v);
}

function validate(result) {
  // Top-level required
  const topRequired = ['id', 'topic', 'question', 'depth_tier', 'created_at', 'findings', 'sources', 'confidence', 'flags'];
  for (const k of topRequired) {
    if (!(k in result)) err(`missing required field: ${k}`);
  }

  // depth_tier enum
  if (isString(result.depth_tier) && !['quick', 'standard', 'deep'].includes(result.depth_tier)) {
    err(`depth_tier must be quick|standard|deep, got: ${result.depth_tier}`);
  }

  // confidence enum
  if (isString(result.confidence) && !['H', 'M', 'L'].includes(result.confidence)) {
    err(`confidence must be H|M|L, got: ${result.confidence}`);
  }

  // created_at
  if ('created_at' in result && !isIsoDate(result.created_at)) {
    err(`created_at must be ISO-8601, got: ${result.created_at}`);
  }

  // id format (matches the runId convention)
  if (isString(result.id) && !/^\d{4}-\d{2}-\d{2}T[\d-]+Z-.+/.test(result.id)) {
    warn(`id format unexpected (expected YYYY-MM-DDTHH-MM-SS-<slug>): ${result.id}`);
  }

  // sources
  if ('sources' in result) {
    if (!isArray(result.sources)) err('sources must be an array');
    else {
      result.sources.forEach((s, i) => {
        if (!isObject(s)) { err(`sources[${i}] must be object`); return; }
        for (const k of ['url', 'title', 'tier', 'accessed_at']) {
          if (!(k in s)) err(`sources[${i}] missing: ${k}`);
        }
        if (isInt(s.tier) && ![1, 2, 3].includes(s.tier)) {
          err(`sources[${i}].tier must be 1|2|3, got: ${s.tier}`);
        }
        if ('accessed_at' in s && !isIsoDate(s.accessed_at)) {
          err(`sources[${i}].accessed_at must be ISO-8601, got: ${s.accessed_at}`);
        }
        if ('published_at' in s && s.published_at !== null && !/^\d{4}-\d{2}(-\d{2})?$/.test(s.published_at)) {
          err(`sources[${i}].published_at must be YYYY-MM-DD, YYYY-MM, or null, got: ${s.published_at}`);
        }
        if ('coi_flag' in s) {
          if (!isObject(s.coi_flag)) err(`sources[${i}].coi_flag must be object`);
          else if (typeof s.coi_flag.present !== 'boolean') err(`sources[${i}].coi_flag.present must be boolean`);
        }
      });
    }
  }

  // findings
  if ('findings' in result) {
    if (!isArray(result.findings)) err('findings must be an array');
    else {
      const srcCount = isArray(result.sources) ? result.sources.length : 0;
      result.findings.forEach((f, i) => {
        if (!isObject(f)) { err(`findings[${i}] must be object`); return; }
        for (const k of ['claim', 'confidence', 'supporting_sources']) {
          if (!(k in f)) err(`findings[${i}] missing: ${k}`);
        }
        if (isString(f.confidence) && !['H', 'M', 'L'].includes(f.confidence)) {
          err(`findings[${i}].confidence must be H|M|L, got: ${f.confidence}`);
        }
        if (isArray(f.supporting_sources)) {
          f.supporting_sources.forEach(idx => {
            if (!isInt(idx)) err(`findings[${i}].supporting_sources[] must be int, got: ${typeof idx}`);
            else if (idx < 0 || idx >= srcCount) err(`findings[${i}].supporting_sources[] index ${idx} out of bounds (sources has ${srcCount})`);
          });
        } else if ('supporting_sources' in f) {
          err(`findings[${i}].supporting_sources must be array`);
        }
        if ('conflicting_sources' in f) {
          if (!isArray(f.conflicting_sources)) err(`findings[${i}].conflicting_sources must be array`);
          else f.conflicting_sources.forEach(idx => {
            if (!isInt(idx)) err(`findings[${i}].conflicting_sources[] must be int`);
            else if (idx < 0 || idx >= srcCount) err(`findings[${i}].conflicting_sources[] index ${idx} out of bounds`);
          });
        }
      });
    }
  }

  // Hard rule: H-confidence findings must have ≥2 supporting sources
  if (isArray(result.findings)) {
    result.findings.forEach((f, i) => {
      if (f.confidence === 'H' && isArray(f.supporting_sources) && f.supporting_sources.length < 2) {
        err(`findings[${i}].confidence=H but supporting_sources has only ${f.supporting_sources.length} entries (rule: ≥2 for H)`);
      }
    });
  }

  // flags must be array
  if ('flags' in result && !isArray(result.flags)) err('flags must be array');

  // summary if present must be string
  if ('summary' in result && !isString(result.summary)) err('summary must be string');
}

function main() {
  const target = pickResultPath(process.argv[2]);
  if (!target) {
    console.error('No result file to validate. Pass a path or write one to state/runs/');
    process.exit(2);
  }
  console.log(`Validating: ${target}`);

  let result;
  try {
    result = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (e) {
    console.error(`Cannot parse JSON: ${e.message}`);
    process.exit(1);
  }

  validate(result);

  if (warns.length) {
    console.log(`\nWARNINGS (${warns.length}):`);
    warns.forEach(w => console.log(`  ! ${w}`));
  }

  if (errors.length) {
    console.error(`\nFAIL (${errors.length} errors):`);
    errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  console.log(`\nOK — schema contract satisfied.`);
  console.log(`  topic: ${result.topic}`);
  console.log(`  depth: ${result.depth_tier}`);
  console.log(`  confidence: ${result.confidence}`);
  console.log(`  findings: ${result.findings.length}`);
  console.log(`  sources: ${result.sources.length}`);
  console.log(`  flags: ${result.flags.length}`);
  process.exit(0);
}

if (require.main === module) main();