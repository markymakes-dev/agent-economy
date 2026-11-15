#!/usr/bin/env node
// agent-economy — request economy for coding agents.
// Metering is per request: every model round-trip bills one. This CLI manages
// the request-economy rules as an idempotent, marker-bounded AGENTS.md block.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execSync, spawn, spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARKER_START = /<!-- agent-economy:start level=(\w+) -->/;
const MARKER_END = "<!-- agent-economy:end -->";
const RE_BLOCK = /<!-- agent-economy:start level=\w+ -->[\s\S]*?<!-- agent-economy:end -->/;
const HEADER = "## Request economy (metering is per request — every model round-trip bills one)";

const RULES = {
  standard: [
    "- Emit independent tool calls in PARALLEL within one round; never spread them one-per-round.",
    "- Combine closely-related shell commands into a single call (max ~5, `;`-joined); batch related file reads into one round.",
    "- Before running anything, check whether a result already in this session answers it; never re-run for information you already have.",
    "- Filter expected-large output at the source (`rtk <cmd>`, `--oneline`, `| head -50`) so rounds stay cheap to fold."
  ],
  strict: [
    "- Emit independent tool calls in PARALLEL within one round; never spread them one-per-round.",
    "- Combine closely-related shell commands into a single call (max ~5, `;`-joined); batch related file reads into one round.",
    "- Before running anything, check whether a result already in this session answers it; never re-run for information you already have.",
    "- When an answer is inferable, state the assumption and proceed — do not spend a round asking a clarifying question.",
    "- Do a task's follow-up work in the same turn; do not stop after each micro-step.",
    "- Filter expected-large output at the source (`rtk <cmd>`, `--oneline`, `| head -50`) so rounds stay cheap to fold.",
    "- Avoid subagents for small lookups — each runs its own multi-request loop; use direct tools instead."
  ]
};

const RANK = { off: 0, standard: 1, strict: 2 };
const startMarker = (lvl) => `<!-- agent-economy:start level=${lvl} -->`;
const blockFor = (lvl) => [startMarker(lvl), "", HEADER, "", ...RULES[lvl], "", MARKER_END].join("\n");
const globalFile = () => path.join(os.homedir(), ".config", "opencode", "AGENTS.md");

function skill(dir) {
  const src = path.join(ROOT, "skills", "agent-economy-setup");
  const target = path.resolve(dir || path.join(os.homedir(), ".claude", "skills", "agent-economy-setup"));
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(src, target, { recursive: true });
  console.log(`  ✔ agent-economy-setup skill → ${target}`);
  console.log("  = agents discover it automatically (opencode picks it up without restart)");
}

function upsert(file, level) {
  const exists = fs.existsSync(file);
  const prev = exists ? fs.readFileSync(file, "utf8") : "";
  let next;
  if (level === "off") {
    if (!RE_BLOCK.test(prev)) { console.log(`  = no agent-economy block in ${file}`); return; }
    next = prev.replace(RE_BLOCK, "").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  } else {
    next = RE_BLOCK.test(prev)
      ? prev.replace(RE_BLOCK, blockFor(level))
      : (prev.trimEnd() ? prev.trimEnd() + "\n\n" + blockFor(level) + "\n" : blockFor(level) + "\n");
  }
  if (next === prev) { console.log(`  = unchanged ${file}`); return; }
  if (exists) {
    const bak = `${file}.bak-${Date.now()}`;
    fs.copyFileSync(file, bak);
    console.log(`  + backup  ${bak}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  console.log(`  ✔ wrote   ${file} (level=${level})`);
}

function verify(file, minLevel) {
  if (!fs.existsSync(file)) return { code: 1, msg: `✘ ${file} not found` };
  const m = fs.readFileSync(file, "utf8").match(MARKER_START);
  if (!m) return { code: 1, msg: `✘ ${file} has no agent-economy block` };
  const lvl = m[1];
  if (RANK[lvl] === undefined) return { code: 2, msg: `✘ ${file} has unknown level "${lvl}"` };
  if (RANK[lvl] < RANK[minLevel]) return { code: 2, msg: `✘ ${file} level=${lvl} is below required ${minLevel}` };
  return { code: 0, msg: `✔ ${file} level=${lvl} (required ≥ ${minLevel})` };
}

const hasBin = (cmd) => {
  try { execSync(`${process.platform === "win32" ? "where" : "which"} ${cmd}`, { stdio: "pipe" }); return true; }
  catch { return false; }
};

function doctorData() {
  const opencodeDir = path.join(os.homedir(), ".config", "opencode");
  const opencodeCfg = (() => { try { return fs.readFileSync(path.join(opencodeDir, "opencode.json"), "utf8"); } catch { return ""; } })();
  const goalInstalled = /goal/i.test(opencodeCfg) || ["plugin", "plugins"].some((d) => {
    try {
      return fs.readdirSync(path.join(opencodeDir, d)).some((f) =>
        /goal/i.test(f) || /goal/i.test(fs.readFileSync(path.join(opencodeDir, d, f), "utf8")));
    } catch { return false; }
  });
  const rows = [
    ["rtk (output filter)", hasBin("rtk"), "winget install rtk-ai.rtk"],
    ["billion-context (context folds)", hasBin("bili") || fs.existsSync(path.join(os.homedir(), ".local", "bili.cmd")), "npm install -g billion-context --prefix=~/.local && bili plugin install opencode"],
    ["opencode CLI", hasBin("opencode"), "opencode.ai"],
    ["/goal (opencode command)", goalInstalled || hasBin("opencode"), "built into opencode 2.x — else install prevalentWare/opencode-goal-plugin"],
    ["project AGENTS.md", fs.existsSync(path.resolve("AGENTS.md")), "economy init"],
    ["global AGENTS.md", fs.existsSync(globalFile()), "economy init --scope global"]
  ];
  return rows.map(([name, ok, hint]) => ({ name, ok, hint }));
}

function doctor() {
  for (const r of doctorData()) console.log(`  ${r.ok ? "✔" : "✘"} ${r.name}${r.ok ? "" : `  → ${r.hint}`}`);
}

function packsData() {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "packs", "registry.json"), "utf8"));
  return {
    curated: reg.packs.filter((p) => p.status !== "stack").map((p) => ({
      id: p.id, source: p.source, ref: p.ref || "main", status: p.status, note: p.note,
      specs: Array.isArray(p.install) ? p.install.length : 0
    })),
    tools: reg.packs.filter((p) => p.status === "stack").map((p) => ({ id: p.id, source: p.source, setup: p.setup }))
  };
}

function packs() {
  const d = packsData();
  console.log("  Curated packs (fetch-on-demand; attribution + pinned refs):\n");
  for (const p of d.curated)
    console.log(`  ${p.id.padEnd(18)} ${p.source.padEnd(38)} [${p.status}] ${p.note}`);
  if (d.tools.length) {
    console.log("\n  Stack tools (runtime — detected by `ae inventory`; ae never installs these):\n");
    for (const p of d.tools) console.log(`  ${p.id.padEnd(18)} ${p.source.padEnd(38)} setup: ${p.setup}`);
  }
}

async function installPack(id, dir) {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "packs", "registry.json"), "utf8"));
  const p = reg.packs.find((x) => x.id === id);
  if (!p) { console.error(`  ✘ unknown pack "${id}"`); process.exit(2); }
  if (p.status === "stack") {
    console.error(`  ✘ "${id}" is a runtime tool, not a fetchable pack — ae never installs those.`);
    console.error(`    set it up directly: ${p.setup}`);
    process.exit(2);
  }
  if (!Array.isArray(p.install) || !p.install.length) {
    console.error(`  ✘ pack "${id}" has no curated install spec yet (status: ${p.status})`);
    process.exit(2);
  }
  const target = path.resolve(dir || path.join(os.homedir(), ".claude", "skills"));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "ae-pack-"));
  try {
    const url = `https://codeload.github.com/${p.source}/tar.gz/refs/heads/${p.ref || "main"}`;
    console.log(`  ↓ ${url}`);
    const res = await fetch(url);
    if (!res.ok) { console.error(`  ✘ download failed: HTTP ${res.status}`); process.exit(2); }
    const tgz = path.join(work, "pack.tgz");
    fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
    const root = path.join(work, "x");
    fs.mkdirSync(root, { recursive: true });
    const r = spawnSync("tar", ["-xzf", tgz, "-C", root]);
    if (r.status !== 0) { console.error("  ✘ untar failed (is tar available?)"); process.exit(2); }
    const base = path.join(root, fs.readdirSync(root)[0]);
    fs.mkdirSync(target, { recursive: true });
    for (const spec of p.install) {
      const from = path.join(base, spec.from);
      const to = path.join(target, spec.to);
      if (!fs.existsSync(from)) { console.error(`  ✘ missing in pack: ${spec.from}`); process.exit(2); }
      fs.cpSync(from, to, { recursive: true });
      console.log(`  ✔ ${spec.from} → ${to}`);
    }
    const attr = path.join(target, `${p.id}.ATTRIBUTION.md`);
    fs.writeFileSync(attr, `# ${p.id}\n\nSource: https://github.com/${p.source} (ref ${p.ref || "main"})\nInstalled by agent-economy on ${new Date().toISOString()}\nLicense: see the pack repository.\n`);
    console.log(`  ✔ attribution → ${attr}`);
    console.log(`  = done: ${p.id} installed to ${target}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

async function checkPackData(id) {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "packs", "registry.json"), "utf8"));
  const list = id ? reg.packs.filter((p) => p.id === id) : reg.packs.filter((p) => Array.isArray(p.install) && p.install.length);
  if (!list.length) return { error: id ? `unknown pack "${id}"` : "no installable packs" };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "ae-check-"));
  const results = [];
  try {
    for (const p of list) {
      const url = `https://codeload.github.com/${p.source}/tar.gz/refs/heads/${p.ref || "main"}`;
      const row = { id: p.id, source: p.source, ref: p.ref || "main", total: p.install.length, missing: [], error: null };
      try {
        const res = await fetch(url);
        if (!res.ok) row.error = `download failed: HTTP ${res.status}`;
        else {
          const tgz = path.join(work, `${p.id}.tgz`);
          fs.writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
          const r = spawnSync("tar", ["-tzf", tgz], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
          if (r.status !== 0) row.error = "tar listing failed";
          else {
            const files = new Set(r.stdout.split(/\r?\n/).map((f) => f.replace(/^[^/]+\//, "")));
            row.missing = p.install.filter((s) => !files.has(`${s.from}/SKILL.md`)).map((s) => s.from);
          }
        }
      } catch (e) { row.error = String((e && e.message) || e); }
      results.push(row);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return { results };
}

async function checkPack(id) {
  const d = await checkPackData(id);
  if (d.error) { console.error(`  ✘ ${d.error}`); process.exit(id ? 2 : 0); }
  let bad = 0;
  for (const r of d.results) {
    console.log(`  … ${r.id} (${r.source}@${r.ref})`);
    if (r.error) { console.log(`    ✘ ${r.error}`); bad++; continue; }
    if (r.missing.length) { for (const m of r.missing) console.log(`    ✘ drift: ${m}/SKILL.md gone from upstream`); bad++; }
    else console.log(`    ✔ ${r.total}/${r.total} specs present`);
  }
  console.log(bad ? `  ✘ ${bad} pack(s) drifted — update packs/registry.json` : "  = all curated install specs match upstream HEAD");
  process.exit(bad ? 1 : 0);
}

function listDir(p, filter) {
  try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => filter(d, p)).map((d) => d.name); }
  catch { return []; }
}

const pkgName = (spec) => spec.replace(/@[^/@]+$/, "");

function rtkStatus() {
  const r = spawnSync("rtk", ["--version"], { encoding: "utf8", timeout: 5000 });
  const v = (r.stdout || "").trim().split(/\r?\n/)[0] || "";
  if (r.error && !v) return { name: "rtk", ok: false, detail: "not found", hint: "winget install rtk-ai.rtk · then: rtk init -g --opencode --hook-only --no-patch" };
  if (!v) return { name: "rtk", ok: true, detail: "installed (version unknown)", hint: null };
  return { name: "rtk", ok: true, detail: v.startsWith("rtk") ? v.slice(4) : v, hint: null };
}

async function biliStatus() {
  const dir = path.join(os.homedir(), ".local", "state", "billion-context", "instances");
  const files = listDir(dir, (d) => d.isFile() && d.name.endsWith(".json"));
  for (const f of files) {
    try {
      const inst = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (!inst.origin) continue;
      const res = await fetch(`${inst.origin}/__bili/health`, { signal: AbortSignal.timeout(3000) });
      const h = await res.json();
      return h.ok
        ? { name: "billion-context", ok: true, detail: `v${h.version} (${inst.origin})`, hint: null }
        : { name: "billion-context", ok: false, detail: `responding, not healthy (${inst.origin})`, hint: null };
    } catch { /* dead instance file, try next */ }
  }
  if (files.length) return { name: "billion-context", ok: false, detail: "proxy not responding", hint: "restart opencode to relaunch it" };
  return { name: "billion-context", ok: false, detail: "not detected", hint: "npm i -g billion-context · then: bili plugin install opencode" };
}

async function inventoryData() {
  const home = os.homedir();
  const oc = path.join(home, ".config", "opencode");
  const rows = [];
  let active = new Set();
  try {
    const j = JSON.parse(fs.readFileSync(path.join(oc, "opencode.json"), "utf8"));
    for (const p of j.plugin || []) { rows.push(["opencode plugin (config)", p]); active.add(pkgName(p)); }
    for (const m of Object.keys(j.mcp || {})) rows.push(["opencode mcp", m]);
  } catch {}
  for (const f of listDir(path.join(oc, "plugins"), (d) => d.isFile())) rows.push(["opencode plugin (file)", f]);
  for (const f of listDir(path.join(oc, "command"), (d) => d.isFile())) rows.push(["opencode command", f]);
  for (const dir of [
    path.join(oc, "skill"), path.join(oc, "skills"),
    path.resolve(".opencode", "skill"), path.resolve(".opencode", "skills"),
    path.join(home, ".claude", "skills")
  ]) for (const d of listDir(dir, (e) => e.isDirectory())) rows.push([`skills  ${dir.replace(home, "~")}`, d]);
  for (const d of listDir(path.join(home, ".claude", "plugins"), (e) => e.isDirectory())) rows.push(["claude plugin", d]);
  const cache = path.join(home, ".cache", "opencode", "npm");
  for (const d of listDir(cache, (e) => e.isDirectory())) {
    if (d.startsWith("@")) for (const c of listDir(path.join(cache, d), (e) => e.isDirectory())) rows.push(["opencode npm cache", `${d}/${c}`]);
    else rows.push(["opencode npm cache", d]);
  }
  const seen = new Set();
  const groups = [];
  for (const [src, name] of rows) {
    const k = `${src}|${name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    let g = groups.find((x) => x.source === src);
    if (!g) { g = { source: src, entries: [] }; groups.push(g); }
    g.entries.push({ name, orphan: src === "opencode npm cache" && !active.has(pkgName(name)) });
  }
  const stack = await Promise.all([rtkStatus(), biliStatus()]);
  return { stack, groups, count: groups.reduce((n, g) => n + g.entries.length, 0) };
}

async function inventory() {
  const d = await inventoryData();
  console.log("  Token-economy stack:\n");
  for (const s of d.stack) console.log(`    · ${s.name} — ${s.detail}${s.hint ? `   (fix: ${s.hint})` : ""}`);
  console.log("\n  Plugins / skills / MCP loaded across agents on this machine:\n");
  let last = "";
  for (const g of d.groups) {
    if (g.source !== last) { console.log(`  ${g.source}`); last = g.source; }
    for (const e of g.entries) console.log(`    · ${e.name}${e.orphan ? "   (not in config — orphaned)" : ""}`);
  }
  console.log(`\n  ${d.count} entries · health: ae doctor · curated extras: ae packs`);
}

function json(res, body, code = 200) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function ui(port) {
  const htmlPath = path.join(ROOT, "src", "ui.html");
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (url.pathname === "/api/doctor") return json(res, doctorData());
      if (url.pathname === "/api/inventory") return json(res, await inventoryData());
      if (url.pathname === "/api/packs") return json(res, packsData());
      if (url.pathname === "/api/packs/check") return json(res, await checkPackData(url.searchParams.get("id") || undefined));
      if (url.pathname !== "/") { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "content-type": "text/html; charset=utf8" });
      res.end(fs.readFileSync(htmlPath));
    } catch (e) {
      json(res, { error: String((e && e.message) || e) }, 500);
    }
  });
  const p = Number(port) || 4747;
  server.listen(p, "127.0.0.1", () => {
    const addr = `http://127.0.0.1:${p}`;
    console.log(`  ae ui → ${addr}   (Ctrl+C to stop)`);
    if (!process.argv.includes("--no-open")) {
      try {
        if (process.platform === "win32") spawn("cmd", ["/c", "start", "", addr], { detached: true, stdio: "ignore" }).unref();
        else spawn(process.platform === "darwin" ? "open" : "xdg-open", [addr], { detached: true, stdio: "ignore" }).unref();
      } catch { /* headless — the URL is printed above */ }
    }
  });
}

const HELP = `
  agent-economy — request economy for coding agents

  Usage: ae <command> [options]      (alias: economy)

  One-time install:  npm i -g agent-economy        (or: npx agent-economy <cmd>)

  Commands:
    init      Install/update the request-economy block
              --level off|standard|strict   (default: interactive, standard)
              --scope project|global|both   (default: interactive, project)
              --yes                         non-interactive defaults
    verify    Check a file carries the block; exit 1 missing, 2 below level
              [file=AGENTS.md] --min-level standard|strict
    doctor    Detect agent tooling (rtk, billion-context, goal plugin, ...)
    inventory Show the token-economy stack (rtk, billion-context) with health,
              then every plugin/skill/MCP actually loaded on this machine
    packs     List curated third-party rule/skill packs
              --install <id> [--dir <target>]   fetch + install a curated pack
                                                (default target: ~/.claude/skills)
              --check [id]                      validate install specs against upstream HEAD
    skill     Install the agent-economy-setup skill (teaches any agent to run ae)
    ui        Local dashboard (health, inventory, packs) in your browser
              --port <n>   default 4747; --no-open skips launching the browser
    help      This text

  Every model round-trip bills one request. Batch the independent ones.
`;

async function ask(q, def) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(`${q} [${def}]: `)).trim() || def;
  rl.close();
  return a;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || "help";
  const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
  const hasFlag = (f) => args.includes(f);

  if (cmd === "init") {
    const yes = hasFlag("--yes");
    let level = get("--level");
    let scope = get("--scope");
    if (!level) level = yes ? "standard" : await ask("Economy level off/standard/strict?", "standard");
    if (!scope) scope = yes ? "project" : await ask("Scope project/global/both?", "project");
    if (!(level in RANK)) { console.error(`✘ unknown level "${level}"`); process.exit(2); }
    const targets = { project: [path.resolve("AGENTS.md")], global: [globalFile()], both: [path.resolve("AGENTS.md"), globalFile()] }[scope];
    if (!targets) { console.error(`✘ unknown scope "${scope}"`); process.exit(2); }
    for (const f of targets) upsert(f, level);
    return;
  }

  if (cmd === "verify") {
    const VALUE_FLAGS = ["--level", "--scope", "--min-level"];
    const positional = [];
    for (let i = 1; i < args.length; i++) {
      if (VALUE_FLAGS.includes(args[i])) { i++; continue; }
      if (!args[i].startsWith("--")) positional.push(args[i]);
    }
    const file = positional[0] || path.resolve("AGENTS.md");
    const min = get("--min-level") || "standard";
    if (!(min in RANK)) { console.error(`✘ unknown --min-level "${min}"`); process.exit(2); }
    const r = verify(file, min);
    console.log("  " + r.msg);
    process.exit(r.code);
  }

  if (cmd === "doctor") return doctor();
  if (cmd === "skill") return skill(get("--dir"));
  if (cmd === "inventory") return inventory();
  if (cmd === "ui") return ui(get("--port"));
  if (cmd === "packs") {
    const cid = get("--check");
    if (hasFlag("--check")) return checkPack(cid && !cid.startsWith("--") ? cid : undefined);
    if (get("--install")) return installPack(get("--install"), get("--dir"));
    return packs();
  }
  console.log(HELP);
}

main().catch((e) => { console.error(e); process.exit(1); });
