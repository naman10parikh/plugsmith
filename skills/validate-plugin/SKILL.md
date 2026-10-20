---
name: validate-plugin
description: Check a repository's .claude-plugin/plugin.json and marketplace.json the way Claude Code does, and optionally with the real `claude plugin validate`, locally or in a clean E2B microVM that sees only the files git tracks. Use after building or editing a plugin, before telling anyone to install it, or when /plugin reports an error.
---

# validate-plugin

## Trigger

Use when the user says: "validate plugin", "check plugin.json", "lint plugin", "is this plugin valid",
"why won't my plugin load", or after the `build-plugin` skill.

## Steps

1. **Static check** (fast, no Claude Code needed):
   ```bash
   npx -y -p github:naman10parikh/plugsmith plugsmith validate <path>
   ```
   It checks: `plugin.json` exists (an old `manifest.json` alone is not enough) with a valid, non-reserved
   `name`; every component path starts with `./`, stays inside the plugin and exists; `agents` entries are
   `.md` files and `skills` entries are folders; `marketplace.json` has `name`, `owner.name` and plugin
   entries with a valid `name` and a `./` source.

2. **Ground truth.** Add `--claude` to also run Claude Code's own `claude plugin validate` (read-only):
   ```bash
   npx -y -p github:naman10parikh/plugsmith plugsmith validate <path> --claude
   ```

3. **Clean room.** Add `--sandbox=e2b` (needs `E2B_API_KEY`) to upload only the files git tracks to a fresh
   microVM, install Claude Code there and validate that copy. A plugin that relies on an ignored `dist/` or an
   untracked script fails here even though it passes on your machine.

4. **Report** each error with its fix. A root `CLAUDE.md` warning is expected: Claude Code does not load a
   plugin's root `CLAUDE.md` as context.

## Output

```
[plugsmith] valid: <path>
  ⚠ plugin.json: no author
  claude plugin validate: passed
  clean room (E2B, 42 tracked files, microVM up in 410 ms): passed
```

Plugsmith's own inventory (`manifest.json`) is checked by the `validate_manifest` MCP tool; Claude Code
ignores that file.
