#!/usr/bin/env node
/**
 * Prompt builder unit test.
 *
 * Runs scripts/spawn-research.js with various flag combos and asserts the
 * emitted JSON has correct taskName, cwd, depth passed through, runId present,
 * and the question text embedded in the prompt.
 *
 * Run: node tests/test-spawn-research.js
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'spawn-research.js');
const DEFAULT_CWD = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.log(`  ✗ ${msg}`); failed++; }
}

function run(args) {
  const r = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`spawn-research exited with code ${r.status}\nstderr: ${r.stderr}\nstdout: ${r.stdout}`);
  }
  // stdout is a JSON object (possibly preceded by PowerShell's stderr-wrapped
  // line). Find the first '{' and balance braces to extract the JSON.
  const text = r.stdout;
  const start = text.indexOf('{');
  if (start < 0) throw new Error(`no JSON in stdout: ${text}`);
  let depth = 0, end = -1;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) throw new Error(`unbalanced braces in stdout: ${text}`);
  return JSON.parse(text.slice(start, end));
}

function header(name) { console.log(`\n[${name}]`); }

// ─── Test cases ────────────────────────────────────────────────────────────

header('defaults');
{
  const out = run(['--question', 'What is X?']);
  assert(out.taskName === 'research-what-is-x', 'taskName slugified from question');
  assert(out.cwd === DEFAULT_CWD, 'cwd defaults to repo root');
  assert(out.lightContext === true, 'lightContext is true');
  assert(out.cleanup === 'delete', 'cleanup is delete');
  assert(out.runId && out.runId.endsWith('-what-is-x'), 'runId includes slug');
  assert(out.task.includes('QUESTION: What is X?'), 'task contains question text');
  assert(out.task.includes('DEPTH TIER: standard'), 'depth defaults to standard');
  assert(out.task.includes('TOPIC SLUG: what-is-x'), 'topic derived from question');
  assert(out.task.includes('skills\\research-standards\\SKILL.md'), 'task includes standing skill path (Windows path)');
  assert(out.task.includes('config\\output-schema.json'), 'task includes output schema path');
}

header('explicit depth + topic');
{
  const out = run(['--question', 'compare Y and Z', '--depth', 'deep', '--topic', 'compare-yz']);
  assert(out.taskName === 'research-compare-yz', 'taskName uses explicit topic');
  assert(out.task.includes('DEPTH TIER: deep'), 'depth passed through');
  assert(out.task.includes('TOPIC SLUG: compare-yz'), 'topic passed through');
  assert(out.task.includes('QUESTION: compare Y and Z'), 'question preserved');
}

header('quick tier');
{
  const out = run(['--question', 'lookup Q', '--depth', 'quick']);
  assert(out.task.includes('DEPTH TIER: quick'), 'quick tier set');
}

header('explicit cwd');
{
  const out = run(['--question', 'X', '--cwd', 'C:\\tmp\\foo']);
  assert(out.cwd === 'C:\\tmp\\foo', 'cwd overridden by flag');
  assert(out.task.includes('C:\\tmp\\foo\\skills\\research-standards\\SKILL.md'), 'skill path uses custom cwd');
}

header('missing question fails');
{
  const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
  assert(r.status === 2, 'exits 2 when --question missing');
}

header('invalid depth fails');
{
  const r = spawnSync('node', [SCRIPT, '--question', 'X', '--depth', 'bogus'], { encoding: 'utf8' });
  assert(r.status === 2, 'exits 2 when depth is not quick|standard|deep');
}

header('slug edge cases');
{
  const r1 = run(['--question', '   Multiple   Spaces   Here?!   ']);
  assert(r1.taskName === 'research-multiple-spaces-here', 'special chars stripped, spaces collapsed');

  const r2 = run(['--question', '中文 question']);
  assert(r2.taskName.startsWith('research-'), 'CJK fallback slug is non-empty');

  const r3 = spawnSync('node', [SCRIPT, '--question', ''], { encoding: 'utf8' });
  assert(r3.status === 2, 'empty --question value exits 2');
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);