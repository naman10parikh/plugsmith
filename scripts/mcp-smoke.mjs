#!/usr/bin/env node
// plugsmith-mcp end-to-end smoke: start the built server over stdio, list its tools, build a tiny repo into a
// plugin and validate it, the way an MCP client would. Run after `pnpm build`. Exit 0 = pass.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = mkdtempSync(join(tmpdir(), "plugsmith-smoke-"));
mkdirSync(join(repo, "skills/one"), { recursive: true });
writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "smoke-kit", version: "0.1.0", description: "Smoke.", author: "Smoke" }));
writeFileSync(join(repo, "skills/one/SKILL.md"), "---\nname: one\ndescription: Use when smoking.\n---\n");

const calls = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "smoke", version: "1" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
  { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "build_plugin", arguments: { repo_root: repo } } },
  { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "validate_plugin", arguments: { repo_root: repo } } },
];
const server = spawn("node", [join(root, "dist/src/mcp-server.js")], { stdio: ["pipe", "pipe", "inherit"] });
const replies = new Map();
let buf = "";
server.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (line) {
      const msg = JSON.parse(line);
      replies.set(msg.id, msg);
    }
  }
});
server.on("close", () => {
  const tools = (replies.get(2)?.result?.tools ?? []).map((t) => t.name);
  const built = JSON.parse(replies.get(3)?.result?.content?.[0]?.text ?? "{}");
  const checked = JSON.parse(replies.get(4)?.result?.content?.[0]?.text ?? "{}");
  const ok = {
    tools: ["build_plugin", "validate_plugin", "validate_manifest"].every((t) => tools.includes(t)),
    build: built.written?.includes("plugin.json") && built.plugin?.name === "smoke-kit",
    validate: checked.ok === true,
    noReplyToNotification: !replies.has(undefined) && !replies.has(null),
  };
  if (Object.values(ok).every(Boolean)) {
    console.log("MCP SMOKE PASS: 3 tools listed, build_plugin wrote plugin.json, validate_plugin passed it");
    process.exit(0);
  }
  console.error(`MCP SMOKE FAIL: ${JSON.stringify(ok)}`);
  process.exit(1);
});
setTimeout(() => {
  console.error("MCP SMOKE FAIL: timeout");
  server.kill();
  process.exit(1);
}, 15000);
for (const c of calls) server.stdin.write(`${JSON.stringify(c)}\n`);
server.stdin.end();
