/**
 * plugsmith/src/run-log.ts
 *
 * Zero-dep observability: append a JSONL entry to logs/build-runs.jsonl
 * every time buildPlugin() completes.
 *
 * Format (one JSON object per line):
 *   { ts, repoRoot, name, version, skillCount, commandCount, hookCount, mcpCount, warnings, dry, durationMs }
 *
 * Usage:
 *   import { logBuildRun } from "./run-log.js";
 *   logBuildRun({ repoRoot, manifest, marketplace, dry, durationMs });
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginManifest, MarketplaceEntry } from "./types.js";

/** Directory where the log file lives: logs/ at the package root (from src/ or from dist/src/). */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = fs.existsSync(path.resolve(HERE, "..", "package.json"))
  ? path.resolve(HERE, "..", "logs")
  : path.resolve(HERE, "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "build-runs.jsonl");

export interface BuildRunEntry {
  ts: string;
  repoRoot: string;
  name: string;
  version: string;
  skillCount: number;
  commandCount: number;
  hookCount: number;
  mcpCount: number;
  warnings: string[];
  dry: boolean;
  durationMs: number;
}

/**
 * Append one JSONL line to logs/build-runs.jsonl.
 *
 * Silently no-ops if the logs/ directory cannot be created or the file
 * cannot be written — observability must never break the main flow.
 */
export function logBuildRun(opts: {
  repoRoot: string;
  manifest: PluginManifest;
  marketplace: MarketplaceEntry;
  dry: boolean;
  durationMs: number;
}): void {
  const entry: BuildRunEntry = {
    ts: new Date().toISOString(),
    repoRoot: opts.repoRoot,
    name: opts.manifest.name,
    version: opts.manifest.version,
    skillCount: opts.marketplace.skillCount,
    commandCount: opts.marketplace.commandCount,
    hookCount: opts.marketplace.hookCount,
    mcpCount: opts.marketplace.mcpCount,
    warnings: opts.manifest.warnings,
    dry: opts.dry,
    durationMs: opts.durationMs,
  };

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch {
    // Intentionally silent: observability must not break the build flow
  }
}

/**
 * Read and return all entries from the run log (most recent last).
 * Returns [] if the log file does not exist yet.
 */
export function readBuildLog(): BuildRunEntry[] {
  if (!fs.existsSync(LOG_FILE)) return [];
  try {
    const raw = fs.readFileSync(LOG_FILE, "utf-8");
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as BuildRunEntry);
  } catch {
    return [];
  }
}

/**
 * Append one generic JSONL line (op + fields) to logs/build-runs.jsonl, for MCP calls and the hook.
 * Never throws.
 */
export function appendRunLog(op: string, fields: Record<string, unknown>): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify({ ts: new Date().toISOString(), op, ...fields }) + "\n", "utf-8");
  } catch {
    // Intentionally silent: observability must not break the caller
  }
}
