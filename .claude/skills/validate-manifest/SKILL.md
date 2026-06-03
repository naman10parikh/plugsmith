# validate-manifest

> Validate an existing `.claude-plugin/manifest.json` against the plugsmith schema and report any issues.

## Trigger

Use when the user says: "validate manifest", "check manifest", "lint plugin", "verify plugin bundle", "is the manifest valid", or "manifest errors".

Triggers: validate manifest, check manifest, lint plugin, verify plugin bundle, manifest errors

## Steps

1. **Locate the manifest file.**
   - If a path is given, look for `<path>/.claude-plugin/manifest.json`.
   - If no path given, look in the current directory.
   - If the file does not exist: tell the user to run `/build-plugin` first.

2. **Parse JSON** — confirm it is valid JSON:
   ```bash
   python3 -m json.tool <path>/.claude-plugin/manifest.json > /dev/null && echo "JSON: OK"
   ```

3. **Check required top-level fields** — these must all be present and non-empty:
   - `schemaVersion` (must equal `"1.0.0"`)
   - `name` (non-empty string)
   - `version` (semver-like string)
   - `description` (string, may be empty but field must exist)
   - `emittedAt` (valid ISO timestamp)
   - `repoRoot` (string)
   - `skills`, `commands`, `hooks`, `mcpServers` (arrays)
   - `warnings` (array)

   Use a quick Node one-liner:
   ```bash
   node -e "
     const m = JSON.parse(require('fs').readFileSync('<path>/.claude-plugin/manifest.json','utf8'));
     const req = ['schemaVersion','name','version','description','emittedAt','repoRoot','skills','commands','hooks','mcpServers','warnings'];
     const missing = req.filter(k => !(k in m));
     if (missing.length) { console.error('MISSING:', missing.join(', ')); process.exit(1); }
     if (m.schemaVersion !== '1.0.0') { console.error('BAD schemaVersion:', m.schemaVersion); process.exit(1); }
     console.log('Schema: OK');
     console.log('skills:', m.skills.length, 'commands:', m.commands.length, 'hooks:', m.hooks.length, 'mcp:', m.mcpServers.length);
     if (m.warnings.length) console.warn('Warnings:', m.warnings.join('; '));
   "
   ```

4. **Report results.**
   - All OK: report counts and confirm the manifest is valid.
   - Errors found: list each error and tell the user to re-run `/build-plugin` to regenerate.

## Expected output

```
JSON: OK
Schema: OK
skills: 3  commands: 1  hooks: 2  mcp: 2
```

Or on error:
```
MISSING: mcpServers, warnings
```

## Model tier

Execution only. Sonnet is sufficient.
