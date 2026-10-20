#!/usr/bin/env node
/**
 * plugsmith/src/cli.ts
 *
 *   plugsmith [repoRoot] [--dry] [--force]     scan a repo and emit .claude-plugin/plugin.json + marketplace.json
 *   plugsmith validate [repoRoot] [--claude] [--sandbox=e2b]   check those files the way Claude Code does
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlugin } from "./builder.js";
import { validatePlugin } from "./validate.js";
import { validateInE2B } from "./sandbox.js";
import { recall } from "./recall.js";

const args = process.argv.slice(2);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const version = (JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")) as { version: string }).version;

const HELP = `plugsmith ${version} — turn any repository into a Claude Code plugin and marketplace

Usage:
  plugsmith [repo] [--dry] [--force]     write .claude-plugin/plugin.json, marketplace.json and manifest.json
                                         (an existing plugin.json or marketplace.json is kept without --force)
  plugsmith validate [repo] [--claude] [--sandbox=e2b]
                                         check plugin.json and marketplace.json the way Claude Code does;
                                         --claude also runs the real \`claude plugin validate\`;
                                         --sandbox=e2b runs it in a clean microVM on only the files git tracks
  plugsmith recall "<query>"             search plugsmith's own memory, lessons, skills and personas
  plugsmith --version | --help

Then, in Claude Code:  /plugin marketplace add <owner>/<repo>   and   /plugin install <name>@<name>
MCP server: plugsmith-mcp (build_plugin, validate_plugin, validate_manifest)`;

if (args.includes("--help") || args.includes("-h") || args[0] === "help") {
  console.log(HELP);
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  console.log(version);
  process.exit(0);
}

const positional = args.filter((a) => !a.startsWith("--"));

if (positional[0] === "recall") {
  const query = positional.slice(1).join(" ");
  const hits = query ? recall(query) : [];
  for (const h of hits) console.log(`### ${h.heading}  (${h.file})\n${h.snippet}\n`);
  if (query && hits.length === 0) console.log("no match");
  if (!query) console.error('usage: plugsmith recall "<query>"');
  process.exit(query ? 0 : 2);
}

if (positional[0] === "validate") {
  const repo = path.resolve(positional[1] ?? ".");
  const r = validatePlugin(repo, { withClaude: args.includes("--claude") });
  console.log(`[plugsmith] ${r.ok ? "valid" : "INVALID"}: ${repo}`);
  for (const e of r.errors) console.log(`  ✗ ${e}`);
  for (const w of r.warnings) console.log(`  ⚠ ${w}`);
  if (r.claude) console.log(`  claude plugin validate: ${!r.claude.ran ? "not run (claude not on PATH)" : r.claude.ok ? "passed" : "FAILED"}`);
  if (args.includes("--sandbox=e2b")) {
    void validateInE2B(repo).then((c) => {
      console.log(`  clean room (E2B, ${c.files} tracked files${c.coldStartMs ? `, microVM up in ${c.coldStartMs} ms` : ""}): ${c.ok ? "passed" : "FAILED"}`);
      if (c.error) console.log(`    ${c.error}`);
      if (!c.ok && c.output) console.log(c.output.split("\n").map((l) => `    ${l}`).join("\n"));
      process.exit(r.ok && c.ok ? 0 : 1);
    });
  } else {
    process.exit(r.ok && (!r.claude?.ran || r.claude.ok) ? 0 : 1);
  }
} else {
  const repoRoot = path.resolve(positional[0] ?? ".");
  try {
    const { manifest, marketplace, claude, outputDir } = buildPlugin(repoRoot, { dry: args.includes("--dry"), force: args.includes("--force") });

    if (args.includes("--dry")) {
      console.log("[plugsmith] dry run — no files written");
    } else {
      console.log(`[plugsmith] ${outputDir}: wrote ${claude.written.join(", ") || "nothing"}${claude.kept.length ? `; kept ${claude.kept.join(", ")} (use --force to replace)` : ""}`);
    }

    console.log(`  name:     ${claude.plugin.name} @ ${claude.plugin.version ?? "unversioned"}`);
    console.log(`  skills:   ${marketplace.skillCount}`);
    console.log(`  commands: ${marketplace.commandCount}`);
    console.log(`  agents:   ${claude.plugin.agents?.length ?? 0} listed in plugin.json`);
    console.log(`  hooks:    ${marketplace.hookCount}`);
    console.log(`  mcp:      ${marketplace.mcpCount}`);

    if (manifest.warnings.length > 0) {
      console.warn("\n[plugsmith] warnings:");
      for (const w of manifest.warnings) console.warn(`  ⚠  ${w}`);
    }
    if (!args.includes("--dry")) {
      const check = validatePlugin(repoRoot);
      console.log(`\n[plugsmith] check: ${check.ok ? "valid" : "INVALID"}${check.errors.length ? `\n  ✗ ${check.errors.join("\n  ✗ ")}` : ""}`);
      if (!check.ok) process.exit(1);
    }
  } catch (err) {
    console.error("[plugsmith] error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
