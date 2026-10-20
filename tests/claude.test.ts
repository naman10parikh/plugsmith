/**
 * plugsmith/tests/claude.test.ts
 *
 * What Claude Code reads: plugin.json and marketplace.json derivation, name rules, the validator, and the
 * keep-or-replace rule for files a repo already has. The E2B clean room runs only when E2B_API_KEY is set.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { buildPlugin } from "../src/builder.js";
import { deriveClaudeFiles, reservedPluginName, toPluginName } from "../src/claude.js";
import { validatePlugin } from "../src/validate.js";
import { validateInE2B } from "../src/sandbox.js";

function repo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugsmith-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

const PKG = JSON.stringify({ name: "@acme/demo-tools", version: "1.2.0", description: "Demo tools.", author: "Ada Lovelace <ada@example.com> (https://example.com)", license: "MIT" });

describe("names", () => {
  it("turns a package name into a plugin id", () => {
    expect(toPluginName("@acme/Demo Tools")).toBe("demo-tools");
    expect(toPluginName("plugsmith")).toBe("plugsmith");
  });
  it("knows the names that pass as Anthropic's own", () => {
    expect(reservedPluginName("claude-helper")).toBe("error");
    expect(reservedPluginName("claude-code")).toBe("error");
    expect(reservedPluginName("mcp-for-claude")).toBe("warning");
    expect(reservedPluginName("plugsmith")).toBeNull();
  });
});

describe("deriveClaudeFiles", () => {
  it("lists .claude/ agents one by one, keeps agents/ and commands/ when the keys replace them", () => {
    const dir = repo({
      "package.json": PKG,
      ".claude/agents/reviewer.md": "---\nname: reviewer\ndescription: d\n---\n",
      "agents/tester.md": "---\nname: tester\ndescription: d\n---\n",
      ".claude/commands/status.md": "# status\n",
      "commands/deploy.md": "# deploy\n",
      ".claude/skills/one/SKILL.md": "---\nname: one\ndescription: d\n---\n",
    });
    const { plugin, marketplace } = deriveClaudeFiles(dir, "");
    expect(plugin.name).toBe("demo-tools");
    expect(plugin.author).toEqual({ name: "Ada Lovelace", url: "https://example.com" });
    expect(plugin.agents).toEqual(["./.claude/agents/reviewer.md", "./agents/tester.md"]);
    expect(plugin.commands).toEqual(["./.claude/commands/", "./commands/"]);
    expect(plugin.skills).toEqual(["./.claude/skills/"]);
    expect(marketplace).toMatchObject({ name: "demo-tools", owner: { name: "Ada Lovelace" }, plugins: [{ name: "demo-tools", source: "./" }] });
    expect(JSON.stringify(plugin)).not.toContain("ada@example.com"); // no personal email in a public file
  });

  it("warns about an MCP server on a relative path, settings-only hooks and a missing author", () => {
    const dir = repo({
      "package.json": JSON.stringify({ name: "x-tools" }),
      ".mcp.json": JSON.stringify({ mcpServers: { local: { command: "node", args: ["dist/server.js"] } } }),
      ".claude/settings.json": JSON.stringify({ hooks: { Stop: [] } }),
    });
    const w = deriveClaudeFiles(dir, "").warnings.join("\n");
    expect(w).toMatch(/relative path \(dist\/server\.js\)/);
    expect(w).toMatch(/hooks in \.claude\/settings\.json/);
    expect(w).toMatch(/no author/);
  });
});

describe("validatePlugin", () => {
  it("passes what buildPlugin writes", () => {
    const dir = repo({ "package.json": PKG, "skills/one/SKILL.md": "---\nname: one\ndescription: d\n---\n" });
    buildPlugin(dir);
    const r = validatePlugin(dir);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("catches what Claude Code would refuse", () => {
    const dir = repo({
      ".claude-plugin/plugin.json": JSON.stringify({ name: "claude-helper", agents: ["agents/", "./missing.md"], skills: "./skills-file.md" }),
      "skills-file.md": "x",
      ".claude-plugin/marketplace.json": JSON.stringify({ name: "agent-skills", owner: {}, plugins: [{ name: "x", source: "plugin" }] }),
    });
    const e = validatePlugin(dir).errors.join("\n");
    expect(e).toMatch(/reserved: it passes as one of Anthropic's own/);
    expect(e).toMatch(/agents: "agents\/" must start with "\.\/"/);
    expect(e).toMatch(/path not found: \.\/missing\.md/);
    expect(e).toMatch(/skills: "\.\/skills-file\.md" must be a folder/);
    expect(e).toMatch(/"agent-skills" is a reserved marketplace name/);
    expect(e).toMatch(/owner\.name is required/);
    expect(e).toMatch(/source "plugin" must start with "\.\/"/);
  });

  it("says plainly when only the old manifest.json exists", () => {
    const dir = repo({ ".claude-plugin/manifest.json": "{}" });
    expect(validatePlugin(dir).errors[0]).toMatch(/plugin\.json is missing/);
  });
});

describe("keep or replace", () => {
  it("keeps an existing plugin.json unless forced, and always replaces the old catalog-format marketplace.json", () => {
    const dir = repo({
      "package.json": PKG,
      ".claude-plugin/plugin.json": JSON.stringify({ name: "hand-made", displayName: "Hand Made" }),
      ".claude-plugin/marketplace.json": JSON.stringify({ name: "old", version: "0.1.0", skillCount: 0, manifest: {} }),
    });
    const first = buildPlugin(dir);
    expect(first.claude.kept).toEqual(["plugin.json"]);
    expect(first.claude.written).toContain("marketplace.json");
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".claude-plugin/plugin.json"), "utf-8")).name).toBe("hand-made");
    buildPlugin(dir, { force: true });
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".claude-plugin/plugin.json"), "utf-8")).name).toBe("demo-tools");
  });
});

describe("clean room", () => {
  it("refuses cleanly without E2B_API_KEY", async () => {
    const saved = process.env.E2B_API_KEY;
    delete process.env.E2B_API_KEY;
    try {
      expect((await validateInE2B(os.tmpdir())).error).toMatch(/E2B_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.E2B_API_KEY = saved;
    }
  });

  it.skipIf(!process.env.E2B_API_KEY)("validates only the files git tracks, inside a fresh E2B microVM", async () => {
    const dir = repo({ "package.json": PKG, "skills/one/SKILL.md": "---\nname: one\ndescription: d\n---\n" });
    buildPlugin(dir);
    const git = (...a: string[]) => execFileSync("git", ["-C", dir, ...a], { stdio: "pipe" });
    git("init", "-q");
    git("add", "skills", "package.json", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json");
    const r = await validateInE2B(dir);
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.files).toBe(4);
  }, 400_000);
});
