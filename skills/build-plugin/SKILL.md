---
name: build-plugin
description: Turn a repository into a Claude Code plugin with a one-plugin marketplace, by scanning its skills, commands, agents, hooks and .mcp.json and writing .claude-plugin/plugin.json and marketplace.json. Use when asked to package a repo as a plugin, make it installable with /plugin, or refresh a plugin.json after adding skills or agents.
---

# build-plugin

## Trigger

Use when the user says: "build plugin", "make this a plugin", "package harness", "emit plugin.json",
"make it installable", or "run plugsmith on".

## Steps

1. **Resolve the target repo path.** If a path is given, use it; otherwise use the current folder.

2. **Run a dry scan first** to preview what will be emitted:
   ```bash
   npx -y -p github:naman10parikh/plugsmith plugsmith <path> --dry
   ```
   Read the counts (skills, commands, agents, hooks, mcp) and the warnings. All zeros means the repo has
   no harness surfaces; say so before writing anything.

3. **Write the files:**
   ```bash
   npx -y -p github:naman10parikh/plugsmith plugsmith <path>
   ```
   It writes `.claude-plugin/plugin.json` (what Claude Code reads), `marketplace.json` (one plugin,
   `"source": "./"`) and `manifest.json` (plugsmith's inventory, for catalogs). An existing `plugin.json` or
   `marketplace.json` is kept; pass `--force` to replace it.

4. **Act on the warnings.** The common ones: a `.mcp.json` server that runs a relative path (use
   `${CLAUDE_PLUGIN_ROOT}/...` or an npx command), hooks that live only in `.claude/settings.json` (copy them
   to `hooks/hooks.json`), a missing `author`, or a name that reads as Anthropic's own.

5. **Validate** with the `validate-plugin` skill, then tell the user the install lines:
   ```
   /plugin marketplace add <owner>/<repo>
   /plugin install <name>@<name>
   ```

## Output

```
[plugsmith] <path>/.claude-plugin: wrote manifest.json, plugin.json, marketplace.json
  name:     <name> @ <version>
  skills:   N
  commands: N
  agents:   N listed in plugin.json
  hooks:    N
  mcp:      N

[plugsmith] check: valid
```
