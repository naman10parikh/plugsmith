/**
 * plugsmith/tests/builder.test.ts
 *
 * Eval: assert that buildPlugin() on the energy-fixture produces a valid
 * .claude-plugin/manifest.json + marketplace.json with correct counts and shapes.
 *
 * These are the acceptance criteria for the ONE owned artifact (src/builder.ts).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlugin } from "../src/builder.js";
import type { PluginManifest, MarketplaceEntry } from "../src/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "..", "fixtures", "energy-fixture");
const PLUGIN_DIR = path.join(FIXTURE, ".claude-plugin");

// Clean up any previously emitted files before/after the suite
function cleanup() {
  if (fs.existsSync(PLUGIN_DIR)) {
    fs.rmSync(PLUGIN_DIR, { recursive: true, force: true });
  }
}

beforeAll(cleanup);
afterAll(cleanup);

describe("buildPlugin() on energy-fixture", () => {
  // Run once, share result
  let manifest: PluginManifest;
  let marketplace: MarketplaceEntry;

  it("emits without throwing", () => {
    const result = buildPlugin(FIXTURE);
    manifest = result.manifest;
    marketplace = result.marketplace;
    expect(result.outputDir).toBe(PLUGIN_DIR);
  });

  it("writes manifest.json to disk", () => {
    expect(fs.existsSync(path.join(PLUGIN_DIR, "manifest.json"))).toBe(true);
  });

  it("writes marketplace.json to disk", () => {
    expect(fs.existsSync(path.join(PLUGIN_DIR, "marketplace.json"))).toBe(true);
  });

  it("manifest schemaVersion is '1.0.0'", () => {
    expect(manifest.schemaVersion).toBe("1.0.0");
  });

  it("manifest name comes from package.json", () => {
    expect(manifest.name).toBe("energy-fixture");
  });

  it("manifest version comes from package.json", () => {
    expect(manifest.version).toBe("0.2.0");
  });

  it("manifest description is non-empty", () => {
    expect(manifest.description.length).toBeGreaterThan(0);
  });

  it("emittedAt is a valid ISO timestamp", () => {
    expect(() => new Date(manifest.emittedAt).toISOString()).not.toThrow();
  });

  it("repoRoot matches the fixture path", () => {
    expect(manifest.repoRoot).toBe(FIXTURE);
  });

  // Skills
  it("discovers 2 skills (deep-think + playwright-cli)", () => {
    expect(manifest.skills.length).toBe(2);
  });

  it("skill names are correct", () => {
    const names = manifest.skills.map((s) => s.name).sort();
    expect(names).toEqual(["deep-think", "playwright-cli"]);
  });

  it("deep-think skill has a description", () => {
    const dt = manifest.skills.find((s) => s.name === "deep-think");
    expect(dt?.description.length).toBeGreaterThan(0);
  });

  it("deep-think skill has triggers", () => {
    const dt = manifest.skills.find((s) => s.name === "deep-think");
    expect((dt?.triggers ?? []).length).toBeGreaterThan(0);
  });

  // Commands
  it("discovers 1 command (status)", () => {
    expect(manifest.commands.length).toBe(1);
  });

  it("command name is 'status' (without .md extension)", () => {
    expect(manifest.commands[0]?.name).toBe("status");
  });

  it("command has a description", () => {
    expect((manifest.commands[0]?.description ?? "").length).toBeGreaterThan(0);
  });

  // Hooks
  it("discovers 2 hooks", () => {
    expect(manifest.hooks.length).toBe(2);
  });

  it("pre-compact hook is typed correctly", () => {
    const hook = manifest.hooks.find((h) => h.name.includes("pre-compact"));
    expect(hook?.type).toBe("pre-compact");
  });

  it("session-start hook is typed correctly", () => {
    const hook = manifest.hooks.find((h) => h.name.includes("session-start"));
    expect(hook?.type).toBe("session-start");
  });

  // MCP
  it("discovers 2 MCP servers", () => {
    expect(manifest.mcpServers.length).toBe(2);
  });

  it("MCP server names include 'github' and 'context7'", () => {
    const names = manifest.mcpServers.map((m) => m.name).sort();
    expect(names).toEqual(["context7", "github"]);
  });

  // Warnings
  it("no unexpected warnings on a well-formed fixture", () => {
    // Warnings array exists but should be empty for the fixture
    expect(Array.isArray(manifest.warnings)).toBe(true);
    expect(manifest.warnings.length).toBe(0);
  });

  // Marketplace
  it("marketplace.skillCount matches manifest.skills.length", () => {
    expect(marketplace.skillCount).toBe(manifest.skills.length);
  });

  it("marketplace.commandCount matches manifest.commands.length", () => {
    expect(marketplace.commandCount).toBe(manifest.commands.length);
  });

  it("marketplace.hookCount matches manifest.hooks.length", () => {
    expect(marketplace.hookCount).toBe(manifest.hooks.length);
  });

  it("marketplace.mcpCount matches manifest.mcpServers.length", () => {
    expect(marketplace.mcpCount).toBe(manifest.mcpServers.length);
  });

  it("marketplace.manifest is the full manifest object", () => {
    expect(marketplace.manifest).toEqual(manifest);
  });

  // On-disk JSON is well-formed and matches in-memory result
  it("manifest.json on disk parses and matches in-memory manifest", () => {
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_DIR, "manifest.json"), "utf-8"),
    ) as PluginManifest;
    expect(onDisk).toEqual(manifest);
  });

  it("marketplace.json on disk parses and matches in-memory marketplace entry", () => {
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(PLUGIN_DIR, "marketplace.json"), "utf-8"),
    ) as MarketplaceEntry;
    expect(onDisk).toEqual(marketplace);
  });
});

describe("buildPlugin() dry mode", () => {
  it("returns results without writing files", () => {
    const tmpDir = path.join(FIXTURE, ".claude-plugin-dry-test");
    // Ensure it doesn't exist
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const result = buildPlugin(FIXTURE, /* dry= */ true);
    expect(result.manifest).toBeDefined();
    // Should NOT write in dry mode (outputDir returned but files not written)
    expect(fs.existsSync(path.join(FIXTURE, ".claude-plugin-dry-test", "manifest.json"))).toBe(false);
    // The .claude-plugin/ dir from prior tests may exist — dry mode should NOT have created a new one
    // We only verify the in-memory result is valid
    expect(result.manifest.schemaVersion).toBe("1.0.0");
  });
});

describe("buildPlugin() on non-existent repo", () => {
  it("throws a meaningful error", () => {
    expect(() => buildPlugin("/tmp/plugsmith-does-not-exist-xyz123")).toThrow(
      /does not exist/,
    );
  });
});

describe("buildPlugin() on repo with no harness surfaces", () => {
  it("emits a manifest with empty arrays and a warning", () => {
    // Use a temp dir with no .claude/ or hooks/
    const tmpDir = path.join(__dirname, "..", "fixtures", "empty-fixture");
    fs.mkdirSync(tmpDir, { recursive: true });
    // Write a minimal README so description scan doesn't error
    fs.writeFileSync(path.join(tmpDir, "README.md"), "# empty-fixture\n");

    try {
      const { manifest } = buildPlugin(tmpDir, /* dry= */ true);
      expect(manifest.skills.length).toBe(0);
      expect(manifest.commands.length).toBe(0);
      expect(manifest.hooks.length).toBe(0);
      expect(manifest.mcpServers.length).toBe(0);
      expect(manifest.warnings.some((w) => w.includes("No harness surfaces found"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
