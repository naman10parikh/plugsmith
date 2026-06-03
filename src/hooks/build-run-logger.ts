#!/usr/bin/env node
/**
 * plugsmith/src/hooks/build-run-logger.ts
 *
 * PostToolUse hook (Bash matcher): reads stdin for plugsmith CLI output
 * patterns and logs structured entries to logs/build-runs.jsonl.
 *
 * Wired via .claude/settings.json PostToolUse → Bash matcher.
 * Called by Claude Code after every Bash tool execution.
 * Stdin: JSON payload from Claude Code with { tool_name, tool_input, tool_response }.
 *
 * This hook is additive-only: if stdin doesn't look like a plugsmith run,
 * it exits 0 immediately without side effects.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const LOG_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "logs",
);
const LOG_FILE = path.join(LOG_DIR, "build-runs.jsonl");

async function main(): Promise<void> {
  // Read stdin (Claude Code sends hook payload as JSON)
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) process.exit(0);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    process.exit(0); // Not JSON — not our hook
  }

  // Only act when the Bash output contains "[plugsmith] emitted"
  const response = String(payload["tool_response"] ?? payload["output"] ?? "");
  if (!response.includes("[plugsmith]")) process.exit(0);

  // Extract counts from CLI output lines
  const entry = {
    ts: new Date().toISOString(),
    source: "hook",
    output: response.slice(0, 500), // cap at 500 chars
  };

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Intentionally silent: hook must not fail the parent tool call
  }
}

main().catch(() => process.exit(0));
