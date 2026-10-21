# AGENTS.md — Plugsmith Agent Handbook

> How any coding agent uses and works on plugsmith. This is the one source; `CLAUDE.md` and `GEMINI.md` point here.

## What it does

Plugsmith owns the **plugins** part of an agent's harness. It scans any repository's skills, agents, commands,
hooks and `.mcp.json` and writes the two files Claude Code reads: `.claude-plugin/plugin.json` and a one-plugin
`.claude-plugin/marketplace.json`, so the repo installs with `/plugin marketplace add <owner>/<repo>` and
`/plugin install <name>@<name>`. It checks the result the way `claude plugin validate` does (its eval agrees with
Claude Code case for case), and can prove it in a clean E2B microVM that sees only the files git tracks.

## Tools and how to call them

| Surface | Call | What it returns |
| ------- | ---- | --------------- |
| CLI | `npx -y -p github:naman10parikh/plugsmith plugsmith <repo> [--dry] [--force]` | Writes plugin.json, marketplace.json and the manifest.json inventory; keeps existing files without `--force` |
| CLI | `plugsmith validate <repo> [--claude] [--sandbox=e2b]` | Errors and warnings; `--claude` adds Claude Code's own verdict, `--sandbox=e2b` a clean-room run |
| CLI | `plugsmith recall "<query>"` | The best matching sections of plugsmith's memory, skills and personas |
| MCP | `plugsmith-mcp` tools `build_plugin`, `validate_plugin`, `validate_manifest` | The same over JSON-RPC on stdio |
| Skills | `skills/build-plugin`, `skills/validate-plugin`, `skills/plugin-doctor` | Build, check, diagnose |
| Sub-agents | `.claude/agents/manifest-reviewer.md`, `.claude/agents/plugin-packager.md` | A reviewer that reports; a packager that fixes and proves |
| Hook | `hooks/plugin-guard.mjs` (PostToolUse on Write, Edit, MultiEdit) | Tells the agent when an edited plugin file would not load |

`--sandbox=e2b` needs `E2B_API_KEY` in the environment and the optional `e2b` package (installed with plugsmith).

## Repository structure

```
identity/        SOUL, BRAND, HEARTBEAT, MEMORY, LEARNINGS
src/
  builder.ts     THE owned artifact: scan + emit (no LLM, no network)
  claude.ts      plugin.json and marketplace.json in Claude Code's shape; name rules
  validate.ts    the check, mirroring `claude plugin validate`
  sandbox.ts     the E2B clean room
  recall.ts      memory search
  types.ts       shared types (the inventory)
  cli.ts         plugsmith <repo> | validate | recall
  mcp-server.ts  plugsmith-mcp
  run-log.ts     logs/build-runs.jsonl
skills/          the three skills          .claude/agents/   the two personas
hooks/           plugin-guard.mjs and hooks.json (the plugin's hooks)
tests/           vitest suites             evals/   golden.json + run.mjs (agrees with claude plugin validate)
fixtures/        energy-fixture, a minimal harness repo
scripts/         mcp-smoke.mjs, field-drift.mjs (the nightly check against Claude Code's docs)
dsip.json        the self-improvement contract (honest level L2)
```

## Operating protocol

1. **Claim a TODO** before starting (`in_progress` + owner) in the maintainer's work queue (kept outside the public repository).
2. **State your assumptions** before writing any code (Karpathy Principle 1).
3. **Minimum diff** — touch only what the TODO requires. No speculative additions.
4. **Verify:** `pnpm build && pnpm test && pnpm eval`. RED blocks commit.
5. **Close the TODO** with evidence (test output or artifact path).
6. Conventional commit: `feat(builder):`, `feat(cli):`, `fix:`, `docs:`, `test:`.

## Harness surfaces scanned

| Surface | Path pattern | Where it lands in plugin.json |
|---|---|---|
| Skills | `skills/*/SKILL.md`, `.claude/skills/*/SKILL.md` | `skills/` loads by default; `.claude/skills/` is added under `skills` |
| Agents | `.claude/agents/*.md`, `agents/*.md` | listed one by one under `agents` (the key replaces `agents/`) |
| Commands | `.claude/commands/*.md`, `commands/` | under `commands` (the key replaces `commands/`) |
| Hooks | `hooks/hooks.json` | loads by default; warned when hooks live only in `.claude/settings.json` |
| MCP servers | `.mcp.json` | loads by default; warned when a server runs a relative path or needs secrets |

## What plugsmith is NOT

- Not a runtime (doesn't execute plugins).
- Not a registry (doesn't host or index plugins — that's Armory).
- Not an installer (Claude Code's `/plugin` installs).
- Not a self-improver (doesn't evolve itself — that's Darwin).

## What not to do

- Do not overwrite a hand-written `plugin.json` or `marketplace.json` without the owner's yes (`--force`).
- Do not write absolute or home-folder paths into any emitted file; every path is `./`-relative.
- Do not publish, push or create repositories on anyone's behalf.
- Do not print or commit keys; E2B reads `E2B_API_KEY` from the environment only.
