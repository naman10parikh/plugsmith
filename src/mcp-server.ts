#!/usr/bin/env node
/**
 * plugsmith/src/mcp-server.ts
 *
 * Minimal stdio MCP server that exposes three tools:
 *   - build_plugin      — scan a repo and emit .claude-plugin/plugin.json, marketplace.json and manifest.json
 *   - validate_plugin   — check plugin.json + marketplace.json the way Claude Code does
 *   - validate_manifest — parse + field-check plugsmith's inventory (manifest.json)
 *
 * Protocol: JSON-RPC 2.0 over stdin/stdout (MCP stdio transport).
 * Zero external deps — uses only node:fs, node:readline, and the existing builder.
 */

import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildPlugin } from "./builder.js";
import { validatePlugin } from "./validate.js";
import { appendRunLog } from "./run-log.js";

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

/** MCP tool results travel as text content; the JSON is pretty-printed inside it. */
function toolResult(id: unknown, data: unknown, isError = false): void {
  ok(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], ...(isError ? { isError: true } : {}) });
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
  const force = params["force"] === true;

  try {
    const result = buildPlugin(path.resolve(repoRoot), { dry, force });
    appendRunLog("mcp-build", { dry, force, written: result.claude.written });
    toolResult(id, {
      name: result.claude.plugin.name,
      version: result.manifest.version,
      written: result.claude.written,
      kept: result.claude.kept,
      plugin: result.claude.plugin,
      marketplace: result.claude.marketplace,
      skillCount: result.marketplace.skillCount,
      commandCount: result.marketplace.commandCount,
      hookCount: result.marketplace.hookCount,
      mcpCount: result.marketplace.mcpCount,
      warnings: result.manifest.warnings,
      outputDir: result.outputDir,
      dry,
    });
  } catch (e) {
    toolResult(id, { error: e instanceof Error ? e.message : String(e) }, true);
  }
}

// ---------------------------------------------------------------------------
// Tool: validate_plugin
// ---------------------------------------------------------------------------

function handleValidatePlugin(id: unknown, params: Record<string, unknown>): void {
  const repoRoot = typeof params["repo_root"] === "string" ? params["repo_root"] : process.cwd();
  const result = validatePlugin(path.resolve(repoRoot), { withClaude: params["with_claude"] === true });
  appendRunLog("mcp-validate", { ok: result.ok, errors: result.errors.length });
  toolResult(id, result);
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

  toolResult(id, {
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
      "Turn a repo into a Claude Code plugin: scan its skills, commands, agents, hooks and .mcp.json and write .claude-plugin/plugin.json, a one-plugin marketplace.json and plugsmith's manifest.json inventory. An existing plugin.json or marketplace.json is kept unless force is true.",
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
        force: {
          type: "boolean",
          description: "If true, replace an existing plugin.json and marketplace.json.",
        },
      },
    },
  },
  {
    name: "validate_plugin",
    description:
      "Check a repo's .claude-plugin/plugin.json and marketplace.json the way Claude Code does: required fields, reserved names, ./ component paths that exist, .md agent files, a valid marketplace entry. with_claude also runs the real `claude plugin validate`.",
    inputSchema: {
      type: "object",
      properties: {
        repo_root: { type: "string", description: "Path to the repo. Defaults to cwd." },
        with_claude: { type: "boolean", description: "Also run `claude plugin validate` when it is on PATH." },
      },
    },
  },
  {
    name: "validate_manifest",
    description:
      "Parse and field-check plugsmith's inventory, .claude-plugin/manifest.json (Claude Code ignores this file; use validate_plugin for what it reads). Returns valid:true/false + issues[].",
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
  if (id === undefined || id === null) return; // a notification: nothing to answer

  switch (method) {
    case "initialize":
      ok(id, {
        protocolVersion: "2025-06-18",
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
      } else if (toolName === "validate_plugin") {
        handleValidatePlugin(id, toolArgs);
      } else if (toolName === "validate_manifest") {
        handleValidateManifest(id, toolArgs);
      } else {
        err(id, -32601, `Unknown tool: ${String(toolName)}`);
      }
      break;
    }

    case "ping":
      ok(id, {});
      break;

    default:
      err(id, -32601, `Method not found: ${String(method)}`);
  }
});
