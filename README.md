# Plugsmith

> Turns any repo's skills + hooks + commands + MCP into a `.claude-plugin/marketplace.json` bundle.

Plugsmith is a **plugin emitter**: give it any agent-native repo with a `.claude/` directory and it scans
the harness surface — skills, slash-commands, hooks, MCP servers — and emits a structured
`.claude-plugin/manifest.json` + `marketplace.json` bundle that Armory or any catalog can consume.

## What it does

```
any-repo/
  .claude/skills/deep-think/SKILL.md
  .claude/skills/playwright-cli/SKILL.md
  .claude/commands/status.md
  hooks/pre-compact-memory-flush.sh
  .mcp.json
```

→ `plugsmith .` →

```
any-repo/.claude-plugin/
  manifest.json      ← full schema with skills, commands, hooks, mcp
  marketplace.json   ← catalog-ready envelope
```

## Quickstart

```bash
# From this repo
pnpm build
node dist/cli.js /path/to/your-repo

# Or dry run (no files written)
node dist/cli.js /path/to/your-repo --dry
```

## Architecture

One owned artifact: `src/builder.ts` — the scanner + emitter. It:

1. Reads `.claude/skills/*/SKILL.md` → extracts name, description, triggers
2. Reads `.claude/commands/*.md` → extracts name, description
3. Reads `hooks/*.sh|.js|.ts` → infers hook type from filename
4. Reads `.mcp.json` → extracts server names + commands
5. Emits a `PluginManifest` + `MarketplaceEntry` JSON to `.claude-plugin/`

No LLM calls. No network. No side effects beyond writing two JSON files. Pure filesystem → JSON.

## Test

```bash
pnpm test
```

Runs 30 assertions on the `fixtures/energy-fixture` test repo — validates schema, counts, field shapes,
on-disk JSON correctness, dry mode, error handling, and empty-repo warnings.

## See Also

- [Armory](https://github.com/naman10parikh/armory) — the catalog that consumes marketplace.json bundles
- [Quartermaster](https://github.com/naman10parikh/quartermaster) — installs + evals tools from Armory
- [Darwin](https://github.com/naman10parikh/darwin) — the self-improvement harness that improves these

## Status

`PROVISIONAL NAME — plugsmith` — pending chairman confirm/rename. See TODOS.md §N1.
