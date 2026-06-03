# Plugsmith — Operating Handbook

> Forged as a meta-harness. One repo = one owned artifact (src/builder.ts) + its eval.
> See `identity/SOUL.md` for who plugsmith is.

## What this is

The **plugin emitter** component: scans any agent-native repo's harness surface
(`.claude/skills/`, `.claude/commands/`, `hooks/`, `.mcp.json`) and emits a valid
`.claude-plugin/manifest.json` + `marketplace.json` bundle.

**Owned artifact:** `src/builder.ts` — pure filesystem → JSON. No LLM, no network, no deps.

## The Four Things (Karpathy — before/during ANY code change)

1. **Think before coding** — state assumptions; surface tradeoffs; present options.
2. **Simplicity first** — minimum code; nothing speculative; no single-use abstractions.
3. **Surgical changes** — touch only what the TODO requires; 0 deletions; match style.
4. **Goal-driven** — a `verify:` per step; loop until verified, not until it compiles.

Verify command: `pnpm build && pnpm test`

## TODOS protocol

Claim → Work → Close:

1. Mark TODO `in_progress` + `owner: <you>` in TODOS.md.
2. Do the work.
3. Run `pnpm build && pnpm test` — RED blocks commit.
4. Close TODO with evidence (test output line or artifact path).
5. Commit with conventional commit + Co-Authored-By trailer.

## Commit convention

`feat(builder):` · `feat(cli):` · `feat(types):` · `test:` · `fix:` · `docs:`

## Provisional name

`plugsmith` is provisional. Chairman must confirm or rename before `gh repo create`.
Until then: local only — do NOT push to GitHub.

## Reuse (don't rebuild)

- Energy `.claude/rules/karpathy-coding-discipline.md` — the Four Things
- Darwin's tsconfig.json pattern — same strict settings
- Quartermaster's SOUL.md pattern — boundary-explicit identity
- Armory catalog schema — marketplace.json is designed to feed Armory
