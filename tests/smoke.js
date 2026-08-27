#!/usr/bin/env node
/**
 * Integration smoke test (post-spawn validation only).
 *
 * Designed to be invoked by the OpenClaw main agent via sessions_spawn.
 * The agent (parent) does the spawning; this script only does post-spawn
 * validation:
 *
 *   1. Wait for state/runs/<runId>.json to appear.
 *   2. Validate it against config/output-schema.json via validate-result.js.
 *   3. Run smoke-specific assertions (≥1 finding, ≥1 source, valid enums, etc.).
 *   4. Clean up the result file.
 *
 * The parent agent should:
 *   - Build the prompt with scripts/spawn-research.js
 *   - Call sessions_spawn with the prompt, lightContext: true, cleanup: 'delete'
 *   - After completion, invoke this script with the runId:
 *       node tests/smoke.js <runId>
 *
 * Run standalone:  node tests/smoke.js <runId>
 * Run from agent:  invoke via sessions_spawn with task=<this file's invocation>
 *
 * Exit 0 on pass, 1 on fail.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(ROOT, 'state', 'runs');

function logStep(msg) { console.log(`[smoke] ${msg}`); }

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: node tests/smoke.js <runId>');
  process.exit(2);
}

const resultPath = path.join(RUNS_DIR, `${runId}.json`);
const timeoutMs = 5 * 60 * 1000;
const pollMs = 5000;
const startTime = Date.now();
logStep(`waiting for ${resultPath} (timeout ${timeoutMs / 1000}s)`);

let result = null;
while (Date.now() - startTime < timeoutMs) {
  if (fs.existsSync(resultPath)) {
    result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    logStep(`result appeared after ${Math.round((Date.now() - startTime) / 1000)}s`);
    break;
  }
  process.stdout.write('.');
  spawnSync('powershell', ['-Command', `Start-Sleep -Milliseconds ${pollMs}`], { encoding: 'utf8' });
}
process.stdout.write('\n');

if (!result) {
  console.error(`\nFAIL: result file not produced within ${timeoutMs / 1000}s`);
  console.error(`Expected: ${resultPath}`);
  process.exit(1);
}

// Schema validation via the standalone validator.
logStep('validating result schema...');
const validator = spawnSync('node', [path.join(__dirname, 'validate-result.js'), resultPath], { encoding: 'utf8' });
if (validator.status !== 0) {
  console.error(validator.stdout);
  console.error(validator.stderr);
  process.exit(1);
}
logStep('schema validation: PASS');

// Smoke-specific assertions.
let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); passed++; }
  else { console.log(`  ✗ ${msg}`); failed++; }
}

assert(result.findings.length >= 1, 'has at least 1 finding');
assert(result.sources.length >= 1, 'has at least 1 source');
assert(['H', 'M', 'L'].includes(result.confidence), 'confidence is H/M/L');
assert(['quick', 'standard', 'deep'].includes(result.depth_tier), 'depth_tier is one of quick|standard|deep');
assert(result.topic.length > 0, 'topic slug is non-empty');
assert(result.summary && result.summary.length > 0, 'summary is present');

// No tier-3 reliance for H-confidence findings (research-standards rule).
result.findings.forEach((f, i) => {
  if (f.confidence === 'H') {
    const sources = (f.supporting_sources || []).map(idx => result.sources[idx]);
    const tier3Only = sources.every(s => s && s.tier === 3);
    assert(!tier3Only, `findings[${i}].confidence=H is not supported by tier-3 only`);
  }
});

// Cleanup.
try { fs.unlinkSync(resultPath); logStep(`cleaned up ${resultPath}`); } catch {}

logStep(`${passed} assertions passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);