#!/usr/bin/env node
// agent-economy — request economy for coding agents.
// Metering is per request: every model round-trip bills one. This CLI manages
// the request-economy rules as an idempotent, marker-bounded AGENTS.md block.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
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

function doctor() {
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
  for (const [name, ok, hint] of rows) console.log(`  ${ok ? "✔" : "✘"} ${name}${ok ? "" : `  → ${hint}`}`);
}

function packs() {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, "packs", "registry.json"), "utf8"));
  console.log("  Curated packs (fetch-on-demand in v0.2; attribution + pinned refs):\n");
  for (const p of reg.packs) console.log(`  ${p.id.padEnd(18)} ${p.source.padEnd(38)} [${p.status}] ${p.note}`);
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
    packs     List curated third-party rule/skill packs
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
  if (cmd === "packs") return packs();
  console.log(HELP);
}

main().catch((e) => { console.error(e); process.exit(1); });
