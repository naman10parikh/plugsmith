# Plugsmith — Memory

## Bootstrap (loaded every cycle)

- Job: turn a repository into a Claude Code plugin (`.claude-plugin/plugin.json`) with a one-plugin marketplace
- Created: 2026-06-03. Brought to the fleet standard: 2026-10-19
- Search this memory, the skills and the personas: `plugsmith recall "<query>"`
- Corrections that became rules: `identity/LEARNINGS.md`
- Health: the nightly improve run and `logs/build-runs.jsonl` (one line per build, MCP call and hook)

## What Claude Code reads (plugins and marketplace references, read 2026-10-19)

- **plugin.json** at `.claude-plugin/plugin.json`; `name` is the only required key (kebab-case; names that
  start with `claude-` or `anthropic-` are reserved). `manifest.json` is not read.
- **Component paths** start with `./`, stay inside the plugin and must exist.
- **Replace vs add:** `commands` and `agents` replace their default folders (`commands/`, `agents/`); `skills`
  adds to `skills/`; `hooks` and `mcpServers` merge with `hooks/hooks.json` and `.mcp.json`.
- **agents** entries are `.md` files, never folders; **skills** entries are folders.
- **marketplace.json** needs `name`, `owner.name` and `plugins` (each with `name` and `source`); a relative
  source starts with `./`. Reserved marketplace names include `agent-skills`, `github`, `npm` and `claude-*` lookalikes.
- `claude plugin validate .` needs no login; it reads only. Install line: `/plugin marketplace add <owner>/<repo>`
  then `/plugin install <name>@<marketplace>`.
