#!/usr/bin/env node
/**
 * plugsmith/src/cli.ts
 *
 * Minimal CLI: plugsmith <repoRoot> [--dry]
 * Scans a repo and emits .claude-plugin/manifest.json + marketplace.json.
 */

import { buildPlugin } from "./builder.js";
import * as path from "node:path";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const repoArg = args.filter((a) => !a.startsWith("--"))[0];
const repoRoot = repoArg ? path.resolve(repoArg) : process.cwd();

try {
  const { manifest, marketplace, outputDir } = buildPlugin(repoRoot, dry);

  if (dry) {
    console.log("[plugsmith] dry run — no files written");
  } else {
    console.log(`[plugsmith] emitted to ${outputDir}`);
  }

  console.log(`  name:     ${manifest.name} @ ${manifest.version}`);
  console.log(`  skills:   ${marketplace.skillCount}`);
  console.log(`  commands: ${marketplace.commandCount}`);
  console.log(`  hooks:    ${marketplace.hookCount}`);
  console.log(`  mcp:      ${marketplace.mcpCount}`);

  if (manifest.warnings.length > 0) {
    console.warn("\n[plugsmith] warnings:");
    for (const w of manifest.warnings) console.warn(`  ⚠  ${w}`);
  }
} catch (err) {
  console.error("[plugsmith] error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
