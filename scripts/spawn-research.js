#!/usr/bin/env node
/**
 * Hand-off helper. Builds the spawn parameters for the research sub-agent.
 *
 * Usage:
 *   node scripts/spawn-research.js --question "What's the current state of X?" [--depth standard] [--topic x-state]
 *
 * Output (stdout): JSON object with the fields the main agent needs to call
 * sessions_spawn:
 *   {
 *     taskName: "research-<slug>",
 *     task:     "<built prompt>",
 *     cwd:      "<repo path>",
 *     lightContext: true
 *   }
 *
 * The main agent then calls sessions_spawn with these params, awaits the
 * result via sessions_yield, reads state/runs/<id>.json, and relays.
 *
 * This helper does NOT touch the gateway. No cron, no HTTP calls.
 */

const path = require('node:path');
const fs = require('node:fs');

function parseArgs(argv) {
  const out = { depth: 'standard', topic: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--question' || a === '-q') out.question = argv[++i];
    else if (a === '--depth' || a === '-d') out.depth = argv[++i];
    else if (a === '--topic' || a === '-t') out.topic = argv[++i];
    else if (a === '--cwd' || a === '-c') out.cwd = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: spawn-research.js --question "..." [--depth quick|standard|deep] [--topic slug] [--cwd path]');
      process.exit(0);
    }
  }
  if (!out.question) {
    console.error('error: --question is required');
    process.exit(2);
  }
  if (!['quick', 'standard', 'deep'].includes(out.depth)) {
    console.error(`error: --depth must be one of quick|standard|deep (got "${out.depth}")`);
    process.exit(2);
  }
  if (!out.topic) {
    out.topic = out.question.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled';
  }
  if (!out.cwd) out.cwd = path.resolve(__dirname, '..');
  return out;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled';
}

function nowIdSlug(topic) {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return `${iso}-${slugify(topic)}`;
}

function buildPrompt({ question, depth, topic, cwd, runId }) {
  return `You are the research sub-agent. Spawned by main agent at ${new Date().toISOString()}.

QUESTION: ${question}
DEPTH TIER: ${depth}
TOPIC SLUG: ${topic}
RUN ID: ${runId}

Read in this order (absolute paths, resolved from cwd=${cwd}):
1. ${cwd}\\skills\\research-standards\\SKILL.md
2. ${cwd}\\config\\depth-tiers.json
3. ${cwd}\\config\\source-tiers.json
4. ${cwd}\\config\\output-schema.json
5. ${cwd}\\agents\\research\\agent.md

Then execute the workflow defined in agents/research/agent.md.

Hard requirement: write the result to ${cwd}\\state\\runs\\${runId}.json matching config/output-schema.json, then print one status line: RESEARCH_COMPLETE id=${runId} confidence=<H|M|L> findings=<n> sources=<n>

Do not return until the file is written. Do not propose follow-ups. Stop after the status line.`;
}

function main() {
  const args = parseArgs(process.argv);
  const runId = nowIdSlug(args.topic);
  const task = buildPrompt({ ...args, runId });

  const out = {
    taskName: `research-${slugify(args.topic)}`,
    task,
    cwd: args.cwd,
    lightContext: true,
    cleanup: 'delete',
    runId,
  };

  console.log(JSON.stringify(out, null, 2));

  // Best-effort: print the absolute path the sub-agent will write to, for
  // the main agent's reference.
  const target = path.join(args.cwd, 'state', 'runs', `${runId}.json`);
  console.error(`# sub-agent will write: ${target}`);
  if (!fs.existsSync(path.join(args.cwd, 'state', 'runs'))) {
    console.error(`# WARNING: ${path.join(args.cwd, 'state', 'runs')} does not exist — create it before spawning.`);
  }
}

if (require.main === module) main();