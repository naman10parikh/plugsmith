#!/usr/bin/env node
/**
 * plugsmith/src/mcp-server.ts
 *
 * Minimal stdio MCP server that exposes two tools:
 *   - build_plugin   — scan a repo and emit .claude-plugin/ bundles
 *   - validate_manifest — parse + field-check an existing manifest.json
 *
 * Protocol: JSON-RPC 2.0 over stdin/stdout (MCP stdio transport).
 * Zero external deps — uses only node:fs, node:readline, and the existing builder.
 */

import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildPlugin } from "./builder.js";

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------

function send(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function ok(id: unknown, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function err(id: unknown, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// ---------------------------------------------------------------------------
// Tool: build_plugin
// ---------------------------------------------------------------------------

function handleBuildPlugin(
  id: unknown,
  params: Record<string, unknown>,
): void {
  const repoRoot = typeof params["repo_root"] === "string" ? params["repo_root"] : process.cwd();
  const dry = params["dry"] === true;

  try {
    const result = buildPlugin(path.resolve(repoRoot), dry);
    ok(id, {
      name: result.manifest.name,
      version: result.manifest.version,
      skillCount: result.marketplace.skillCount,
      commandCount: result.marketplace.commandCount,
      hookCount: result.marketplace.hookCount,
      mcpCount: result.marketplace.mcpCount,
      warnings: result.manifest.warnings,
      outputDir: result.outputDir,
      dry,
    });
  } catch (e) {
    err(id, -32000, e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// Tool: validate_manifest
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
  "schemaVersion",
  "name",
  "version",
  "description",
  "emittedAt",
  "repoRoot",
  "skills",
  "commands",
  "hooks",
  "mcpServers",
  "warnings",
] as const;

function handleValidateManifest(
  id: unknown,
  params: Record<string, unknown>,
): void {
  const manifestPath =
    typeof params["manifest_path"] === "string"
      ? path.resolve(params["manifest_path"])
      : path.resolve(process.cwd(), ".claude-plugin", "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    err(id, -32001, `manifest.json not found at: ${manifestPath}`);
    return;
  }

  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, "utf-8");
  } catch (e) {
    err(id, -32002, `Cannot read manifest: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    err(id, -32003, "manifest.json is not valid JSON");
    return;
  }

  const missing = REQUIRED_FIELDS.filter((f) => !(f in parsed));
  const issues: string[] = [];

  if (missing.length > 0) {
    issues.push(`Missing fields: ${missing.join(", ")}`);
  }
  if (parsed["schemaVersion"] !== "1.0.0") {
    issues.push(`Expected schemaVersion "1.0.0", got "${String(parsed["schemaVersion"])}"`);
  }

  const warnings = Array.isArray(parsed["warnings"]) ? (parsed["warnings"] as string[]) : [];

  ok(id, {
    valid: issues.length === 0,
    issues,
    manifestWarnings: warnings,
    name: parsed["name"],
    version: parsed["version"],
    skillCount: Array.isArray(parsed["skills"]) ? (parsed["skills"] as unknown[]).length : null,
    commandCount: Array.isArray(parsed["commands"]) ? (parsed["commands"] as unknown[]).length : null,
    hookCount: Array.isArray(parsed["hooks"]) ? (parsed["hooks"] as unknown[]).length : null,
    mcpCount: Array.isArray(parsed["mcpServers"]) ? (parsed["mcpServers"] as unknown[]).length : null,
  });
}

// ---------------------------------------------------------------------------
// Tools manifest (returned on initialize)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "build_plugin",
    description:
      "Scan a repo's harness surface (.claude/skills, hooks, .mcp.json) and emit .claude-plugin/manifest.json + marketplace.json.",
    inputSchema: {
      type: "object",
      properties: {
        repo_root: {
          type: "string",
          description: "Absolute path to the repo to scan. Defaults to cwd.",
        },
        dry: {
          type: "boolean",
          description: "If true, compute results without writing files.",
        },
      },
    },
  },
  {
    name: "validate_manifest",
    description:
      "Parse and field-check an existing .claude-plugin/manifest.json. Returns valid:true/false + issues[].",
    inputSchema: {
      type: "object",
      properties: {
        manifest_path: {
          type: "string",
          description:
            "Path to manifest.json. Defaults to <cwd>/.claude-plugin/manifest.json.",
        },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Main — stdio JSON-RPC loop
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  const { id, method, params } = msg;
  const p = (params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "initialize":
      ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "plugsmith", version: "0.1.0" },
      });
      break;

    case "tools/list":
      ok(id, { tools: TOOLS });
      break;

    case "tools/call": {
      const toolName = p["name"] as string | undefined;
      const toolArgs = (p["arguments"] ?? {}) as Record<string, unknown>;
      if (toolName === "build_plugin") {
        handleBuildPlugin(id, toolArgs);
      } else if (toolName === "validate_manifest") {
        handleValidateManifest(id, toolArgs);
      } else {
        err(id, -32601, `Unknown tool: ${String(toolName)}`);
      }
      break;
    }

    default:
      err(id, -32601, `Method not found: ${String(method)}`);
  }
});
