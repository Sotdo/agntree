# 0023 — Opening a session prefers the official UI; surface changes wait for idle

- **Status:** Proposed (design accepted 2026-11-25; ships in Slice 1)
- **Date:** 2026-11-25
- **Supersedes in part:** [0010](0010-claude-ui-handoff.md),
  [0011](0011-codex-ui-handoff.md),
  [0012](0012-session-import-and-surface-choice.md)
- **Related:** [0022](0022-status-and-attention-without-hooks.md)

## Context

Upstream's click order is: a live terminal, an open native-UI tab, then
`defaultSessionSurface` (terminal by default), then a terminal. A Claude session that
another process owns is resumed without a word, which can fork the conversation. The
fork's rule is that the agent's own extension is the owner of the model configuration and
permission UI; the terminal is the fallback (P5, Q8=A of the design round).

## Decision

- A click on an existing session opens, in order: the terminal Agntree tracks, an open
  native-UI tab, the official UI when the adapter has one and it can open this session,
  and finally a terminal resume. `agntree.defaultSessionSurface` now only chooses where a
  **new** session starts; it no longer overrides the order for clicks.
- When the harness can tell that a process outside Agntree is using the session
  (Claude's `claude agents --json`), a click offers **Copy Resume Command** or a
  confirmed **Start Another Process…** instead of resuming silently. A tracked terminal
  or an open panel is not "outside".
- Switching a session between its terminal and its panel is refused while its turn state
  is `working`; the user is told to wait for the turn to finish. An unknown turn state
  does not block the switch.
- The policy is harness-agnostic: the adapter supplies the official UI
  (`NativeUiCapability`) and, when it can, `isSessionRunning(sessionId)`.

## Alternatives

- **Keep the configured surface for clicks.** Rejected: it puts the terminal first for
  every user who never changed the default, which is the opposite of P5.
- **Resume an untracked running session after a warning that does not offer the resume
  command.** Rejected: the common case is wanting the existing process, which the command
  reaches from any terminal.
- **Refuse surface changes unless the turn state is known to be idle.** Rejected: many
  sessions have no readable state, and the rule would turn into "never switch".

## Consequences

- With the extension installed, clicking a Claude or Codex session opens its panel rather
  than resuming a terminal. **Open Session in Terminal** remains the explicit way back.
- A session running in another window or in an agent's sidebar prompts on every click
  until it is closed or the user starts a second process.
- Codex and Pi cannot report an outside process; only Claude's guard has teeth.
- `defaultSessionSurface` is still the opt-in for starting new sessions in a panel.
