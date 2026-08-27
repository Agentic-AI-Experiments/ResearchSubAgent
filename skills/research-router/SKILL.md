---
name: research-router
description: "Route user requests to the research sub-agent when the user prefixes with 'this is a research task'. Loads the standing spawn helper and awaits results."
---

# Research Router

Hands off to the research sub-agent when the user explicitly requests research. This is an **event-triggered** spawn — no cron, no automatic classifier.

## Trigger

Match at the start of the user's message (case-insensitive, leading whitespace ignored):

```
this is a research task
```

Only the exact phrase. No synonym matching. If the user wants research without using the trigger, they get the normal main-agent answer. False negatives are accepted; false positives are not.

The trigger phrase is followed by the actual research question. Strip the trigger from the prompt before handing off.

Examples that match:
- "This is a research task: what is the EU AI Act status?"
- "this is a research task  compare CRDT libraries for offline-first apps"
- "  This is a research task  find me peer-reviewed sources on X"

Examples that do NOT match:
- "please research X" (no trigger phrase)
- "I want you to do some research on X" (no trigger phrase)
- "this is research" (partial — must be the full phrase)

## Depth tier

Default: `standard`.

Override if the user's message contains the literal tokens `depth: quick`, `depth: deep`, or `depth: standard` (case-insensitive). Strip the token from the question text before handing off.

Examples:
- "This is a research task: X (depth: quick)" → quick
- "This is a research task depth:deep: X" → deep

If ambiguous or missing, default to `standard`.

## Topic slug

Auto-derive from the question:
- lowercase
- replace non-alphanumeric with `-`
- collapse and trim dashes
- cap at 40 chars
- fallback: `untitled`

Override if the user's message contains the literal token `topic: <slug>`.

## Hand-off

1. Strip the trigger phrase and any `depth:` / `topic:` tokens from the message.
2. The remaining text is the `question`.
3. Run `node scripts/spawn-research.js --question "<question>" --depth <tier> --topic <slug> --cwd C:\Users\Admin\projects\ResearchSubAgent` from a working dir of your choice. The script prints JSON to stdout with the spawn parameters.
4. Call `sessions_spawn` with those parameters (taskName, task, cwd, lightContext: true, cleanup: 'delete').
5. `sessions_yield` and wait for the completion event.
6. Read the result file at `state/runs/<runId>.json` (the runId is in the spawn output and embedded in the sub-agent's task prompt).
7. Relay to the user:
   - The `summary` field verbatim
   - The sources list as `[n] Title — Publisher (tier N). URL.`
   - A one-line confidence header: `Confidence: H/M/L · N findings · M sources`
   - Any `flags` worth surfacing (omit routine flags like "no tier-3 used")
8. Do not relay the full JSON unless the user asks.

## Failure modes

- Spawn fails → tell the user the research sub-agent could not be reached; ask whether to retry.
- Result file missing after completion event → tell the user the sub-agent returned without writing output; report the empty/failed status.
- Result file present but invalid JSON or doesn't match schema → tell the user, surface the schema violation, do not paraphrase.
- Question is empty after stripping trigger → ask them to re-state.

## Constraints

- **Same model as main agent.** No override.
- **Repo path is fixed:** `C:\Users\Admin\projects\ResearchSubAgent`. Do not parameterize unless the repo moves.
- **No cron.** This skill is event-triggered only.
- **One question per spawn.** Don't batch.