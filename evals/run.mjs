#!/usr/bin/env node
// plugsmith golden eval: build or load each tiny repository in evals/golden.json, check it with plugsmith's
// validator, and compare with the expected verdict. When `claude` is on PATH (or PLUGSMITH_REQUIRE_CLAUDE=1),
// Claude Code's own `claude plugin validate` must agree too: that is the ground truth plugsmith imitates.
// Run after `pnpm build`. Exit 0 = every case matches.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { buildPlugin } = await import(pathToFileURL(join(root, "dist/src/builder.js")).href);
const { validatePlugin } = await import(pathToFileURL(join(root, "dist/src/validate.js")).href);
const golden = JSON.parse(readFileSync(join(root, "evals/golden.json"), "utf-8"));

const haveClaude = spawnSync("claude", ["--version"], { encoding: "utf-8" }).status === 0;
if (process.env.PLUGSMITH_REQUIRE_CLAUDE === "1" && !haveClaude) {
  console.error("plugsmith eval: PLUGSMITH_REQUIRE_CLAUDE=1 but claude is not on PATH");
  process.exit(1);
}

let failed = 0;
for (const c of golden.cases) {
  const dir = mkdtempSync(join(tmpdir(), "plugsmith-eval-"));
  for (const [rel, body] of Object.entries(c.files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  const warnings = c.build ? buildPlugin(dir).manifest.warnings : [];
  const r = validatePlugin(dir, { withClaude: haveClaude });
  const problems = [];
  if (r.ok !== c.valid) problems.push(`plugsmith says ${r.ok ? "valid" : "invalid"} (${r.errors.join("; ") || "no errors"})`);
  if (c.error && !r.errors.some((e) => e.includes(c.error))) problems.push(`no error containing "${c.error}"`);
  if (c.warning && !warnings.some((w) => w.includes(c.warning))) problems.push(`no warning containing "${c.warning}"`);
  if (r.claude?.ran && r.claude.ok !== c.valid) problems.push(`claude plugin validate says ${r.claude.ok ? "valid" : "invalid"}: ${r.claude.output.split("\n").slice(-3).join(" | ")}`);
  console.log(`${problems.length ? "✗" : "✓"} ${c.case}${r.claude?.ran ? " (claude agrees)" : ""}`);
  for (const p of problems) console.log(`    ${p}`);
  if (problems.length) failed++;
}
console.log(`plugsmith eval: ${golden.cases.length - failed}/${golden.cases.length} cases match${haveClaude ? ", checked against claude plugin validate" : " (claude not on PATH: static check only)"}`);
process.exit(failed ? 1 : 0);
