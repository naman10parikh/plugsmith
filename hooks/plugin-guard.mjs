#!/usr/bin/env node
// plugsmith plugin guard (PostToolUse on Write|Edit|MultiEdit).
// After an agent edits a plugin file (.claude-plugin/plugin.json or marketplace.json, hooks/hooks.json, .mcp.json),
// check the plugin the way Claude Code would and tell the agent what is wrong. On PostToolUse, exit code 2 shows
// stderr to the agent: the edit has already happened, so this is feedback, not a veto. Other files: exit 0.
// With plugsmith built (dist/), the full validator runs; without it (a plugin install), the guard still catches
// a file that is not valid JSON, which makes Claude Code skip the whole plugin or that part of it.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let file = "";
try {
  file = JSON.parse(readFileSync(0, "utf8") || "{}")?.tool_input?.file_path ?? "";
} catch {
  process.exit(0); // not a tool event; nothing to check
}
const norm = file.replace(/\\/g, "/");
const m = norm.match(/^(.*)\/(?:\.claude-plugin\/(?:plugin|marketplace)\.json|hooks\/hooks\.json|\.mcp\.json)$/);
if (!m || !existsSync(file)) process.exit(0);
const pluginRoot = m[1];

try {
  JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  process.stderr.write(`plugsmith: ${file} is not valid JSON, so Claude Code cannot load it: ${err.message}\n`);
  process.exit(2);
}

const validator = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "src", "validate.js");
if (!existsSync(validator) || !existsSync(join(pluginRoot, ".claude-plugin"))) process.exit(0);
const { validatePlugin } = await import(pathToFileURL(validator).href);
const r = validatePlugin(pluginRoot);
if (!r.ok) {
  process.stderr.write(
    `plugsmith: the plugin at ${pluginRoot} would not load cleanly:\n- ${r.errors.join("\n- ")}\n` +
      `Details: npx -y -p github:naman10parikh/plugsmith plugsmith validate ${pluginRoot} --claude\n`,
  );
  process.exit(2);
}
