/**
 * plugsmith/src/types.ts
 *
 * Shared type definitions for the manifest schema.
 * Kept minimal — only fields the builder actually emits.
 */

/** A single skill entry discovered in .claude/skills/ */
export interface PluginSkill {
  /** Directory name, e.g. "deep-think" */
  name: string;
  /** Absolute path to the skill root */
  path: string;
  /** First non-empty description line from SKILL.md, if present */
  description: string;
  /** Trigger keywords extracted from SKILL.md, if present */
  triggers: string[];
}

/** A slash-command discovered in .claude/commands/ */
export interface PluginCommand {
  /** Command name without leading slash, e.g. "status" */
  name: string;
  /** Absolute path to the .md file */
  path: string;
  /** First non-empty description line from the command file */
  description: string;
}

/** A hook entry discovered in hooks/ */
export interface PluginHook {
  /** Hook filename, e.g. "pre-compact-memory-flush.sh" */
  name: string;
  /** Absolute path */
  path: string;
  /** Inferred hook type from filename prefix */
  type:
    | "pre-compact"
    | "post-compact"
    | "pre-commit"
    | "post-commit"
    | "session-start"
    | "session-stop"
    | "unknown";
}

/** An MCP server entry from .mcp.json */
export interface PluginMcp {
  /** Server key in .mcp.json */
  name: string;
  /** command field */
  command?: string;
  /** args[] field */
  args?: string[];
}

/** The .claude-plugin/manifest.json schema */
export interface PluginManifest {
  /** Schema version — always "1.0.0" for now */
  schemaVersion: "1.0.0";
  /** Plugin name — defaults to the repo directory name */
  name: string;
  /** Semver version — defaults to "0.1.0" */
  version: string;
  /** Human-readable description — from README first line or empty */
  description: string;
  /** ISO timestamp of when the manifest was emitted */
  emittedAt: string;
  /** Absolute path to the repo root that was scanned */
  repoRoot: string;
  /** Discovered skills */
  skills: PluginSkill[];
  /** Discovered slash-commands */
  commands: PluginCommand[];
  /** Discovered hooks */
  hooks: PluginHook[];
  /** Discovered MCP servers */
  mcpServers: PluginMcp[];
  /** Non-fatal scan warnings */
  warnings: string[];
}

/** marketplace.json — catalog-ready envelope wrapping the manifest */
export interface MarketplaceEntry {
  /** Same as manifest.name */
  name: string;
  /** Same as manifest.version */
  version: string;
  /** Same as manifest.description */
  description: string;
  /** ISO timestamp */
  publishedAt: string;
  /** Skill count */
  skillCount: number;
  /** Command count */
  commandCount: number;
  /** Hook count */
  hookCount: number;
  /** MCP server count */
  mcpCount: number;
  /** Full manifest inlined */
  manifest: PluginManifest;
}
