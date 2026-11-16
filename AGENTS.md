# agent-economy

This repo follows its own dogma — the request-economy block below is the product.

<!-- agent-economy:start level=strict -->

## Request economy (metering is per request — every model round-trip bills one)

- Emit independent tool calls in PARALLEL within one round; never spread them one-per-round.
- Combine closely-related shell commands into a single call (max ~5, `;`-joined); batch related file reads into one round.
- Before running anything, check whether a result already in this session answers it; never re-run for information you already have.
- When an answer is inferable, state the assumption and proceed — do not spend a round asking a clarifying question.
- Do a task's follow-up work in the same turn; do not stop after each micro-step.
- Filter expected-large output at the source (`--oneline`, `| head -50`) so rounds stay cheap to fold.
- Avoid subagents for small lookups — each runs its own multi-request loop; use direct tools instead.

<!-- agent-economy:end -->

## Project rules

- Run `node src/cli.js verify` before committing — a release that fails its own check is not a release.
- The CLI must stay dependency-free (Node stdlib only).

## Agent skills

### Issue tracker

GitHub Issues on `markymakes-dev/agent-economy` (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root + `docs/adr/` (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.
