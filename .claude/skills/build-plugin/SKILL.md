# build-plugin

> Scan a repo's harness surface and emit `.claude-plugin/manifest.json` + `marketplace.json`.

## Trigger

Use when the user says: "build plugin", "emit manifest", "scan repo", "package harness", "generate plugin bundle", or "run plugsmith on".

Triggers: build plugin, emit manifest, scan repo, package harness, generate plugin bundle, run plugsmith

## Steps

1. **Resolve the target repo path.**
   - If a path is given, use it verbatim.
   - If no path given, default to the current working directory.
   - Verify the path exists: `ls <path>/.claude/ 2>/dev/null || echo "no .claude dir"`.

2. **Run a dry scan first** to preview what will be emitted:
   ```bash
   node ~/plugsmith/dist/cli.js <path> --dry
   ```
   Read the output counts (skills, commands, hooks, mcp). If all are 0 and a warning fires, tell the user the repo has no discoverable harness surfaces and ask whether to proceed.

3. **Emit the manifest** (write files):
   ```bash
   node ~/plugsmith/dist/cli.js <path>
   ```

4. **Verify the output files** were written:
   ```bash
   cat <path>/.claude-plugin/manifest.json | python3 -m json.tool > /dev/null && echo "valid JSON"
   cat <path>/.claude-plugin/marketplace.json | python3 -m json.tool > /dev/null && echo "valid JSON"
   ```

5. **Report back** — show the user the skill/command/hook/mcp counts and the output path.

## Expected output

```
[plugsmith] emitted to <path>/.claude-plugin
  name:     <repo-name> @ <version>
  skills:   N
  commands: N
  hooks:    N
  mcp:      N
```

Two valid JSON files at `<path>/.claude-plugin/manifest.json` and `<path>/.claude-plugin/marketplace.json`.

## Model tier

Execution only — no planning needed. Sonnet is sufficient.
