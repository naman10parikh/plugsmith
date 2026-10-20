---
name: plugin-doctor
description: Diagnose why a Claude Code plugin does not load or loads only partly (missing agents, commands that vanished, an MCP server that will not start, hooks that never fire) and give one fix per finding. Use when /plugin shows errors, when a component of an installed plugin is missing, or before shipping a plugin built by hand.
---

# plugin-doctor

## Trigger

Use when the user says: "my plugin doesn't load", "the agents are missing", "the commands disappeared",
"plugin MCP server fails", "plugin hooks don't run", or reports a `/plugin` Errors tab message.

## Steps

1. **Validate first** (static, then Claude Code's own check):
   ```bash
   npx -y -p github:naman10parikh/plugsmith plugsmith validate <path> --claude
   ```

2. **Check the known traps,** one by one:
   - **Only `manifest.json`**: Claude Code reads `.claude-plugin/plugin.json`. Rebuild with `plugsmith <path>`.
   - **Agents missing**: `agents` replaces the default `agents/` folder and takes `.md` files only. Agents in
     `.claude/agents/` must be listed one by one (`"./.claude/agents/reviewer.md"`).
   - **Commands vanished**: `commands` replaces the default `commands/` folder; list `./commands/` too.
   - **Skills missing**: skills load from `skills/<name>/SKILL.md`; `.claude/skills/` needs
     `"skills": ["./.claude/skills/"]`.
   - **Hooks never fire**: `hooks/hooks.json` needs a top-level `"hooks"` key, and paths use
     `${CLAUDE_PLUGIN_ROOT}`. Hooks in `.claude/settings.json` do not ship with a plugin.
   - **MCP server fails to start**: a relative path such as `dist/server.js` resolves from the user's folder,
     not the plugin's. Use `${CLAUDE_PLUGIN_ROOT}/dist/server.js` (and commit `dist/`) or an `npx` command.
   - **Name refused**: names that start with `claude-` or `anthropic-` are reserved; marketplace names such as
     `agent-skills` or `github` are reserved too.

3. **Prove the fix in a clean room** when files might be missing from git:
   ```bash
   npx -y -p github:naman10parikh/plugsmith plugsmith validate <path> --sandbox=e2b
   ```

## Output

```
## Plugin doctor: <name>

| Finding | Why it breaks | Fix |
|---------|---------------|-----|
| agents in .claude/agents/ not listed | the default agents/ folder is empty | add "agents": ["./.claude/agents/x.md"] |

Verdict: loads fully / loads partly / does not load
```
