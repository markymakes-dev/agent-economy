# agent-economy

**Request economy for coding agents.** Free and metered agent tiers bill **per request** — every model round-trip costs one, no matter how small. agent-economy installs a battle-tested rule set that makes agents batch, dedupe, and finish in fewer round-trips — as an idempotent, marker-bounded block in `AGENTS.md`, the open standard every major agent already reads (opencode, Codex, Cursor, Gemini CLI, Jules, Amp, Zed).

```
npm i -g agent-economy        # once per machine (or use npx agent-economy <cmd>)

ae init                       # per project: interactive level + scope
ae init --level strict --yes  # scripted onboarding
ae verify --min-level strict  # CI gate: exit 1 missing, 2 below level
ae doctor                     # detect rtk / billion-context / goal plugin
ae packs                      # curated third-party rule/skill packs
```

### Install with your agent (no terminal needed)

Paste this into opencode / Claude Code / Codex / Cursor — the agent does the rest:

> Install agent-economy: run `npx -y agent-economy@latest init --level standard --yes`, then `npx -y agent-economy@latest skill`, then `npx -y agent-economy@latest doctor`, and report the results. Don't ask clarifying questions; project scope.

After that, every future session discovers the `agent-economy-setup` skill and knows how to verify, re-configure, or extend the setup on its own.

## Why requests, not tokens

Token-compression tools (billion-context, RTK, headroom) are plentiful. **Request-economy tooling does not exist** — yet per-request metering is what actually caps free-tier sessions (measured baseline: ~7 model requests per user message in a real opencode session). Batching 3 independent calls into 1 round saves 2 requests *and* 2 round-trips of latency, every time. No plugin can force batching — call count is decided at generation time — so the prompt is the only injection point. This project owns that injection point.

## Levels

| Level | Rules |
|---|---|
| `standard` | parallel independent calls · batch related shell commands (max ~5) · never re-run for known info · filter large output at the source |
| `strict` | standard **+** assume-and-proceed instead of clarifying questions · same-turn completion · no subagents for small lookups |
| `off` | removes the block (clean uninstall) |

## Mechanics

- **Idempotent** — blocks are wrapped in `<!-- agent-economy:start level=… -->` … `<!-- agent-economy:end -->`; re-running updates in place, never duplicates
- **Backup first** — `AGENTS.md.bak-<timestamp>` before any change
- **Zero dependencies** — Node stdlib only; runs anywhere Node ≥ 18 runs
- **Zero runtime cost** — the CLI runs once at setup; the artifact is the file. No plugin, no MCP, no per-session overhead

## Enforce it in CI

You can't police teammates' machines — you can police the repo:

```yaml
# .github/workflows/agents-md.yml
- run: npx agent-economy verify --min-level strict
```

## Packs

Curated, attributed, pinned fetch-on-demand integrations - never vendored:

| Pack | Source | Kind |
|---|---|---|
| `karpathy-rules` | multica-ai/andrej-karpathy-skills | behavior rules |
| `matt-skills` | mattpocock/skills | engineering skills |
| `ecc-harness` | affaan-m/ECC | harness performance patterns |
| `anthropic-skills` | anthropics/skills | official skills |

```bash
ae packs --install ecc-harness   # → ~/.claude/skills (override with --dir)
```

RTK and billion-context are **runtime tools**, not packs — `ae packs` prints their setup commands, `ae inventory` shows whether they're alive. `ae` never installs them for you.

## Positioning

Token compressors optimize **bytes**; this optimizes **round-trips**. Different unit, different layer, complementary stack. The dedicated AGENTS.md-template niche is empty (existing repos: 6–41★) while the adjacent skills ecosystem measures in six figures — the lane is open.

## License

MIT
