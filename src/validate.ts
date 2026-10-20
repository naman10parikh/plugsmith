/**
 * plugsmith/src/validate.ts
 *
 * Check a repository's .claude-plugin/plugin.json and marketplace.json the way Claude Code would, without
 * Claude Code: required fields, plugin and marketplace names, `./` component paths that exist inside the
 * plugin, agent files ending in .md, skill entries that are folders, and a one-plugin marketplace entry.
 * With `withClaude`, it also runs the real `claude plugin validate` (read-only) and reports its verdict.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { ID_PATTERN, RESERVED_MARKETPLACE_NAMES, reservedPluginName } from "./claude.js";

/** The top-level plugin.json keys Claude Code documents. Kept current by scripts/field-drift.mjs. */
export const KNOWN_PLUGIN_FIELDS = [
  "$schema", "name", "displayName", "version", "description", "author", "homepage", "repository", "license",
  "keywords", "metadata", "icon", "documentationUrl", "supportUrl", "privacyPolicyUrl", "termsOfServiceUrl",
  "defaultEnabled", "dependencies", "settings", "userConfig", "types", "channels", "skills", "commands", "agents",
  "hooks", "mcpServers", "lspServers", "outputStyles", "workflows", "experimental",
];

export interface PluginCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** The real `claude plugin validate` verdict, when it was run. */
  claude?: { ran: boolean; ok: boolean; output: string };
}

function read(file: string, errors: string[]): Record<string, unknown> | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch (e) {
    errors.push(`${path.basename(file)} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function checkPaths(root: string, key: string, value: unknown, errors: string[]): void {
  if (value === undefined || (typeof value === "object" && value !== null && !Array.isArray(value))) return; // inline config
  const list = Array.isArray(value) ? value : [value];
  for (const p of list) {
    if (typeof p !== "string") continue;
    if (key === "skills" && (p === "." || p === "./")) continue;
    if (!p.startsWith("./")) {
      errors.push(`${key}: "${p}" must start with "./"`);
      continue;
    }
    if (p.split("/").includes("..")) {
      errors.push(`${key}: "${p}" contains ".."`);
      continue;
    }
    const abs = path.join(root, p);
    if (!fs.existsSync(abs)) {
      errors.push(`${key}: path not found: ${p}`);
      continue;
    }
    if (key === "agents" && !p.endsWith(".md")) errors.push(`agents: "${p}" must be an .md file (folders are not accepted)`);
    if (key === "skills" && !fs.statSync(abs).isDirectory()) errors.push(`skills: "${p}" must be a folder`);
  }
}

/** Validate `<root>/.claude-plugin/plugin.json` and `marketplace.json`. */
export function validatePlugin(root: string, opts: { withClaude?: boolean } = {}): PluginCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dir = path.join(root, ".claude-plugin");
  const plugin = read(path.join(dir, "plugin.json"), errors);
  const market = read(path.join(dir, "marketplace.json"), errors);

  if (!plugin && !fs.existsSync(path.join(dir, "plugin.json"))) {
    errors.push(".claude-plugin/plugin.json is missing (Claude Code reads only this file; manifest.json is not enough)");
  }
  if (plugin) {
    const name = plugin["name"];
    if (typeof name !== "string" || !name) errors.push("plugin.json: name is required");
    else {
      if (/[\s@:/\\]/.test(name)) errors.push(`plugin.json: name "${name}" may not contain spaces, @, : or path separators`);
      const reserved = reservedPluginName(name);
      if (reserved === "error") errors.push(`plugin.json: name "${name}" is reserved: it passes as one of Anthropic's own`);
      if (reserved === "warning") warnings.push(`plugin.json: name "${name}" reads as one of Anthropic's own`);
    }
    const a = plugin["author"];
    if (a !== undefined && (typeof a !== "object" || a === null || typeof (a as Record<string, unknown>)["name"] !== "string")) {
      errors.push("plugin.json: author must be an object with a name");
    }
    if (a === undefined) warnings.push("plugin.json: no author");
    if (plugin["homepage"] !== undefined) {
      try {
        new URL(String(plugin["homepage"]));
      } catch {
        errors.push("plugin.json: homepage must be a URL, or the plugin fails to load");
      }
    }
    for (const key of ["skills", "commands", "agents", "hooks", "mcpServers", "outputStyles"]) checkPaths(root, key, plugin[key], errors);
    for (const key of Object.keys(plugin)) {
      if (!KNOWN_PLUGIN_FIELDS.includes(key)) warnings.push(`plugin.json: unknown field '${key}'; Claude Code ignores it`);
    }
  }

  if (market) {
    const name = market["name"];
    if (typeof name !== "string" || !name) errors.push("marketplace.json: name is required");
    else {
      if (!ID_PATTERN.test(name)) errors.push(`marketplace.json: name "${name}" may use only letters, digits, ".", "_" and "-", starting with a letter or digit`);
      if (RESERVED_MARKETPLACE_NAMES.has(name.toLowerCase())) errors.push(`marketplace.json: "${name}" is a reserved marketplace name`);
    }
    const owner = market["owner"] as Record<string, unknown> | undefined;
    if (!owner || typeof owner["name"] !== "string" || !owner["name"]) errors.push("marketplace.json: owner.name is required");
    if (!market["description"]) warnings.push("marketplace.json: no description");
    const plugins = market["plugins"];
    if (!Array.isArray(plugins)) errors.push("marketplace.json: plugins must be an array");
    else {
      if (plugins.length === 0) warnings.push("marketplace.json: no plugins defined");
      const seen = new Set<string>();
      plugins.forEach((p: Record<string, unknown>, i: number) => {
        const pn = p?.["name"];
        if (typeof pn !== "string" || !ID_PATTERN.test(pn)) errors.push(`marketplace.json: plugins[${i}].name is missing or not a valid id`);
        else if (seen.has(pn)) errors.push(`marketplace.json: duplicate plugin name "${pn}"`);
        else seen.add(pn);
        const src = p?.["source"];
        if (src === undefined) errors.push(`marketplace.json: plugins[${i}].source is required`);
        else if (typeof src === "string" && !src.startsWith("./")) errors.push(`marketplace.json: plugins[${i}].source "${src}" must start with "./"`);
        else if (typeof src === "string" && src.split("/").includes("..")) errors.push(`marketplace.json: plugins[${i}].source contains ".."`);
      });
    }
  }

  const result: PluginCheck = { ok: errors.length === 0, errors, warnings };
  if (opts.withClaude) {
    const r = spawnSync("claude", ["plugin", "validate", root], { encoding: "utf-8", timeout: 60_000 });
    const ran = r.error === undefined;
    result.claude = { ran, ok: ran && r.status === 0, output: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-12).join("\n") };
  }
  return result;
}
