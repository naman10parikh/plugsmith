/**
 * plugsmith/src/claude.ts
 *
 * Derive the two files Claude Code actually reads from a repository:
 *   .claude-plugin/plugin.json       the plugin manifest (only `name` is required)
 *   .claude-plugin/marketplace.json  a one-plugin marketplace, so the repo installs in one step
 *
 * Rules follow Claude Code's plugin and marketplace references (code.claude.com/docs/en/plugins-reference and
 * /plugins/marketplace-reference, read 2026-10-19): component paths start with `./`; `agents` and `commands`
 * replace their default folders, so the defaults are listed too when they exist; `skills` adds to `skills/`;
 * `hooks/hooks.json` and `.mcp.json` load by default and need no key.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ClaudePluginJson {
  name: string;
  version?: string;
  description?: string;
  author?: { name: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  skills?: string[];
  commands?: string[];
  agents?: string[];
}

export interface ClaudeMarketplaceJson {
  name: string;
  owner: { name: string; url?: string };
  description?: string;
  plugins: Array<{ name: string; source: string; description?: string }>;
}

/** Plugin and marketplace ids: letters, digits, ".", "_" and "-", starting with a letter or digit. */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Names Claude Code refuses for a plugin because they pass as Anthropic's own. */
export function reservedPluginName(name: string): "error" | "warning" | null {
  const n = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (/^(claude|anthropic|anthropics|cc-plugin)-/.test(n)) return "error";
  if (["claude", "anthropic", "anthropics", "claude-code", "claude-mods"].includes(n)) return "error";
  if (/(^|-)official-(claude|anthropic)|(claude|anthropic)-official($|-)/.test(n)) return "error";
  if (/(^|-)(claude|anthropic|anthropics)($|-)/.test(n)) return "warning";
  return null;
}

/** Marketplace names Claude Code reserves (official, community, directory and internal names). */
export const RESERVED_MARKETPLACE_NAMES = new Set([
  "claude-code-marketplace", "claude-code-plugins", "claude-plugins-official", "anthropic-marketplace",
  "anthropic-plugins", "agent-skills", "anthropic-agent-skills", "life-sciences", "knowledge-work-plugins",
  "claude-for-legal", "claude-for-financial-services", "financial-services-plugins", "first-party-plugins",
  "claude-tag-plugins", "claude-community", "claude-plugins-community", "healthcare",
  "anthropic-plugin-directory", "claude-plugin-directory", "inline", "builtin", "skills-dir", "synced",
  "claude-plugin-test", "npm", "pip", "uv", "cargo", "github", "gh",
]);

/** Turn a package or folder name into a plugin id: drop an npm scope, lowercase, kebab-case. */
export function toPluginName(raw: string): string {
  const base = raw.replace(/^@[^/]+\//, "").toLowerCase();
  return base.replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+/, "").replace(/-+$/, "") || "plugin";
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `author` from package.json, as a string ("Name <email> (url)") or an object. Email is left out on purpose. */
function author(pkg: Record<string, unknown> | null): { name: string; url?: string } | undefined {
  const a = pkg?.["author"];
  if (typeof a === "string") {
    const name = a.replace(/<[^>]*>/, "").replace(/\([^)]*\)/, "").trim();
    const url = a.match(/\((https?:\/\/[^)]+)\)/)?.[1];
    return name ? { name, ...(url ? { url } : {}) } : undefined;
  }
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    if (typeof o["name"] === "string" && o["name"]) {
      return { name: o["name"], ...(typeof o["url"] === "string" ? { url: o["url"] } : {}) };
    }
  }
  return undefined;
}

/** package.json `repository` (string or object) as a browsable https URL. */
function repositoryUrl(pkg: Record<string, unknown> | null): string | undefined {
  const r = pkg?.["repository"];
  const raw = typeof r === "string" ? r : r && typeof r === "object" ? (r as Record<string, unknown>)["url"] : undefined;
  if (typeof raw !== "string" || !raw) return undefined;
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw}`;
  return raw.replace(/^git\+/, "").replace(/^git:\/\//, "https://").replace(/\.git$/, "");
}

function isUrl(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

const mdFiles = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".md") && fs.statSync(path.join(dir, f)).isFile()).sort() : [];

const hasSkillDirs = (dir: string): boolean =>
  fs.existsSync(dir) && fs.readdirSync(dir).some((d) => fs.existsSync(path.join(dir, d, "SKILL.md")));

/** Derive plugin.json and marketplace.json for `root`, with warnings for anything Claude Code would mishandle. */
export function deriveClaudeFiles(root: string, fallbackDescription: string): {
  plugin: ClaudePluginJson;
  marketplace: ClaudeMarketplaceJson;
  warnings: string[];
} {
  const warnings: string[] = [];
  const pkg = readJson(path.join(root, "package.json"));
  const name = toPluginName(typeof pkg?.["name"] === "string" && pkg["name"] ? pkg["name"] : path.basename(root));
  const description = (typeof pkg?.["description"] === "string" && pkg["description"]) || fallbackDescription;
  const who = author(pkg);
  const repo = repositoryUrl(pkg);
  const homepage = isUrl(pkg?.["homepage"]) ? pkg["homepage"] : undefined;
  const license = typeof pkg?.["license"] === "string" && pkg["license"] !== "UNLICENSED" ? pkg["license"] : undefined;
  const keywords = Array.isArray(pkg?.["keywords"]) ? (pkg["keywords"] as unknown[]).filter((k): k is string => typeof k === "string") : undefined;

  const plugin: ClaudePluginJson = {
    name,
    ...(typeof pkg?.["version"] === "string" ? { version: pkg["version"] } : {}),
    ...(description ? { description } : {}),
    ...(who ? { author: who } : {}),
    ...(homepage ? { homepage } : {}),
    ...(repo ? { repository: repo } : {}),
    ...(license ? { license } : {}),
    ...(keywords && keywords.length ? { keywords } : {}),
  };

  // skills: `skills/` is scanned by default; `.claude/skills/` must be added
  if (hasSkillDirs(path.join(root, ".claude", "skills"))) plugin.skills = ["./.claude/skills/"];

  // commands and agents replace their default folders, so list the defaults too when both exist
  const dotCommands = mdFiles(path.join(root, ".claude", "commands"));
  if (dotCommands.length) {
    plugin.commands = ["./.claude/commands/", ...(fs.existsSync(path.join(root, "commands")) ? ["./commands/"] : [])];
  }
  const dotAgents = mdFiles(path.join(root, ".claude", "agents"));
  if (dotAgents.length) {
    plugin.agents = [
      ...dotAgents.map((f) => `./.claude/agents/${f}`),
      ...mdFiles(path.join(root, "agents")).map((f) => `./agents/${f}`),
    ];
  }

  // hooks: only hooks/hooks.json reaches a plugin; .claude/settings.json hooks stay with the project
  const hooksJson = path.join(root, "hooks", "hooks.json");
  if (fs.existsSync(hooksJson)) {
    const h = readJson(hooksJson);
    if (!h || typeof h["hooks"] !== "object") warnings.push('hooks/hooks.json needs a top-level "hooks" key, as in settings.json');
  } else if (readJson(path.join(root, ".claude", "settings.json"))?.["hooks"]) {
    warnings.push("hooks in .claude/settings.json do not ship with a plugin; copy them to hooks/hooks.json with ${CLAUDE_PLUGIN_ROOT} paths");
  }

  // .mcp.json loads with the plugin, so every server must work from any folder and need no secret
  const mcp = readJson(path.join(root, ".mcp.json"));
  const servers = (mcp?.["mcpServers"] ?? mcp?.["servers"] ?? {}) as Record<string, Record<string, unknown>>;
  for (const [server, cfg] of Object.entries(servers)) {
    const args = Array.isArray(cfg["args"]) ? (cfg["args"] as unknown[]).map(String) : [];
    const relative = args.find((a) => /^\.{0,2}\/?[\w.-]+\/[\w./-]*\.(m?js|cjs|ts|py)$/.test(a) && !a.startsWith("/") && !a.includes("${"));
    if (relative) warnings.push(`.mcp.json server "${server}" runs a relative path (${relative}); a plugin user's folder differs, so use "\${CLAUDE_PLUGIN_ROOT}/${relative.replace(/^\.\//, "")}" or an npx command`);
    if (cfg["env"] && Object.keys(cfg["env"] as object).length) warnings.push(`.mcp.json server "${server}" needs environment values; say so in the README, or move it to a dev-only config`);
  }

  const reserved = reservedPluginName(name);
  if (reserved) warnings.push(`plugin name "${name}" ${reserved === "error" ? "is reserved" : "reads as one of Anthropic's own"}; choose another name`);
  if (!who) warnings.push('no author in package.json; marketplace.json needs owner.name, so "unknown" was written: set "author" and rebuild');
  if (RESERVED_MARKETPLACE_NAMES.has(name)) warnings.push(`"${name}" is a reserved marketplace name; rename the plugin or edit marketplace.json`);

  const marketplace: ClaudeMarketplaceJson = {
    name,
    owner: who ?? { name: "unknown" },
    ...(description ? { description } : {}),
    plugins: [{ name, source: "./", ...(description ? { description } : {}) }],
  };
  return { plugin, marketplace, warnings };
}
