# 0018 — Remove Find Session

- **Status:** Proposed (design accepted 2026-11-25; ships in Slice 1)
- **Date:** 2026-11-25
- **Supersedes:** [0014](0014-find-session-agent-over-native-records.md),
  [0016](0016-find-session-sources-across-harnesses.md),
  [0017](0017-opencode-find-session-source-only.md)

## Context

Find Session let one harness CLI run headlessly over every harness's own records. It was
the only Agntree feature that sent session excerpts off the machine, and the only one that
spent a model turn outside an agent session. The fork's owner chose to remove it rather
than keep it default-off, source-only, or behind a setting.

## Decision

- Delete the feature end to end: `SessionSearchService`, the Find Session view, provider,
  and commands, the four harness search files and the adapter's search/runner
  capabilities, the `agntree.sessionSearch.*` settings, the tests, fixtures, docs, site
  scene, and demo media.
- Keep ADRs 0014, 0016, and 0017 as history and mark them superseded by this record.
- Keep **Import Existing Sessions** and per-worktree session listing; neither depends on
  Find Session.
- Do not migrate the orphaned `globalState` keys, user settings, or keybindings. They are
  inert and harmless.

## Alternatives

- **Keep the feature.** Rejected: it is the one designed path for session text to leave
  the machine.
- **Default it off.** Rejected: the code, view, and privacy surface would remain.
- **Keep the sources, drop the runner.** Rejected: it still needs the search UI and the
  cross-harness readers, and no result could be produced.

## Consequences

- The fork diverges permanently from upstream on this subsystem; upstream changes to Find
  Session cannot be merged.
- `docs/privacy.md` and `docs/faq.md` need a substantive rewrite, not just link deletion:
  Find Session was the documented exception to "no session text leaves the machine".
- The harness adapter contract loses its optional search fields, and shared utilities used
  only by search (`jsonSchema`, `promptMatcher`, `scanJsonlLines`, the search half of
  `commandUtils`) are deleted.
- Old `globalState` keys, user settings, and keybindings become unknown or dangling.
