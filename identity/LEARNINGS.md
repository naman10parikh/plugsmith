# Plugsmith — Learnings

Corrections that became rules. Newest first. Each line: what went wrong, the rule now, and where it is enforced.

## 2026-10-19

- **Ground truth can vary by machine.** Claude Code 2.1.304 refused the names `claude-helper` and `github` on a
  developer machine (logged in or not) but accepted them on the GitHub Actions runner. Rule: a golden case whose
  Claude Code verdict varies sets `claude_check: skip` with the reason; plugsmith keeps the documented rule.
- **Claude Code never read what plugsmith wrote.** The June build emitted `.claude-plugin/manifest.json` and a
  catalog envelope named `marketplace.json`; Claude Code reads `plugin.json` and a marketplace with `owner` and
  `plugins`. Rule: emit those two in Claude Code's shape (`src/claude.ts`); keep `manifest.json` only as the
  inventory; the golden eval must agree with `claude plugin validate` on every case (`evals/run.mjs`).
- **Absolute paths leaked into public files.** The inventory held `repoRoot` and skill paths under one machine's
  home folder. Rule: every path in the output is repo-relative (`./...`); a test fails on an absolute path.
- **The bins pointed at files that were never built.** `bin` said `dist/cli.js`; tsc writes `dist/src/cli.js`.
  Rule: bins match the build output, and `prepare` builds on install so `npx github:` works.
- **`agents` replaces, `skills` adds.** Listing `.claude/agents/` would hide a repo's `agents/` folder, and a
  folder is not accepted at all. Rule: list agent files one by one, defaults included (`src/claude.ts`).
- **Works here, fails for a stranger.** A plugin can lean on an ignored `dist/` or an untracked script. Rule:
  `plugsmith validate --sandbox=e2b` uploads only tracked files to a fresh microVM and validates there.
- **Do not answer a notification.** The MCP server replied to `notifications/initialized` with an error. Rule:
  messages without an id get no reply; tool results travel as MCP text content.
