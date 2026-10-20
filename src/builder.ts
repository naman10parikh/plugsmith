/**
 * plugsmith/src/builder.ts
 *
 * THE core owned artifact — scans a repo's harness surfaces and emits, into <repoRoot>/.claude-plugin/:
 *   plugin.json       the manifest Claude Code reads (derived in claude.ts)
 *   marketplace.json  a one-plugin marketplace, so `/plugin marketplace add <owner>/<repo>` works
 *   manifest.json     plugsmith's inventory of every surface, for catalogs (Claude Code ignores it)
 * An existing plugin.json or marketplace.json is kept unless `force` is set.
 *
 * No LLM calls, no network. Paths in the output are relative to the repo, never absolute.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  PluginManifest,
  MarketplaceEntry,
  PluginSkill,
  PluginCommand,
  PluginHook,
  PluginMcp,
} from "./types.js";
import { logBuildRun } from "./run-log.js";
import { deriveClaudeFiles, type ClaudeMarketplaceJson, type ClaudePluginJson } from "./claude.js";

/** A repo-relative path with the `./` prefix Claude Code expects. */
function rel(root: string, abs: string): string {
  return "./" + path.relative(root, abs).split(path.sep).join("/");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read first non-empty line from a file, or "" if the file doesn't exist. */
function firstLine(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.replace(/^#+\s*/, "").trim();
      if (trimmed.length > 0) return trimmed;
    }
    return "";
  } catch {
    return "";
  }
}

/** Extract the description line from a SKILL.md — looks for a line starting with `>` */
function extractSkillDescription(skillMd: string): string {
  try {
    const content = fs.readFileSync(skillMd, "utf-8");
    for (const line of content.split("\n")) {
      const m = line.match(/^>\s*(.+)/);
      if (m?.[1]) return m[1].trim();
    }
    // Fallback: first non-heading non-empty line
    for (const line of content.split("\n")) {
      const trimmed = line.replace(/^#+\s*/, "").trim();
      if (trimmed.length > 0 && !trimmed.startsWith("#")) return trimmed;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Extract trigger keywords from SKILL.md.
 * Looks for a "Triggers:" or "trigger:" section or inline trigger: lines.
 */
function extractTriggers(skillMd: string): string[] {
  const triggers: string[] = [];
  try {
    const content = fs.readFileSync(skillMd, "utf-8");
    for (const line of content.split("\n")) {
      const lower = line.toLowerCase();
      // Pattern: "- trigger: foo, bar" or "trigger: foo, bar"
      const m = lower.match(/triggers?:\s*(.+)/);
      if (m?.[1]) {
        triggers.push(
          ...m[1]
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter((t) => t.length > 0 && t.length < 60),
        );
      }
    }
  } catch {
    // Intentionally silent: no SKILL.md is normal for older skills
  }
  return [...new Set(triggers)];
}

/** Map a hook filename to its type. */
function inferHookType(name: string): PluginHook["type"] {
  const lower = name.toLowerCase();
  if (lower.includes("pre-compact")) return "pre-compact";
  if (lower.includes("post-compact")) return "post-compact";
  if (lower.includes("pre-commit")) return "pre-commit";
  if (lower.includes("post-commit")) return "post-commit";
  if (lower.includes("session-start") || lower.includes("sessionstart")) return "session-start";
  if (lower.includes("session-stop") || lower.includes("stop")) return "session-stop";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Scanners (each returns discovered items + optional warnings)
// ---------------------------------------------------------------------------

function scanSkills(
  repoRoot: string,
  warnings: string[],
): PluginSkill[] {
  return [path.join(repoRoot, "skills"), path.join(repoRoot, ".claude", "skills")].flatMap((dir) =>
    scanSkillDir(repoRoot, dir, warnings),
  );
}

function scanSkillDir(
  repoRoot: string,
  skillsDir: string,
  warnings: string[],
): PluginSkill[] {
  if (!fs.existsSync(skillsDir)) return [];

  const skills: PluginSkill[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(skillsDir);
  } catch {
    warnings.push(`Could not read ${rel(repoRoot, skillsDir)} — permission denied`);
    return [];
  }

  for (const entry of entries) {
    const skillPath = path.join(skillsDir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(skillPath);
    } catch {
      continue;
    }

    if (!stat.isDirectory()) continue;

    // Look for SKILL.md or README.md
    const skillMd =
      fs.existsSync(path.join(skillPath, "SKILL.md"))
        ? path.join(skillPath, "SKILL.md")
        : fs.existsSync(path.join(skillPath, "README.md"))
          ? path.join(skillPath, "README.md")
          : null;

    const description = skillMd ? extractSkillDescription(skillMd) : "";
    const triggers = skillMd ? extractTriggers(skillMd) : [];

    if (!skillMd) continue; // a folder with neither SKILL.md nor README.md is not a skill

    skills.push({
      name: entry,
      path: rel(repoRoot, skillPath),
      description,
      triggers,
    });
  }

  return skills;
}

function scanCommands(
  repoRoot: string,
  warnings: string[],
): PluginCommand[] {
  const commandsDir = path.join(repoRoot, ".claude", "commands");
  if (!fs.existsSync(commandsDir)) return [];

  const commands: PluginCommand[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(commandsDir);
  } catch {
    warnings.push(`Could not read .claude/commands/ — permission denied`);
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const cmdPath = path.join(commandsDir, entry);
    const name = entry.replace(/\.md$/, "");
    const description = firstLine(cmdPath);
    commands.push({ name, path: rel(repoRoot, cmdPath), description });
  }

  return commands;
}

function scanHooks(
  repoRoot: string,
  _warnings: string[],
): PluginHook[] {
  const hooksDir = path.join(repoRoot, "hooks");
  if (!fs.existsSync(hooksDir)) return [];

  const hooks: PluginHook[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(hooksDir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!/\.(sh|js|mjs|cjs|ts)$/.test(entry)) continue;
    const hookPath = path.join(hooksDir, entry);
    hooks.push({
      name: entry,
      path: rel(repoRoot, hookPath),
      type: inferHookType(entry),
    });
  }

  return hooks;
}

function scanMcp(
  repoRoot: string,
  warnings: string[],
): PluginMcp[] {
  const mcpPath = path.join(repoRoot, ".mcp.json");
  if (!fs.existsSync(mcpPath)) return [];

  let raw: string;
  try {
    raw = fs.readFileSync(mcpPath, "utf-8");
  } catch {
    warnings.push(".mcp.json exists but could not be read");
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(".mcp.json is not valid JSON");
    return [];
  }

  const mcpServers: PluginMcp[] = [];
  const root = parsed as Record<string, unknown>;

  // Support both { servers: { name: {...} } } and { mcpServers: { name: {...} } } layouts
  const serversMap =
    (root["servers"] as Record<string, unknown> | undefined) ??
    (root["mcpServers"] as Record<string, unknown> | undefined) ??
    {};

  for (const [name, cfg] of Object.entries(serversMap)) {
    const c = cfg as Record<string, unknown>;
    mcpServers.push({
      name,
      command: typeof c["command"] === "string" ? c["command"] : undefined,
      args: Array.isArray(c["args"]) ? (c["args"] as string[]) : undefined,
    });
  }

  return mcpServers;
}

// ---------------------------------------------------------------------------
// Repo name + description helpers
// ---------------------------------------------------------------------------

function repoName(repoRoot: string): string {
  // Try package.json "name" field first
  const pkgPath = path.join(repoRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      if (typeof pkg["name"] === "string" && (pkg["name"] as string).length > 0) {
        return pkg["name"] as string;
      }
    } catch {
      // Intentionally silent
    }
  }
  // Fall back to directory name
  return path.basename(repoRoot);
}

function repoDescription(repoRoot: string): string {
  // Try package.json "description" first
  const pkgPath = path.join(repoRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      if (typeof pkg["description"] === "string" && (pkg["description"] as string).length > 0) {
        return pkg["description"] as string;
      }
    } catch {
      // Intentionally silent
    }
  }
  // Fall back to first line of README.md
  const readmePath = path.join(repoRoot, "README.md");
  if (fs.existsSync(readmePath)) return firstLine(readmePath);
  return "";
}

function repoVersion(repoRoot: string): string {
  const pkgPath = path.join(repoRoot, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      if (typeof pkg["version"] === "string") return pkg["version"] as string;
    } catch {
      // Intentionally silent
    }
  }
  return "0.1.0";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ScanResult {
  /** plugsmith's inventory (written as manifest.json). */
  manifest: PluginManifest;
  /** Catalog envelope: counts plus the inventory (returned, not written). */
  marketplace: MarketplaceEntry;
  /** What Claude Code reads, and which of the two files were written or kept. */
  claude: { plugin: ClaudePluginJson; marketplace: ClaudeMarketplaceJson; written: string[]; kept: string[] };
  outputDir: string;
}

export interface BuildOptions {
  /** Compute and return results without writing files. */
  dry?: boolean;
  /** Replace an existing plugin.json and marketplace.json. */
  force?: boolean;
}

/**
 * Scan `repoRoot` and emit .claude-plugin/plugin.json, marketplace.json and manifest.json.
 *
 * @param repoRoot - Path to the repo to scan.
 * @param options  - `true` (dry run, the old signature) or { dry, force }.
 * @returns The inventory, the catalog envelope, the Claude Code files, and the output directory.
 */
export function buildPlugin(repoRoot: string, options: boolean | BuildOptions = false): ScanResult {
  const { dry = false, force = false } = typeof options === "boolean" ? { dry: options } : options;
  const absRoot = path.resolve(repoRoot);
  const startMs = Date.now();

  if (!fs.existsSync(absRoot)) {
    throw new Error(`repoRoot does not exist: ${absRoot}`);
  }

  const warnings: string[] = [];

  // Scan all harness surfaces
  const skills = scanSkills(absRoot, warnings);
  const commands = scanCommands(absRoot, warnings);
  const hooks = scanHooks(absRoot, warnings);
  const mcpServers = scanMcp(absRoot, warnings);

  // Warn if nothing was found at all
  if (
    skills.length === 0 &&
    commands.length === 0 &&
    hooks.length === 0 &&
    mcpServers.length === 0
  ) {
    warnings.push(
      "No harness surfaces found (.claude/skills/, .claude/commands/, hooks/, .mcp.json). " +
        "Is this an agent-native repo?",
    );
  }

  const now = new Date().toISOString();

  const manifest: PluginManifest = {
    schemaVersion: "1.0.0",
    name: repoName(absRoot),
    version: repoVersion(absRoot),
    description: repoDescription(absRoot),
    emittedAt: now,
    repoRoot: ".",
    skills,
    commands,
    hooks,
    mcpServers,
    warnings,
  };

  const marketplace: MarketplaceEntry = {
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    publishedAt: now,
    skillCount: skills.length,
    commandCount: commands.length,
    hookCount: hooks.length,
    mcpCount: mcpServers.length,
    manifest,
  };

  const outputDir = path.join(absRoot, ".claude-plugin");
  const derived = deriveClaudeFiles(absRoot, manifest.description);
  warnings.push(...derived.warnings);
  const written: string[] = [];
  const kept: string[] = [];

  if (!dry) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    written.push("manifest.json");
    for (const [file, body] of [["plugin.json", derived.plugin], ["marketplace.json", derived.marketplace]] as const) {
      const target = path.join(outputDir, file);
      if (fs.existsSync(target) && !force && !isPlugsmithLegacy(target)) {
        kept.push(file);
        continue;
      }
      fs.writeFileSync(target, JSON.stringify(body, null, 2) + "\n", "utf-8");
      written.push(file);
    }
  }

  // Observability: append a JSONL entry to logs/build-runs.jsonl
  logBuildRun({ repoRoot: absRoot, manifest, marketplace, dry, durationMs: Date.now() - startMs });

  return { manifest, marketplace, claude: { plugin: derived.plugin, marketplace: derived.marketplace, written, kept }, outputDir };
}

/** A marketplace.json in plugsmith's old catalog format (not Claude Code's) may always be replaced. */
function isPlugsmithLegacy(file: string): boolean {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf-8")) as Record<string, unknown>;
    return "manifest" in j && "skillCount" in j && !("owner" in j);
  } catch {
    return false;
  }
}
