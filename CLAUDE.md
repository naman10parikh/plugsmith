@AGENTS.md

# Plugsmith — Claude Code operating rules

> Forged as a meta-harness. One repo = one owned artifact (src/builder.ts) + its eval.
> See `identity/SOUL.md` for who plugsmith is.

## The Four Things (Karpathy — before/during ANY code change)

1. **Think before coding** — state assumptions; surface tradeoffs; present options.
2. **Simplicity first** — minimum code; nothing speculative; no single-use abstractions.
3. **Surgical changes** — touch only what the TODO requires; 0 deletions; match style.
4. **Goal-driven** — a `verify:` per step; loop until verified, not until it compiles.

Verify command: `pnpm build && pnpm test && pnpm eval`

## TODOS protocol

Claim → Work → Close:

1. Mark TODO `in_progress` + `owner: <you>` in the maintainer's work queue (kept outside the public repository).
2. Do the work.
3. Run `pnpm build && pnpm test && pnpm eval` — RED blocks commit.
4. Close TODO with evidence (test output line or artifact path).
5. Commit with conventional commit + Co-Authored-By trailer.

## Commit convention

`feat(builder):` · `feat(cli):` · `feat(types):` · `test:` · `fix:` · `docs:`

## In this repository

- **Ground truth:** `pnpm eval` compares plugsmith's verdicts with `claude plugin validate` whenever `claude` is
  on PATH; a disagreement is a bug in plugsmith, not in Claude Code. A new rule needs a case in `evals/golden.json`.
- **Hooks:** `.claude/settings.json` runs `hooks/plugin-guard.mjs` after every Write or Edit of a plugin file;
  the Bash logger needs `dist/` (run `pnpm build`).
- **MCP:** the root `.mcp.json` starts the published server through `npx` (safe for anyone who installs the
  plugin). To use this checkout's own build instead, run `claude --mcp-config .mcp.dev.json`.
- **Dogfood:** plugsmith's own `.claude-plugin/` is written by plugsmith: `node dist/src/cli.js . --force`.
- **E2B:** `plugsmith validate --sandbox=e2b` reads `E2B_API_KEY` from the environment. Never print it. `pnpm test` skips the live clean-room test unless `PLUGSMITH_LIVE_E2B=1` is also set, since each run boots a paid sandbox.

## Reuse (don't rebuild)

- Energy `.claude/rules/karpathy-coding-discipline.md` — the Four Things
- Darwin's tsconfig.json pattern — same strict settings
- Armory catalog schema — the manifest.json inventory is designed to feed Armory
