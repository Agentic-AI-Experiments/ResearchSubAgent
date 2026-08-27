# Architecture

## Goal

An on-demand research sub-agent with pre-loaded research standards, spawned by the main agent when a research task is requested. Distinct from cron-scheduled agents like the job aggregator and news digest.

## Flow

```
User (webchat)
    │
    │  "Research: <question>"
    ▼
Main agent (Clawdia)
    │
    │  recognizes research intent
    │  constructs prompt (question + depth tier + topic slug)
    │
    │  openclaw cron add  (one-shot, deleteAfterRun: true)
    │  ─ or ─
    │  sessions_spawn  (subagent runtime, agentId: "research")
    │
    ▼
Research sub-agent (isolated session)
    │
    │  loads standing skill (research-standards)
    │  loads config (depth-tiers, source-tiers, output-schema)
    │  reads sub-agent identity (agents/research/agent.md)
    │
    │  web_search → web_fetch loop, depth-tier bounded
    │  scores every source (tier + COI + recency)
    │  synthesizes findings
    │
    │  writes state/runs/<id>.json  (matches config/output-schema.json)
    │  prints: RESEARCH_COMPLETE id=… confidence=… findings=… sources=…
    │
    ▼
Main agent
    │
    │  reads state/runs/<id>.json
    │  formats prose summary + sources block
    │  relays to user via webchat
```

## Standing skill vs event-triggered spawn

- **Standing skill config** — `skills/research-standards/SKILL.md` defines *how* to evaluate sources, score confidence, check COI, and format output. Pre-loaded by the sub-agent on every spawn. Not re-defined per request.
- **Event-triggered spawn** — the main agent spawns the sub-agent only when the user asks for research. No cron schedule. No idle time. The spawn payload carries only the question, depth tier, and topic slug; everything else is standing config.

This split is the whole point of the design: research standards are stable, research questions are not.

## Hand-off mechanism

Single mechanism only. No cron. The research sub-agent is **event-triggered** by the main agent via `sessions_spawn`. Cron is reserved for scheduled work (job aggregator, news digest); this project is fundamentally different and must not be confused with them.

```js
sessions_spawn({
  task: <built prompt>,                  // from scripts/spawn-research.js
  taskName: 'research-<topic-slug>',     // stable handle for sessions_yield
  cwd: '<repo path>',                    // so sub-agent can resolve config/skill paths
  runtime: 'subagent',
  lightContext: true,                    // clean slate, load only standing skill
  cleanup: 'delete',                     // ephemeral session
})
```

Then `sessions_yield` to await completion, read `state/runs/<runId>.json`, relay to the user.

`scripts/spawn-research.js` is the prompt builder — it prints the exact params to pass to `sessions_spawn`. It does not touch the gateway.

## Output contract

`state/runs/<id>.json` matches `config/output-schema.json`. Fields:

- `id`, `topic`, `question`, `depth_tier`, `created_at`
- `findings[]` — each claim + confidence H/M/L + reasoning + source indices
- `sources[]` — each URL + tier + COI flag + accessed_at
- `confidence` — overall H/M/L
- `flags[]` — open issues: conflicts, gaps, recency concerns, COI concerns
- `summary` — 2-4 sentences for chat relay

`state/runs/` is **gitignored** — per-run results are ephemeral and regeneratable. The backup cron tarballs them along with the rest of the workspace, but they are not committed.

`config/` is **committed** — depth tiers, source tiers, and the output schema are stable decisions that benefit from version control.

## What is *not* in scope today

- No vector store / embeddings (research results are flat files; cross-research synthesis is a future layer).
- No persistent cache of fetched URLs (sub-agent re-fetches per run; cheap, deterministic, avoids staleness).
- No multi-question synthesis (one run = one question).
- No scheduled research (event-triggered only).

## Decisions log

- **2026-08-27** — initial scaffold. Depth tiers: quick / standard / deep, default standard. Output = JSON + 2-4 sentence summary. State split: `config/` committed, `state/runs/` gitignored. Skill scope: repo-local first, may promote to workspace-level OpenClaw skill later. **Hand-off is event-triggered via `sessions_spawn` only — no cron.** Cron is for scheduled work (job aggregator, news digest); this sub-agent is fundamentally on-demand.