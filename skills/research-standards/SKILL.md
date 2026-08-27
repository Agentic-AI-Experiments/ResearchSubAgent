---
name: research-standards
description: "Apply source-credibility, conflict-of-interest, recency, and citation rules when conducting research. Load before any web_search / web_fetch cycle."
---

# Research Standards

Standing skill loaded by the research sub-agent. Defines how to evaluate sources, score confidence, and format output. Defaults live in `config/source-tiers.json`, `config/depth-tiers.json`, `config/output-schema.json` — this skill is the procedural layer on top of those values.

## Workflow

1. **Plan the query** — rephrase the question into 2-4 distinct search angles. Predict what kinds of sources would count as primary.
2. **Search → fetch loop** — issue searches, fetch promising URLs, then decide if more is needed before continuing. Don't fetch everything speculatively.
3. **Score every source** — assign a tier (1/2/3) using `config/source-tiers.json`. Tier-3 sources cannot be sole support for any claim.
4. **COI check** — for every cited source, scan author/publisher/funding for commercial ties to the topic. Flag if present.
5. **Recency check** — apply per-domain rules (health/tech/legal: ≤12 months; finance: real-time; science: ≤5y unless historical). Flag stale.
6. **Synthesize findings** — each finding = a single claim with confidence H/M/L, supporting source indices, and reasoning.
7. **Cross-check** — for H-confidence claims, require ≥2 independent tier-1/2 sources that agree.
8. **Flag gaps** — record anything you could not verify, anything that conflicted, anything where you relied on tier-3.

## Source-tier rules (summary)

- **Tier 1** — peer-reviewed journals, government/regulator, official company filings, court filings, standards bodies.
- **Tier 2** — major newswire / established trade press / think tanks with disclosed funding.
- **Tier 3** — social, personal blogs, forums. Cite only when no tier-1/2 exists AND flag explicitly.
- Wikipedia: index only, never the sole citation.

## Confidence scoring

- **H** — ≥2 independent tier-1/2 sources agree; recency OK; no COI.
- **M** — single tier-1/2 source OR multiple tier-2 with one conflict; or some COI but transparently disclosed.
- **L** — tier-3 reliance, unresolved conflict, stale by domain standards, or material COI undisclosed.

## Conflict-of-interest checks

For every cited source, note the publisher/author and check:
- Does the publisher sell a product the source evaluates?
- Is the author paid by, employed by, or advising a party in the topic?
- Is the study funded by an interested party?

If yes, set `coi_flag.present: true` and explain in `detail`. Do not silently drop COI sources — annotate.

## Recency defaults

| Domain     | Max age |
| ---------- | ------- |
| Finance    | Real-time (≤7 days) |
| Health/medical | ≤12 months |
| Tech (product/company) | ≤12 months |
| Tech (fundamentals) | ≤3 years |
| Legal/regulatory | ≤12 months (verify still in force) |
| Pure science | ≤5 years (unless historical) |
| History/geopolitics | ≤10 years for consensus facts, current for "as of now" |

Override on a per-claim basis when the topic demands it; record why.

## Citation format

In the result JSON, every finding references sources by **index** into the `sources` array. The main agent renders citations as `[n]` in prose + a `Sources` block with `[n] Title — Publisher (Tier). URL. Accessed YYYY-MM-DD.`

## Output contract

Always write `state/runs/<id>.json` matching `config/output-schema.json`. `id` is `<ISO-timestamp-with-dashes>-<slug>`. `summary` is 2-4 sentences, plain language, suitable for chat relay. Do not omit `flags`.

## Hard rules

- Never invent a citation. If you can't find a source, write it as a flag, not a source.
- Never claim tier-1 without verification — mislabeling is worse than honest tier-3.
- Never skip the COI check to save time.
- Never declare H confidence on a single-source claim.
- If depth tier = quick, still run COI/recency but accept fewer sources.

## When to refuse or escalate

- Topic asks for advice that requires a licensed professional (medical, legal, financial advice for a specific person). Refuse, recommend a professional. Cite only as background.
- Topic is inside an obvious COI you cannot navigate (e.g. asking the publisher of product X to evaluate product X).
- Question is unanswerable from publicly accessible sources. Flag and stop.