#!/usr/bin/env node
// plugsmith's improvement signal: compare the plugin.json keys the validator knows with the "Fields" table of
// Claude Code's plugin manifest reference (its Markdown version). A documented key plugsmith does not know is
// reported as unknown to users, so it becomes a proposal. Run after `pnpm build`.
//   node scripts/field-drift.mjs [--out proposal.md]
// Exit 0: no drift. Exit 3: drift found (proposal written). Exit 1: the check itself failed.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DOCS = "https://code.claude.com/docs/en/plugins-reference.md";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { KNOWN_PLUGIN_FIELDS } = await import(pathToFileURL(join(root, "dist/src/validate.js")).href);

const res = await fetch(DOCS);
if (!res.ok) {
  console.error(`field-drift: ${DOCS} answered ${res.status}`);
  process.exit(1);
}
const lines = (await res.text()).split("\n");
const header = lines.findIndex((l) => /^\|\s*Field\s*\|\s*Type\s*\|/.test(l));
if (header < 0) {
  console.error("field-drift: no '| Field | Type |' table on the page; its shape changed, so read it by hand");
  process.exit(1);
}
const documented = [];
for (const l of lines.slice(header + 2)) {
  const m = l.match(/^\|\s*\[?`([^`]+)`\]?/);
  if (!m) break;
  if (!m[1].includes(".")) documented.push(m[1]);
}
const missing = documented.filter((f) => !KNOWN_PLUGIN_FIELDS.includes(f));
const gone = KNOWN_PLUGIN_FIELDS.filter((f) => !documented.includes(f));
console.log(`field-drift: docs ${documented.length} top-level keys, plugsmith ${KNOWN_PLUGIN_FIELDS.length}; new ${missing.join(", ") || "none"}; no longer documented ${gone.join(", ") || "none"}`);
if (missing.length === 0 && gone.length === 0) process.exit(0);

const proposal = [
  "Claude Code's plugin manifest reference and plugsmith's validator disagree on plugin.json keys.",
  "",
  ...(missing.length ? ["Documented, but unknown to `KNOWN_PLUGIN_FIELDS` in `src/validate.ts`:", "", ...missing.map((f) => `- \`${f}\``), ""] : []),
  ...(gone.length ? ["In `KNOWN_PLUGIN_FIELDS`, but no longer documented:", "", ...gone.map((f) => `- \`${f}\``), ""] : []),
  "Proposed change: update `KNOWN_PLUGIN_FIELDS`, add path or value checks where the reference gives rules,",
  "add a golden case in `evals/golden.json`, and update `identity/MEMORY.md`.",
  "",
  `Source: ${DOCS}. Opened by the nightly improvement loop (.github/workflows/improve.yml); a person merges.`,
].join("\n");
const out = process.argv.indexOf("--out");
if (out > 0 && process.argv[out + 1]) writeFileSync(process.argv[out + 1], proposal + "\n");
else console.log(proposal);
process.exit(3);
