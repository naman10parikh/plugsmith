# AGENTS.md — Plugsmith Agent Handbook

> This file tells any LLM agent how this repo is structured and how to work in it.

## Domain

Plugin emitter for agent-native harness repos. Owned component: `src/builder.ts`.

## Repository Structure

```
identity/
  SOUL.md           # Who plugsmith is — identity, personality, boundaries
src/
  types.ts          # Shared TypeScript types (PluginManifest, MarketplaceEntry, …)
  builder.ts        # THE owned artifact — scanner + emitter (no LLM, no network)
  cli.ts            # Thin CLI wrapper: plugsmith <repoRoot> [--dry]
tests/
  builder.test.ts   # Eval: 30 assertions on the energy-fixture
fixtures/
  energy-fixture/   # Minimal repo that mimics an agent-native harness surface
    .claude/skills/ # Two skills (deep-think, playwright-cli)
    .claude/commands/ # One command (status)
    hooks/          # Two hooks (pre-compact, session-start)
    .mcp.json       # Two MCP servers (github, context7)
AGENTS.md           # This file
CLAUDE.md           # Operating handbook for human + agent co-development
TODOS.md            # Task queue (claim → work → close with evidence)
README.md           # Human-readable quickstart
llms.txt            # LLM-readable index (llmstxt.org)
package.json        # Node package config
tsconfig.json       # TypeScript config
```

## Operating Protocol

1. **Claim a TODO** before starting (`in_progress` + owner) in TODOS.md.
2. **State your assumptions** before writing any code (Karpathy Principle 1).
3. **Minimum diff** — touch only what the TODO requires. No speculative additions.
4. **Verify:** `pnpm build && pnpm test`. RED blocks commit.
5. **Close the TODO** with evidence (test output or artifact path).
6. Conventional commit: `feat(builder):`, `feat(cli):`, `fix:`, `docs:`, `test:`.

## The Four Things (applied to this repo)

- **Think before coding:** state assumptions; note tradeoffs; present options.
- **Simplicity first:** builder.ts is purposely dependency-free (stdlib only).
- **Surgical changes:** do not touch `identity/SOUL.md` or README.md unless the mandate changes.
- **Goal-driven:** every change has a `verify:` check (run `pnpm test`).

## What plugsmith is NOT

- Not a runtime (doesn't execute plugins).
- Not a registry (doesn't host or index plugins — that's Armory).
- Not an installer (doesn't install plugins — that's Quartermaster).
- Not a self-improver (doesn't evolve itself — that's Darwin).

## Harness surfaces scanned

| Surface | Path pattern | What's extracted |
|---|---|---|
| Skills | `.claude/skills/*/SKILL.md` | name, description, triggers |
| Commands | `.claude/commands/*.md` | name, description |
| Hooks | `hooks/*.sh\|.js\|.ts` | name, type (inferred from filename) |
| MCP servers | `.mcp.json` | name, command, args |
