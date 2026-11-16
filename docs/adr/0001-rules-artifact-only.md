# ADR-0001: agent-economy manages the rules artifact only — no curation, no inventory

Date: 2026-11-16 · Status: accepted · Decides the product surface from v0.4.0 on.

## Context

Through v0.3.0 the CLI shipped four concerns: the rules artifact (init/verify), doctor, a curated third-party skill-pack installer (`ae packs` — karpathy-rules, matt-skills, ecc-harness, anthropic-skills, with pinned refs, attribution, upstream drift checks), and an agent-config inventory (`ae inventory` — every plugin/skill/MCP loaded across harnesses, with npm-cache orphan detection).

Maintenance told on the packs feature first: every upstream rename silently broke install specs, which is why `packs --check` and a weekly CI workflow existed at all. Curation was also the thinnest part of the moat — the generic `npx skills add <repo>` CLI already covers ad-hoc installation, and every curated cut invites the question "why these six and not all 66?" Inventory, meanwhile, answers an agent-hygiene question, not a request-economy one: orphan detection is useful, but it bills zero requests.

## Decision

agent-economy does one thing: **manage the request-economy rules as an idempotent AGENTS.md artifact, prove their effect, and prescribe — never install — companion stack tools.**

Concretely, from v0.4.0:

- Kept: `init`, `verify`, `doctor` (now including live stack health for rtk and billion-context), `skill`, `ui` (Health + Impact views), the agentic setup skill, CI verify.
- Removed: `packs` (registry.json, install, drift check, packs-check.yml), `inventory` (command, /api/inventory, Inventory view).

## Reasons

- **Drift is structural.** Third-party curation means forever-chasing upstream layouts. That maintenance buys the least core value.
- **The ecosystem already covers it.** Generic installers exist; a curated list on top is opinion, not capability.
- **Standing cost cuts both ways.** The project preaches request economy; every feature is surface that must be built, tested, documented, and explained — each a spend of the maintainer's own request budget. The artifact is a text file; the tool should stay nearly as small.
- **Trust boundary stays clean.** ae was already prescribe-never-install for stack tools. Removing the one place it *did* install things (pack content) makes the rule absolute: ae writes exactly one artifact.

## Consequences

- Machines with previously installed packs keep them; this decision changes the product, not the installed state.
- Stack-tool setup hints live in `ae doctor` (and the Health view).
- Re-introducing curation or inventory requires a new ADR that revisits this one.
