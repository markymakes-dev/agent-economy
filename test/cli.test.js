// agent-economy CLI test suite — stdlib node:test, hermetic (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "cli.js");
const run = (args, cwd) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ae-test-"));
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

test("init writes a strict block, then is idempotent", () => {
  const dir = tmp();
  const r1 = run(["init", "--level", "strict", "--scope", "project", "--yes"], dir);
  assert.equal(r1.status, 0, r1.stdout + r1.stderr);
  const first = read(dir, "AGENTS.md");
  assert.match(first, /agent-economy:start level=strict/);
  assert.match(first, /agent-economy:end/);
  const r2 = run(["init", "--level", "strict", "--scope", "project", "--yes"], dir);
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /unchanged/);
  assert.equal(read(dir, "AGENTS.md"), first);
});

test("init --level off removes the block", () => {
  const dir = tmp();
  assert.equal(run(["init", "--level", "standard", "--scope", "project", "--yes"], dir).status, 0);
  const r = run(["init", "--level", "off", "--scope", "project", "--yes"], dir);
  assert.equal(r.status, 0);
  assert.doesNotMatch(read(dir, "AGENTS.md"), /agent-economy:start/);
});

test("verify exit codes: 0 ok, 1 missing, 2 below level", () => {
  const dir = tmp();
  run(["init", "--level", "standard", "--scope", "project", "--yes"], dir);
  const ok = run(["verify", "AGENTS.md"], dir);
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /level=standard/);
  assert.equal(run(["verify", "nope.md"], dir).status, 1);
  const below = run(["verify", "AGENTS.md", "--min-level", "strict"], dir);
  assert.equal(below.status, 2);
  assert.match(below.stdout, /below required strict/);
});

test("verify parses flags in any position (VALUE_FLAGS regression)", () => {
  const dir = tmp();
  run(["init", "--level", "strict", "--scope", "project", "--yes"], dir);
  assert.equal(run(["verify", "--min-level", "strict"], dir).status, 0);
  assert.equal(run(["verify", "AGENTS.md", "--min-level", "strict"], dir).status, 0);
  assert.equal(run(["verify", "--min-level", "strict", "AGENTS.md"], dir).status, 0);
});

test("help exits 0 and lists every command", () => {
  const r = run(["help"], os.tmpdir());
  assert.equal(r.status, 0);
  assert.match(r.stdout, /ae <command>/);
  for (const c of ["init", "verify", "doctor", "inventory", "packs", "skill"]) assert.match(r.stdout, new RegExp(c));
});

test("packs lists curated registry entries", () => {
  const r = run(["packs"], os.tmpdir());
  assert.equal(r.status, 0);
  assert.match(r.stdout, /karpathy-rules/);
  assert.match(r.stdout, /ecc-harness/);
});
