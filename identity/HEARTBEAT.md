# Plugsmith — Heartbeat

## Schedule

| Check | Frequency | Action on anomaly |
|-------|-----------|-------------------|
| Build, tests, golden eval, MCP smoke | Every pull request (`ci.yml`) | Red check blocks the merge |
| Golden eval against `claude plugin validate` | Every pull request and nightly | A disagreement fails the run; fix the validator first |
| Manifest fields vs Claude Code's docs | Nightly (`improve.yml`) | `scripts/field-drift.mjs` opens an issue with the change |
| A plugin file an agent edits | On every Write or Edit (`hooks/plugin-guard.mjs`) | The agent is told what would not load |

## Health indicators

- **Healthy:** last nightly run green; the golden eval matches `claude plugin validate` on every case
- **Warning:** an open drift issue, or a new warning type in builds
- **Critical:** plugsmith calls a plugin valid that Claude Code refuses, or the reverse

## Recovery

1. Read the failed step of the last `ci.yml` or `improve.yml` run, and the last lines of `logs/build-runs.jsonl`
2. If Claude Code changed its manifest rules: update `src/claude.ts` and `src/validate.ts`, add a golden case
3. If unfixable: open a GitHub issue naming the field or rule
