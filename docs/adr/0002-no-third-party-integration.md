# ADR-0002: no third-party runtime integration

Date: 2026-11-16 · Status: accepted · Supersedes the stack-health clause of ADR-0001.

## Context

Through the v0.4.0 line, `ae doctor` surfaced live health for companion tools (rtk version probe, billion-context instance discovery + `/__bili/health` fetch), and the dashboard carried an Impact view reading their counters (`rtk gain --format json`, `/__bili/stats`). This coupled agent-economy to tools a user may not run, added startup probes and a second surface to maintain, and diluted the product: a rules artifact that checks other people's binaries.

## Decision

agent-economy integrates with nothing.

- `doctor` checks only what the rules artifact assumes: opencode CLI, /goal, project + global AGENTS.md.
- The dashboard shows those setup checks and nothing else; the Impact view is removed.
- Savings measurement stays where it belongs — inside the tools themselves (`rtk gain`, the proxy's own ledger).

## Consequences

- The CLI surface is exactly: `init`, `verify`, `doctor`, `skill`, `ui`.
- Machines that don't run companion tools see no noise; machines that do are unaffected — the tools keep their own numbers.
- Re-introducing any third-party probe requires a new ADR revisiting this one.
