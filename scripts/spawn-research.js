#!/usr/bin/env node
/**
 * Hand-off helper. Spawns the research sub-agent via `openclaw` cron
 * with an agentTurn payload. The cron job is created with deleteAfterRun
 * so it self-destructs after one execution.
 *
 * Usage:
 *   node scripts/spawn-research.js --question "What's the current state of X?" [--depth standard] [--topic x-state]
 *
 * Output (stdout):
 *   jobId=<id>  — for status polling
 *
 * After spawn, the main agent should poll `openclaw cron runs --jobId <id>`
 * until the run completes, then read `state/runs/<id>.json` (the sub-agent
 * writes the file path in its completion log via the payload instructions).
 */

const { execSync } = require('node:child_process');

function parseArgs(argv) {
  const out = { depth: 'standard', topic: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--question' || a === '-q') out.question = argv[++i];
    else if (a === '--depth' || a === '-d') out.depth = argv[++i];
    else if (a === '--topic' || a === '-t') out.topic = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: spawn-research.js --question "..." [--depth quick|standard|deep] [--topic slug]');
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
  return out;
}

function slugifyTopic(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled';
}

function nowIdSlug(topic) {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return `${iso}-${slugifyTopic(topic)}`;
}

function buildPrompt({ question, depth, topic }) {
  return `You are the research sub-agent. Spawned by main agent at ${new Date().toISOString()}.

QUESTION: ${question}
DEPTH TIER: ${depth}
TOPIC SLUG: ${topic}
RUN ID: ${nowIdSlug(topic)}

Read in this order:
1. skills/research-standards/SKILL.md
2. config/depth-tiers.json
3. config/source-tiers.json
4. config/output-schema.json
5. agents/research/agent.md

Then execute the workflow defined in agents/research/agent.md.

Hard requirement: write the result to state/runs/<RUN_ID>.json matching config/output-schema.json, then print one status line: RESEARCH_COMPLETE id=<RUN_ID> confidence=<H|M|L> findings=<n> sources=<n>

Do not return until the file is written. Do not propose follow-ups. Stop after the status line.`;
}

function main() {
  const args = parseArgs(process.argv);
  const prompt = buildPrompt(args);

  // Create a one-shot cron that deletes itself after firing.
  const jobName = `research-${args.topic}-${Date.now()}`;
  const payload = JSON.stringify({
    name: jobName,
    schedule: { kind: 'at', at: new Date(Date.now() + 5000).toISOString() },
    sessionTarget: 'isolated',
    payload: {
      kind: 'agentTurn',
      message: prompt,
      cwd: process.cwd(),
      lightContext: true,
    },
    deleteAfterRun: true,
    enabled: true,
  });

  // The helper is meant to be invoked by the main agent — it shells out to
  // the OpenClaw CLI. Concrete wiring (openclaw cron add --json …) is
  // documented in docs/architecture.md and can be adapted to the gateway's
  // HTTP API.
  console.log(JSON.stringify({ jobName, prompt, payload }, null, 2));
}

if (require.main === module) main();