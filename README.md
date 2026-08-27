# Research Sub-Agent

On-demand research sub-agent for the OpenClaw main agent. Pre-loaded research standards, event-triggered spawn, isolated session.

## What this is

A sub-agent definition plus a standing skill plus a hand-off helper. When the user asks the main agent to research something, the main agent spawns this sub-agent to do the multi-step research work in a clean isolated session and returns the result.

## Components

- **`agents/research/agent.md`** — sub-agent identity, workflow, output contract.
- **`skills/research-standards/SKILL.md`** — standing skill: source tiers, COI checks, recency rules, confidence scoring, citation format.
- **`skills/research-router/SKILL.md`** — main-agent trigger + handoff logic.
- **`config/depth-tiers.json`** — quick / standard / deep (default standard).
- **`config/source-tiers.json`** — tier 1/2/3 definitions.
- **`config/output-schema.json`** — schema for `state/runs/*.json`.
- **`scripts/spawn-research.js`** — prompt builder. Prints JSON params for `sessions_spawn`.
- **`docs/architecture.md`** — diagram, decisions log.
- **`state/runs/`** — per-run output (gitignored).

## How the main agent uses it

You (or the main agent) prefix the request with **"this is a research task"** (case-insensitive, exact match at the start). The main agent strips the trigger, optionally reads inline `depth:` and `topic:` tokens, builds the spawn parameters via `scripts/spawn-research.js`, calls `sessions_spawn`, awaits the result, reads `state/runs/<id>.json`, and relays the `summary` + sources + confidence to you.

Examples:
- `This is a research task: what is the EU AI Act status?`
- `This is a research task (depth: quick): find me the latest on X`
- `This is a research task depth:deep: what are the trade-offs of Y`

## Repo conventions

- `config/` is committed. Decisions live here.
- `state/runs/` is gitignored. Per-run results are ephemeral.
- Depth tier defaults to **standard** unless the user specifies quick or deep.
- Output is **JSON + summary** unless the user requests prose-only.

## Status

Initial scaffold (2026-08-27). Smoke test pending.