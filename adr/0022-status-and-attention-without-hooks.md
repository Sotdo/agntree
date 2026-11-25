# 0022 — Status and attention use native signals, not hooks

- **Status:** Proposed (design accepted 2026-11-25; ships across Slices 1–3)
- **Date:** 2026-11-25
- **Keeps:** [0006](0006-needs-you-from-agents-json.md)

## Context

Upstream rejected hooks for needs-you and reads Claude's waiting state from
`claude agents --json`. The fork's earlier hook-first design — a user-level Claude plugin
and an Antigravity plugin — is dropped in favour of the upstream mechanism. opencode v2
exposes permission requests natively; Antigravity exposes database status; Codex and Pi
expose no waiting state.

## Decision

- Keep the four row marks `working`, `done`, `closed`, and `new`. No six-state vocabulary,
  no `statusSource` field, no hook installation, and no agent-config writes.
- **Claude:** transcript tail plus `claude agents --json` (unchanged from ADR 0006).
- **opencode:** v2 only. Native permission requests feed `waitingFor` and raise **Needs
  You**; a v1 CLI shows an explicit unsupported state.
- **Antigravity:** database status and the attention policy in ADR 0021.
- **Codex and Pi:** finished notifications only; no Needs You.
- Surface handoff (terminal ↔ official UI) is allowed only while the session is idle or
  done. A running session that Agntree cannot track opens a QuickPick to copy the resume
  command or confirm a new terminal instead of resuming silently.
- Notifications keep the quiet rules: never for the focused session, waiting suppresses
  finished, at most once a minute per session, no replay after a reload.

## Alternatives

- **Install hooks.** Rejected: the fork keeps the no-config-write rule and accepts the
  blind spots.
- **Six states plus `statusSource`.** Rejected: the extra vocabulary does not change what
  the tree can show without hooks.
- **Auto-resume an untracked running session.** Rejected: it can fork a second session.

## Consequences

- Codex, Pi, and Antigravity have needs-input blind spots.
- opencode support is gated on v2.
- Antigravity needs the bounded polling described in ADR 0021.
- There is no hook install, drift, or uninstall path to maintain.
