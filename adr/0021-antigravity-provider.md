# 0021 — Antigravity is a first-class agent provider

- **Status:** Proposed (design accepted 2026-11-25; ships in Slice 2)
- **Date:** 2026-11-25

## Context

Antigravity has no conversation list command and no cwd flag on its CLI. Sessions live in
SQLite summary databases, and the VS Code extension owns a workspace-scoped chat panel. A
conversation tab exposes only the `jetski-web.editor` view type, not a cascade id, so an
open tab cannot be mapped back to a session.

## Decision

- **Discovery:** read-only `sqlite3` queries against `conversation_summaries.db` under
  `~/.gemini/{antigravity,antigravity-cli,antigravity-ide}`, with JSON1; per-conversation
  databases only for detail if needed. This is the documented exception to "never read
  internal storage", which named opencode and Codex; Agntree never writes.
- **Status:** the database's run status, `not_fully_idle`, and timestamps. No hooks or
  plugins.
- **Open** an existing conversation with the runtime command
  `antigravity.openConversation(cascadeId)`; **start** a new one with
  `antigravity.startNewConversation(workspaceUri)` using the worktree's URI; fall back to
  `agy` in a terminal, and resume with `agy --conversation <id>`.
- A UI-created conversation has no chosen id; reuse the pending-UI placeholder and
  snapshot linkage to claim the new database record.
- **Tracking:** because a conversation tab exposes no cascade id, attention polls recently
  active conversations (database status RUNNING, or updated within ten minutes) for status
  transitions, and a row is marked open heuristically after Agntree opens it while a
  `jetski-web.editor` tab exists, with a TTL.
- Missing `sqlite3` or JSON1 renders an explicit unavailable state; there is no partial
  discovery.

## Alternatives

- **Wait for an official list API.** Rejected: it does not exist today.
- **Terminal-only.** Rejected: the official chat panel is the provider's primary surface.
- **Discover by opening every per-conversation database.** Rejected as the default; the
  summary database is the index.
- **Install hooks or plugins for precise status.** Rejected by
  [0022](0022-status-and-attention-without-hooks.md).

## Consequences

- The summary database schema is a compatibility surface; a schema change needs a new
  probe.
- Polling is bounded to recently active conversations.
- The official conversation tab cannot be tracked; the row's open mark is approximate.
- Antigravity has no permission or SessionEnd event, so `needs_input` and `closed` have
  blind spots.
- A Remote-SSH host needs `sqlite3` with JSON1 and the `agy` CLI.
