/**
 * plugsmith/src/sandbox.ts
 *
 * Clean-room check: does the plugin work for a stranger who installs it from git? Only the files git tracks are
 * uploaded to a fresh E2B Firecracker microVM, Claude Code's CLI is installed there, and `claude plugin validate`
 * runs against that copy. A plugin that leans on an ignored or untracked file (a built dist/, a local script)
 * passes on your machine and fails here. Needs E2B_API_KEY and the optional `e2b` package; the VM is always killed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export interface CleanRoomResult {
  ok: boolean;
  files: number;
  coldStartMs?: number;
  output: string;
  error?: string;
}

interface E2BSandbox {
  files: { write(path: string, data: string | ArrayBuffer): Promise<unknown> };
  commands: { run(cmd: string, opts: { timeoutMs: number }): Promise<{ exitCode: number; stdout: string; stderr: string }> };
  kill(): Promise<unknown>;
}

const MAX_FILES = 2000;
const MAX_BYTES = 20 * 1024 * 1024;

/** The files a stranger gets: what git tracks. */
export function trackedFiles(root: string): string[] | null {
  const r = spawnSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf-8" });
  if (r.status !== 0) return null;
  return r.stdout.split("\0").filter((f) => f && fs.existsSync(path.join(root, f)) && fs.statSync(path.join(root, f)).isFile());
}

export async function validateInE2B(root: string, opts: { timeoutSec?: number } = {}): Promise<CleanRoomResult> {
  const fail = (error: string, files = 0): CleanRoomResult => ({ ok: false, files, output: "", error });
  if (!process.env.E2B_API_KEY) return fail("E2B_API_KEY is not set");
  const files = trackedFiles(root);
  if (!files) return fail("not a git repository: the clean room uploads only the files git tracks");
  if (files.length > MAX_FILES) return fail(`${files.length} tracked files is more than the ${MAX_FILES} the clean room uploads`);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(root, f)).size, 0);
  if (bytes > MAX_BYTES) return fail(`tracked files total ${Math.round(bytes / 1e6)} MB, over the 20 MB limit`, files.length);

  let Sandbox: { create(o: { timeoutMs: number }): Promise<E2BSandbox> };
  try {
    const pkg = "e2b"; // a variable, so the build never requires the optional package
    ({ Sandbox } = (await import(pkg)) as { Sandbox: typeof Sandbox });
  } catch {
    return fail("the optional `e2b` package is not installed (npm install e2b)", files.length);
  }

  let sbx: E2BSandbox | null = null;
  try {
    const t0 = Date.now();
    sbx = await Sandbox.create({ timeoutMs: 600_000 });
    const coldStartMs = Date.now() - t0;
    for (let i = 0; i < files.length; i += 20) {
      await Promise.all(
        files.slice(i, i + 20).map((f) => {
          const buf = fs.readFileSync(path.join(root, f));
          return sbx!.files.write(`/home/user/plugin/${f}`, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
        }),
      );
    }
    const timeoutMs = (opts.timeoutSec ?? 300) * 1000;
    const script =
      "npm install --prefix /home/user/cc --no-audit --no-fund --loglevel=error @anthropic-ai/claude-code && " +
      "cd /home/user/plugin && /home/user/cc/node_modules/.bin/claude plugin validate .";
    let exitCode: number;
    let out: string;
    try {
      const r = await sbx.commands.run(script, { timeoutMs });
      exitCode = r.exitCode;
      out = `${r.stdout}${r.stderr}`;
    } catch (e) {
      // The SDK throws on a non-zero exit; the error carries the same fields
      const ce = e as { exitCode?: number; stdout?: string; stderr?: string };
      if (typeof ce.exitCode !== "number") throw e;
      exitCode = ce.exitCode;
      out = `${ce.stdout ?? ""}${ce.stderr ?? ""}`;
    }
    return { ok: exitCode === 0, files: files.length, coldStartMs, output: out.trim().split("\n").slice(-15).join("\n") };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), files.length);
  } finally {
    await sbx?.kill().catch(() => undefined); // Intentionally silent: the VM also expires on its own timeout.
  }
}
