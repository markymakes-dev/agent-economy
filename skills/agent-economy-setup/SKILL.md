---
name: agent-economy-setup
description: Install, verify, or configure agent-economy request-economy rules. Use when the user asks to install/set up agent-economy, wants the agent to save requests/quota/credits, mentions ae commands, or a CI check on agent-economy fails.
license: MIT
---

# agent-economy setup

Free and metered agent tiers bill **per request** — every model round-trip costs one. agent-economy manages a battle-tested rule set as an idempotent, marker-bounded block in `AGENTS.md`, so agents batch, dedupe, and finish in fewer round-trips.

## Commands

- `ae init [--level off|standard|strict] [--scope project|global|both] [--yes]` — install/update the rules block (interactive unless `--yes`)
- `ae verify [file] [--min-level standard|strict]` — check the block; exit 0 ok, 1 missing, 2 below level (this is the CI gate)
- `ae doctor` — detect the stack (rtk, billion-context, with live health) + setup checks
- `ae skill` — (re)install this skill

## Installing for a user

1. Run `npx -y agent-economy@latest init --level standard --yes` (project scope). Use `--level strict` when the user wants maximum savings; `--scope global` writes `~/.config/opencode/AGENTS.md`.
2. Run `npx -y agent-economy@latest skill` so future sessions can manage the setup themselves.
3. Run `npx -y agent-economy@latest doctor` and report the results.

ae does not install third-party skills or stack tools. NEVER install stack tools (`rtk`, `billion-context`) without asking — they change runtime behavior, not content; `ae doctor` prints their setup commands when missing.

## Guardrails

- The block between `<!-- agent-economy:start level=… -->` and `<!-- agent-economy:end -->` is MANAGED — never hand-edit it; change the level with `ae init --level <lvl>`.
- `ae init` is idempotent and backs up to `AGENTS.md.bak-<timestamp>` first.
- If a repo contains the block, run `ae verify --min-level strict` before committing.
- Levels: `standard` = batch + dedupe + filter output at source; `strict` = + assume-and-proceed, same-turn completion, no subagents for small lookups.
