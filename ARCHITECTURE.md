# Agntree architecture

This is the deep reference for how Agntree is put together. Read [`AGENTS.md`](AGENTS.md)
first for the working agreement — where a change belongs, what to investigate before
coding, testing doctrine, and the definition of done. Build and verification commands live
there too.

Decisions that are expensive to reverse, and the evidence behind them, are recorded in
[`adr/`](adr/README.md). Read the matching record before changing a subsystem's shape; this
file describes what the code does today, the ADR explains why.

## Subsystem map

This is a VS Code extension that manages CLI coding-agent sessions (Claude Code,
opencode, Codex, and Pi) across git repositories and worktrees. Harness-specific behavior
lives behind the adapter seam in `src/harnesses/`.

### Harness Adapters (`src/harnesses/`)

- **types.ts** - `HarnessAdapter`, `HarnessSession`, `SessionMetadata`, `NativeUiCapability`
- **HarnessRegistry** - installed detection (cached, one shared probe) and lookup
- **ClaudeHarness** - wraps `ClaudeSessionService` and `ClaudeAgentsService`; new chats
  choose their session ID up front, forks use `--resume … --fork-session --session-id …`,
  and live turn state comes from a transcript tail
- **OpencodeHarness** - wraps `OpencodeSessionService`; native API fork, and a move into
  the new worktree for fork-to-worktree
- **CodexHarness** - wraps `CodexAppServer` and `CodexRollout`; `thread/fork` returns a
  linked thread, live turn state comes from the rollout file
- **PiHarness** - wraps `PiSessionService`; new chats choose their ID with
  `--session-id`, forks use `--fork … --session-id …`, and live turn state comes from the
  session JSONL tail
- **claudeUi.ts** / **codexUi.ts** - each harness's `NativeUiCapability`: availability,
  opening a session or a new conversation in the agent's own VS Code extension, and the
  tab-tracking policy over the shared `NativeUiTabSurfaceService`
- **sessionUtils.ts** - Rules every harness shares: the default chat name, session keys,
  the claim rule for pending launches, the row icon state, and the last-exchange rule

`ChatSession.harness` selects the adapter everywhere (terminals, tree rows, watchers).
Adding a new agent means implementing `HarnessAdapter` and registering it in
`extension.ts`; do not add harness conditionals to commands or providers.

### Harness icons

Session rows use custom SVGs from `resources/icons/harness/`, named
`<harness>-<theme>-<state>.svg` where state is `working`, `done`, `closed`, or `new`.
`working` is the whole brand mark beating like a heartbeat (no badge — motion is the
signal, and it is the only thing that reads at 16px), `done` adds the green dot, `closed`
is the grey mark, and `new` adds a hollow ring. `selectHarnessIconState()` in
`harnesses/sessionUtils.ts` maps a chat plus its live turn state (from
`SessionAttentionService.getTurnState()`) to a state; the attention service triggers a
`softRefresh()` when a turn starts or ends. Adapters expose the files through
`HarnessAdapter.treeIcons`; every adapter ships generated marks.
Icons are generated from the base marks in `resources/icons/harness/base/` by
`npm run generate:icons` — edit the base marks and regenerate rather than editing the
generated files. The working animation uses CSS inside the SVG (`transform-box:
view-box`), which Chromium plays in tree-icon `background-image`; honor
`prefers-reduced-motion`.

### Core Services (`src/services/`)

- **StorageService** - Persists repositories, chats, stars, PR checkouts, removal tombstones, active worktrees, and terminal PIDs in `globalState`; migrates legacy `claudeSessionId` records on read
- **ManagedWorkspaceService** - Owns `~/.agntree/agntree.code-workspace`, one per host: the durable folder list of every Open Project's worktrees. Add and Remove edit the file and, when it is the open workspace, the live window through `updateWorkspaceFolders()`; Focus only reorders, writing the file first and applying the same order to the window, with the previous order restored if VS Code refuses. `utils/hostUri.ts` builds folder and workspace-file URIs with the window's authority so a Remote-SSH window never addresses the local filesystem. A malformed file is refused rather than overwritten. VS Code saves folder paths relative to the file, so every entry is resolved against the file's directory before it is compared with a worktree path.
- **GitService** - Git through argument arrays: worktrees, the Changes panel listing, discards, merges, and rebases. Local commands run synchronously; clone and fetch are async so the network never blocks the extension host
- **WorktreeCatalog** - Every worktree of every workspace root (short TTL cache) and which one owns a session: the deepest worktree containing its directory, across all roots. The importer, the Import commands, and the Codex/opencode watchers ask it, so a repository added as its own root inside another root (a `Documents` folder holding a project) keeps its sessions
- **GitHubService** - `gh` CLI: the PR badge per branch (cached, one in-flight lookup per branch), open PRs, and the local branch for a PR checkout
- **TerminalManager** - Opens terminals through the chat's adapter (`buildLaunchCommand`, resumability check, icon) and restores them after a reload or quit; `terminalEvents.ts` holds the title format and the bounded waits on VS Code's terminal events
- **NativeUiTabSurfaceService** - Maps agent-UI editor tabs to native session IDs and follows focus; each harness supplies the policy (see `claudeUi.ts` / `codexUi.ts`)
- **ClaudeSessionService** - Discovers Claude Code sessions under `<configDir>/projects/`,
  parses the lean metadata surface (summary, preview, last exchange, last activity, turn
  state, `hasMessages`) and resolves session IDs to transcript paths; repository-wide
  session listing via `findSessionsForRepository()`
- **ClaudeAgentsService** - Caches `claude agents --json` for 10s (sharing one in-flight
  call), merges duplicate session IDs, and supplies `waitingFor` to the attention path.
  Disabled when `agntree.notifications.onNeedsInput` is off; a failure logs once and
  disables the interface until restart.
- **ClaudeTurnState** - Claude's turn-state derivation and scan over the shared progressive
  tail reader in `utils/jsonlTail.ts`; it reads 16 KB, then grows 4× until the deciding
  entries are found or the window reaches the start of the file. Pi's live-state path uses
  the same reader.
- **OpencodeSessionService** - Talks to opencode v2 via its CLI (`opencode api session.*`, `opencode session export`), never its SQLite database
- **CodexAppServer** - Lazy, private `codex app-server --listen stdio://` JSON-RPC client with request matching, timeouts, restart on exit, and idle shutdown
- **CodexRollout** - Folds `~/.codex/sessions/**/*.jsonl` into live turn state and message counts for TUI-owned threads, through the shared incremental reader
- **JsonlAppendReader** (`utils/jsonlAppendReader.ts`) - Shared incremental reader for append-only JSONL: each file's folded state is kept with the byte offset it consumed, so a later read decodes only appended bytes. A file that shrank, or whose first line changed when the caller asks for that check, is read again from the start; reads of one path share an in-flight request; entries are evicted least recently used. Codex rollouts and Pi records use it
- **PiSessionService** - Discovers Pi records under `<agentDir>/sessions/` (honoring
  `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, and the `sessionDir` setting),
  parses the documented JSONL format for names, previews, and turn state, and
  resolves a session ID to its record. Records are read incrementally through
  `JsonlAppendReader`, and the ID → path catalog remembers a miss (`RecordPathCatalog` in
  `utils/recordCache.ts`, shared with Claude)
- **OperationLog** - Append-only audit trail (`Agntree Operations` output channel) for destructive file and worktree operations
- **SessionAttentionService** - Polls chats with open terminals (~4s) through
  `HarnessAdapter.getLiveStates()` when the adapter implements it, otherwise through
  `listSessionsForWorktree()`; notifies on a finished turn or a non-empty `waitingFor`
- **NotificationService** - Delivers the VS Code notification (with an Open action) and, on macOS while the window is unfocused, an `osascript` banner. Skips the session you are already typing in
- **PendingSessionWatcher** - Shared polling loop for harnesses whose native session ID is assigned in a separate process: snapshot, claim the oldest unseen session, TTL, and auto-naming. Subclasses supply the harness and naming hooks
- **ExactIdSessionWatcher** - Shared linkage loop for a harness where Agntree chooses the
  session ID: watch the harness's roots and directory for the chosen ID, enforce the TTL
  for closed chats, and auto-name from the harness record. Claude and Pi supply only the
  directory policy, the file-name-to-ID rule, and their service. A pending chat restored
  from storage rather than registered by a launch takes its worktree from the worktree
  catalog when the harness is given one, so its lookups stay scoped to that worktree
- **ClaudeSessionWatcher** / **PiSessionWatcher** - Exact-ID linkage through
  `ExactIdSessionWatcher`; Claude watches `<configDir>/projects` and requires a transcript
  with a message, while Pi watches `<agentDir>/sessions` and links the record that
  `--session-id` names
- **OpencodeSessionWatcher** / **CodexSessionWatcher** - Harnesses that assign their own
  IDs extend `PendingSessionWatcher` to claim the oldest new session in the worktree and
  auto-name it
- **SessionImportService** - Reconciles the stored chats with native sessions that no watcher owns: links a chat started in an agent's VS Code UI, imports recent sessions started outside Agntree, keeps harness-assigned names current, and ages out quiet rows. Bounded scans, retention, and removal tombstones live here
- **HarnessWatcherRegistry** - Dispatches pending-chat registration and name events by `chat.harness`

### Tree Providers (`src/providers/`)

- **WorkspacesTreeProvider** - Main sidebar tree: Repository → Worktree → Session hierarchy, with a plain folder standing in for a repository that has no worktrees of its own. Quiet by design: session rows show only a short relative time (`16m`, `2h`, `3d`) or `new`, a star, and the harness mark; the tooltip carries the session brief (last exchange, then message count/model/agent, skipping fields the harness does not provide — Claude supplies only summary, last exchange, and last activity). A harness whose previews are `lazy` (opencode) gets no tooltip at render time; `resolveTreeItem` fetches its preview when the row is hovered, so a render never starts an export and the adapter's own cache keeps hovering cheap. Session rows keep one stable order: newest first by `createdAt`. Opening, resuming, or starring a chat changes its mark and description but never its position, so the list does not jump under the cursor. Repository icons are neutral — `repo` for a git repository, `folder` for a plain folder; worktree color marks state only — amber for the focused worktree, blue for a PR checkout, green for the main worktree, neutral otherwise. A Project that is not in the managed workspace says `not in workspace`; the focused worktree comes from the per-workspace id `extension.ts` persists in `prepareWorktree()`, not from `workspaceFolders[0]`. Worktrees show `↑n`/`↓n` ahead/behind from `GitService.getAheadBehind()` (15s cache). Repository rows follow the stored array order; **Move Up** / **Move Down** swap a row with its nearest visible neighbor, so the order needs no field of its own. A git Project also gets a collapsed, read-only **Branches** group after its worktrees: local branches from `GitService.getLocalBranches()` (15s cache, no remote-tracking refs), each mapped to the worktree that checks it out, with detached worktrees shown as their short `HEAD` commit from the porcelain listing. Rows without a worktree are drawn in `disabledForeground` and do nothing; a row with one focuses that worktree through the same selection path as a worktree row.
The Changes and All Files panels show one worktree at a time. `extension.ts` owns that
choice (`showWorktree()`) and one file watcher on the shown worktree that refreshes both
panels.

- **ChangesTreeProvider** - Shows staged/unstaged git changes for the active worktree. `GitService` lists each section with one `git diff -z --name-status` and one `--numstat` call (plus `ls-files` for untracked files), so the cost does not grow with the number of changed files; `--no-renames` lists a rename as the deletion and addition that stage, unstage, and discard act on. Section headers use a green check (staged) or yellow edit icon plus `n files · +a -d`; nested rows show their directory (`src/utils · M +2 -1`) because the list is flat; rows sort by status then path. A plain folder shows “Not a git repository” instead of a clean-tree message.
- **FilesTreeProvider** - All Files browser for the active worktree. Directories sort first, names sort naturally, rows tooltip their worktree-relative path, and an unselected panel returns a placeholder row.

### Commands (`src/commands/`)

Commands are registered in `package.json` under `contributes.commands` and implemented in:
- `repository.ts` - Add (with an explicit `git init` for a folder that is not a repository), remove, and clone Projects, reorder them, and manage workspace membership (**Add Project to Workspace**, **Remove Project from Workspace**, **Open Managed Workspace**)
- `worktree.ts` - Create/delete worktrees, merge branches, open in new window, checkout PRs. Merge, rebase, delete, fork-with-changes (in `chat.ts`), and PR checkout confirm with the branch, worktree, uncommitted-file count, and open session count, and log the outcome ([ADR 0024](adr/0024-preflights-and-trash-delete.md))
- `chat.ts` - Create/open/rename/delete/fork/star sessions and hand them between the terminal and an agent's VS Code UI. Per-harness commands (`agntree.new<Harness>Chat`, its `InTerminal`/`InUi` variants, and `agntree.open<Harness>Ui`) are registered from the harness registry, so this file names no harness.
- `sessionImport.ts` - **Import Existing Sessions** for one worktree
- `changes.ts` - Changes panel actions: diffs, stage/unstage, discard, and the rebase controls
- `files.ts` - All Files panel actions
- `common.ts` - Helpers the command modules share: command registration, progress, the worktree picker, the new-branch prompt, the default worktree path, and importing a native session as a row

### Data Flow

1. User adds a folder or repository → stored in globalState
2. GitService detects worktrees via `git worktree list --porcelain`; a plain folder is reported as its own single worktree
3. User runs "New Claude Code Session", "New opencode Session", "New Codex Session", or "New Pi Session" → `createSession()` creates a chat with that harness, registers it with the matching watcher, and opens a terminal (`claude`, `opencode`, `codex`, or `pi`). Claude and Pi chats choose a UUID first and launch with `--session-id <uuid>`.
4. The watcher links the chat to the native session ID when the harness creates it; Claude and Pi already know the expected ID and wait for that exact record
5. Resume, fork, and previews dispatch through `registry.get(chat.harness)`

Forks are named with numeric suffixes by `nextForkName()` in `src/utils/text.ts`:
forking `Fix icons` creates `Fix icons (1)`, and forking that creates
`Fix icons (1) (1)`; sibling forks increment until the name is unique in the target
worktree. There is no `Fork of …` prefix.

### Key Types (`src/types.ts`)

- `Repository` - Workspace root (a git repository or a plain folder) with name and root path
- `Worktree` - Branch checked out in a directory
- `ChatSession` - `harness` + `harnessSessionId` for resume/fork in the owning harness,
  plus `pendingHarnessSessionId` and `forkedFromSessionId` while a Claude launch has not
  produced a transcript yet

## Claude Code Sessions

Claude Code 2.1.310 or newer is required. There is no version probe or legacy path: an
older CLI is unsupported and surfaces its own error when launched. Agntree uses the
`claude` CLI, its transcripts, and `claude agents --json`; it never edits
`~/.claude/settings.json`.

Sessions are stored in `<configDir>/projects/<encoded-path>/<session-id>.jsonl`, where
`<configDir>` is `CLAUDE_CONFIG_DIR` or `~/.claude`. `CLAUDE_CODE_PROJECT_DIR_NAME`, when
set together with an explicit `CLAUDE_CONFIG_DIR`, adds a project directory under
`<configDir>/projects`; without the config dir it is ignored, matching Claude.

`ClaudeSessionService` parses transcripts for discovery, naming, previews, the last
exchange, last activity, turn state, and `hasMessages` (used by `isSessionResumable`). A
`relocated` entry's `relocatedCwd` replaces the cwd stamped on earlier entries, because a
moved session's transcript can stay in its old project dir. The surface is deliberately
lean: recap (`away_summary`), usage metrics, `gitBranch`, and message count are not
extracted; `HarnessSession` reports `gitBranch: null`, `messageCount: 0`, and omits the
model.

### Path Encoding

Every character outside `[A-Za-z0-9]` becomes `-`:

- `/Users/dev/my-project` → `-Users-dev-my-project`

Encoding runs on the physical, NFC-normalized path (`canonicalPath`), so a worktree opened
through a symlink resolves to the same project directory Claude writes. Directories longer
than 200 encoded characters truncate to the first 200 and append a hash Claude does not
document. Discovery matches the 200-character prefix (`claudeProjectDirMatches`) and
verifies each session's `cwd` with `isWithin`, which disambiguates paths that share the
prefix. If the same session ID appears in more than one project directory (a relocated
session), discovery keeps the newest transcript.

### New sessions and pending IDs

A transcript appears only after the first prompt. `createSession()` generates a UUID,
persists it as `ChatSession.pendingHarnessSessionId`, registers the chat with
`ClaudeSessionWatcher`, and launches `claude --session-id <uuid>`. Pending chats are
derived from stored chats on each check, so there is no second pending map to keep in
sync. The watcher checks immediately and every 5s while any remain, matching
`<id>.jsonl` by exact basename anywhere under `<configDir>/projects`; a project-dir watch
event links the named transcript directly, with the poll as the fallback. The in-memory
pending-ID set gates those events, so appends to already-linked transcripts do no storage
work. A transcript with no messages is not linked yet (it cannot be resumed); the chat
keeps its pending ID until the first prompt. A pending chat whose terminal is closed and
whose transcript never gains messages stops being polled after 5 minutes. There is no
snapshot, claim-the-newest rule, or directory matching. On a match it sets
`harnessSessionId`, clears `pendingHarnessSessionId`, and starts the name monitor. A chat
closed before the first prompt keeps its pending ID and reopens with the same
`--session-id`. A pre-change chat with neither ID gets one when it is opened *and a
terminal is actually launched*; focusing an existing terminal mints nothing. That
migration is temporary (see `ROADMAP.md`).

### Forks

`forkSession()` and `prepareForkToNewWorktree()` validate that the source transcript is
still resumable before generating a new UUID and returning
`{ kind: 'terminal', pendingSessionId }`; nothing is copied. The terminal runs
`claude --resume <source> --fork-session --session-id <new>`, which writes the fork
transcript in the destination `cwd`. The watcher links the new ID when the first prompt
creates the transcript, so the chat stores `forkedFromSessionId` until then. Claude writes
nothing before that prompt: reopening such a fork repeats the command against the source's
current state, not the state it was forked from. Closing the terminal before the first
prompt therefore drops the chat (`TerminalManager.dropUnusedFork()`) instead of leaving a
row that would silently fork from a later point. Once the transcript exists, the pending ID
is resumable, so reopening resumes it rather than forking again.

### Live turn state

`ClaudeHarness.getLiveStates()` resolves each session ID to its transcript through a
cached ID → path catalog (a miss is remembered for 30s so a session whose transcript has
not appeared does not rescan every project dir), then `readTurnStateTail()` reads the end
of the file: 16 KB, then 64 KB, 256 KB, 1 MB, … until the deciding entries appear or the
window reaches the start of the file. `ClaudeSessionService` caches the reading by
mtime+size, so the 4-second attention tick only re-reads transcripts that changed. It
tracks the latest `turn_duration` (`pendingBackgroundAgentCount`) and the last
non-sidechain user/assistant entry. A user entry, a `tool_use`/null stop reason, or a
positive pending count means working; any other assistant stop reason with zero pending
means done, with `turnEndedAt` from that entry. `agents --json` is process-level, so it only
supplies `waitingFor`; it cannot replace the transcript for turn state. The priming tick
seeds both `waitingFor` and the turn-end baseline, so a state that predates the extension
host starts silently.


### Opening in the Claude Code extension UI

`agntree.openClaudeUi` is an explicit handoff for an existing Claude session. It resolves the native ID, verifies the transcript exists, and calls `ClaudeHarness.nativeUi.openSession()` (`ClaudeUi` in `src/harnesses/claudeUi.ts`). The extension UI runs in the first VS Code workspace folder. Before the availability check, the command calls `prepareWorktree()` (panels, persisted Focus, `ManagedWorkspaceService.reorderToFirst()`), so a worktree that is in the managed workspace becomes the first folder and the check passes. A worktree outside the managed workspace, or a window that is not the managed workspace, still gets `workspace-mismatch` and the command offers to open that worktree in a new window; the reorder never changes the folder set. The extension and folder are checked before a running terminal is touched; only then is the terminal disposed after confirmation, and the command waits for its close event before handing over, so two processes never share one session.

The service prefers the extension command `claude-vscode.editor.open` with `ViewColumn.Active` and `{ programmatic: 'honor-preferred-location' }`, which respects `claudeCode.preferredLocation` and opens where the session's terminal or the user's files are. Without a column, the extension creates a new right-hand editor group and may lock it. If the command is not registered it uses the documented `vscode://anthropic.claude-code/open?session=…` URI. A failing command is reported rather than falling back, because the URI starts a fresh conversation when the session is not found.

`claudeUiSurfaces()` is the Claude policy over the shared
`NativeUiTabSurfaceService`. It maps the Claude webview tabs that Agntree opened
to their native session IDs. The tab carries the session title, not the ID, so
the command registers an expectation before opening and the tracker binds the
next Claude tab (or the active one after the command resolves). Only a command
may bind the active tab by position; a link made in the background passes
`allowActiveFallback: false` and binds only a tab whose title matches the
session name, because the active tab may be another conversation. `isOpen()`
reads the mapped tabs only — the constructor seeds restored tabs and
`onDidChangeTabs` maps each new one — since the tree calls it once per row per
render. A chat is open when it has a live terminal or a mapped UI tab; the tree
uses `isOpen()` for the active mark, and the attention service polls UI chats
for turn state. Editor-tab focus selects the matching chat: a terminal tab
resolves through `activeTerminal` or its title, and a native-UI tab resolves
through the adapter's tracker and the session ID. The title fallback is what
selects the CLI chat when focus returns from a Claude tab even though
`activeTerminal` did not change. The mapping is in-memory and only covers tabs
Agntree opened; a Claude tab restored after a reload or opened directly from the
extension is not mapped. Clicking the chat's tree row resolves the same native
session IDs: an open UI tab is revealed instead of launching a CLI, while a live
terminal still takes precedence.

`NativeUiCapability.openNewSession()` creates a new conversation. `ClaudeUi`
calls the same `claude-vscode.editor.open` command with no session and
no prompt, so the extension assigns the session ID and writes the transcript
on the first prompt. `agntree.newClaudeChatInUi` creates the placeholder chat
first, takes a session snapshot, opens the conversation, and leaves
`pendingUiLaunch` on the chat. `SessionImportService` links the first new
native session in that worktree to the placeholder and clears the flag. The
same first-folder rule applies: the extension always starts the conversation
in the first VS Code folder. See
[ADR 0010](adr/0010-claude-ui-handoff.md) and
[ADR 0012](adr/0012-session-import-and-surface-choice.md).

## opencode Sessions

opencode v2 stores sessions in `~/.local/share/opencode/opencode.db` (SQLite). **Never read that database directly.** `OpencodeSessionService` goes through the CLI:

- Discovery: `opencode api session.list --param limit=… [--param directory=…]` (paginated; filter out `parentID` children)
- Lookup / resume check: `opencode api session.get --param sessionID=<id>`
- Fork: `opencode api session.fork --param sessionID=<id> --data '{}'` → new top-level `ses_…` ID
- Move: `opencode api session.move --param sessionID=<id> --data '{"directory":"<abs path>"}'`
- Previews: `opencode session export <id>`, parsed for user messages; cached in-memory (LRU, 5 min)
- Resume in terminal: `opencode --session <id>`; new session: `opencode`

`opencode session export` truncates large JSON when stdout is a pipe. `execToFile()` works around this by redirecting stdout to a temp file before parsing. Keep list pages small for the same reason.

Forking to a new worktree uses the native fork + move path (`prepareForkToNewWorktree()`); on a move failure the orphan fork is deleted best-effort.

`OpencodeSessionWatcher` polls `session.list` (bypassing the cache) every 3s while chats are pending, claims the oldest new top-level session in the worktree, links it, and renames the chat from the title (falling back to the first prompt after 30s). It gives up after 5 minutes. The poll/claim/TTL rules live in `PendingSessionWatcher`, which the Codex watcher shares.

The opencode command is configurable via `agntree.harnessCommands.opencode` (default `opencode`). Prefer `opencode api …` over the TUI/`--fork` flags; `--fork` exists only on `opencode run`, not the TUI.

## Codex Sessions

Codex threads are discovered through the Codex app-server; never read its state database
directly. `CodexAppServer` starts a private `codex app-server --listen stdio://` lazily,
performs one `initialize` + `initialized` handshake, and stops it after an idle period.
The transport is newline-delimited JSON-RPC with per-request timeouts.

- Discovery: `thread/list { useStateDbOnly: true, limit, cursor, sortDirection }`.
  **Always** pass `useStateDbOnly: true`; the default scan-and-repair path is slower,
  returns duplicates, and can block pagination. Filter to `!ephemeral &&
  !parentThreadId` and `isWithin(thread.cwd, worktreePath)`.
- Read: `thread/read { threadId, includeTurns: false }` works even for legacy threads
  missing from `thread/list`.
- Previews/metadata: `thread/items/list` (newest-first with `sortDirection: "desc"`).
  `userMessage.content` is an array of `UserInput` blocks; `agentMessage.text` is text.
- Resume: `codex resume <id> --cd <worktree>`; terminal fork fallback:
  `codex fork <id> --cd <worktree>`.
- Fork: `thread/fork { threadId, cwd, excludeTurns: true }` returns `result.thread.id`
  synchronously and materializes the fork in `cwd`. Both fork paths return
  `{ kind: 'linked' }`; the client then calls `thread/unsubscribe` so the app-server
  unloads the fork and releases its writer lock. The private server starts with
  `thread_unload_delay_secs=0`; without that, a terminal opening the fork immediately
  reports the conversation as already open in another app. There is no move or orphan
  cleanup.
- New sessions: `thread/start` does not materialize a thread until the first user
  message, so a separate `codex resume` cannot open it. New chats launch `codex` in a
  terminal; `CodexSessionWatcher` polls for the first new thread in the worktree (3s,
  5-minute TTL) and renames the chat from the thread name or first prompt. A new chat
  started in the Codex UI uses `chatgpt.newCodexPanel` instead; the same first-prompt rule
  applies, and `SessionImportService` links the placeholder when `thread/list` first shows
  the thread.
- Live turn state: `thread/list` reports `status.type = "notLoaded"` for TUI-owned
  threads. `CodexRollout` reads the latest rollout incrementally and uses the last
  `task_started` / `task_complete` / `turn_aborted` event. `thread/items/list` remains
  authoritative for content; the rollout is only for live state.
- Archived threads are excluded by default. `.zst` rollouts are skipped for live state;
  app-server content still works.
- The protocol is experimental. Surface unknown-method errors from the app-server instead
  of guessing, and assume the binary version can change between sessions.
- The shared user daemon (`codex app-server daemon` + `codex app-server proxy --sock`) is
  native to Codex but deferred; see `ROADMAP.md`.

### Opening in the Codex extension UI

`agntree.openCodexUi` hands an existing Codex thread to the `openai.chatgpt`
extension's conversation panel. The extension's sidebar deep link does not create an
editor tab, so it carries neither an exact thread identity nor the active-group placement;
the panel is the surface its own `chatgpt.newCodexPanel` command opens. `CodexUi`
(`src/harnesses/codexUi.ts`) opens `openai-codex://route/local/<threadId>` with `vscode.openWith` and the
`chatgpt.conversationEditor` view type, in `ViewColumn.Active`, focused and without
preview. That URI is the resource the extension's chat-session provider uses for a
thread and the route its `resolveCustomEditor` turns into the thread's `initialRoute`. A
failed open is reported; there is no fallback that starts a new chat.

A Codex thread keeps its own cwd and the panel resumes it there, so unlike the Claude UI
there is no first-workspace-folder guard. The running terminal is still closed first,
after confirmation: the Codex app-server refuses to resume a thread with another live
writer, and the panel would otherwise fail.

`codexUiSurfaces()` recognizes `TabInputCustom` tabs with view type
`chatgpt.conversationEditor` and parses `openai-codex://route/(local|remote)/<id>`.
Because the tab carries the thread ID, restored panels and panels opened directly in the
Codex extension are mapped too; a thread with no Agntree chat is ignored. Clicking a
chat's tree row checks that map first, so an open panel is revealed with the same
`vscode.openWith` call instead of starting a CLI. The Codex sidebar view is not an editor
tab and is not tracked. Both harnesses share `NativeUiTabSurfaceService`: the Claude
policy binds a tab by expectation and label, while the Codex policy reads the exact ID.
See [ADR 0011](adr/0011-codex-ui-handoff.md).

A new Codex conversation is different from an existing panel. `chatgpt.newCodexPanel`
opens `/extension/panel/new`, and the extension's workspace project comes from the VS
Code workspace folders, not from a per-panel cwd. `CodexUi.checkNewSessionAvailability()`
therefore requires the worktree to be the **only** workspace folder; a multi-root window
gets `workspace-multi-root`, and another folder gets `workspace-mismatch`. When it is
available, `agntree.newCodexChatInUi` creates the placeholder and `SessionImportService`
links the first new thread in that worktree after the first prompt. `thread/start` cannot
do this itself: an empty thread is readable only while the creating app-server is alive
and has no rollout to resume after it exits.

## Pi Sessions

Pi stores each conversation as an append-only JSONL record under
`~/.pi/agent/sessions/--<encoded-cwd>--/<timestamp>_<id>.jsonl`. The format is documented
in Pi's `docs/session-format.md` (version 3); Agntree parses it directly, like Claude's
transcripts, because importing the installed package would couple the extension to a
private install path. Pi has no state database to read.

- **Discovery**: `<agentDir>/sessions/<encoded cwd>`, where `<agentDir>` is
  `PI_CODING_AGENT_DIR` or `~/.pi/agent`. `PI_CODING_AGENT_SESSION_DIR` and the
  `sessionDir` setting replace the per-cwd layout with one flat directory; both are
  honored, including a relative project setting resolved from the session's cwd. Because
  Pi reads project settings only from its process cwd, discovery scans the default layout
  as well, so a session started in a subdirectory while the worktree's setting was in
  effect is still found. A `sessionDir` set only in a subdirectory's own
  `.pi/settings.json` is not discoverable without walking the worktree; see
  `ROADMAP.md`. Agntree does not inspect a `--session-dir` added by a wrapper command; use
  the environment variable or setting instead. Records are filtered by their header's
  `cwd` before they are parsed, so a lossy encoded directory name cannot place a session
  in the wrong worktree, and a flat directory shared by every project parses only the
  requested worktrees' records. Headers are cached by path, because Pi never rewrites one.
- **Identity**: the header's `id`; `<timestamp>_<id>` is an index only. Pi writes no file
  until the first user message, and `--session-id <uuid>` creates it when that message
  arrives, so a new chat links the exact chosen ID.
- **Resume / create / fork**: `pi --session <record path>` (falling back to the ID when
  the record is not found), `pi --session-id <id>`, and
  `pi --fork <source> --session-id <new>`. The path form resumes in the cwd recorded in
  the header; a bare ID is resolved only against the launch directory's project, so a
  session started in a subdirectory would look like a session from another project and Pi
  would offer to fork. `--fork` writes the new record (with `parentSession` pointing at
  the source) in the launch directory immediately; nothing is moved afterwards.
- **Previews / metadata**: one parse supplies the latest `session_info` name (falling back
  to the first prompt, truncated), the last three prompts, last reply, message count,
  selected model, and turn state. Records are read incrementally: a later
  read folds only the entries appended since, so a long session is not re-read on every
  change. Pi appends every entry and rewrites a record in place only to migrate an older
  format version, which rewrites the header line, so a changed first line (or a shorter
  file) means the record is read again from the start (checked against pi-coding-agent
  1.5.2). Entries are read in file order rather than by walking `id`/`parentId`: a normal
  append follows the active leaf and names match Pi's own session list, but a `/tree`
  branch switch is not reconstructed.
- **Turn state**: the last `message` entry. A user or tool-result entry, or an assistant
  entry with `stopReason: "toolUse"`, means working. Any other assistant stop reason
  (`stop`, `length`, `error`, `aborted`, `deferred`) ends the turn. The attention tick
  reads only the tail through `readJsonlTail`, the same reader Claude uses. This is the
  last persisted fact, not Pi's `agent_settled`: automatic retry, queued follow-ups, and
  compaction are events rather than session entries, so a failed attempt can briefly look
  finished.

Pi's RPC mode exposes richer events, including `agent_settled`, but only to the process that
starts Pi. The decision to observe the transcript instead is recorded in
[ADR 0015](adr/0015-pi-sessions-from-transcript.md).

`PiSessionWatcher` extends `ExactIdSessionWatcher`: it watches the sessions root and the
pending worktree's encoded directories, links the chosen ID when the record appears, and
names the chat from the latest `session_info` or first prompt.

Pi exposes no "needs you" signal, so notifications cover finished turns only. Find
Session for Pi is deferred (see `ROADMAP.md`).

## Session Import, Naming, and Retention

`SessionImportService` is the second half of session linkage. The per-harness watchers
remain the fast, exact path for a session Agntree launches: Claude and Pi match their
chosen pending ID, and Codex/opencode claim the oldest new session. The importer covers
the two cases no watcher owns:

- **A chat started in an agent's VS Code UI.** The extension assigns the ID, so the chat
  carries `pendingUiLaunch` and no native ID. The command snapshots the worktree's
  sessions before opening the conversation, and the importer links the first session that
  appears afterwards. The snapshot is what keeps an older session in the same worktree
  from being claimed; it is also stored on the chat (`pendingUiKnownSessionIds`, newest
  first and capped) so a reload between the launch and the first prompt cannot re-open
  that gap, and it is cleared when the chat links or the launch is cancelled. If the user
  opens the placeholder in a terminal instead, the flag is cleared and the expectation
  canceled.
- **A session started outside Agntree.** The importer lists native sessions for each
  visible repository/worktree, skips any ID already linked, pending, or removed, and
  imports recent ones as `autoImported` chats. It reserves sessions that an unlinked CLI
  placeholder is about to claim, using the same claim rule as the watchers, so it cannot
  create a duplicate before that chat's watcher runs. Only a placeholder created within a
  day reserves: a chat that never produced a session must not keep a new session out of
  the tree.

A harness lists a directory's sessions together with those of its subdirectories, so
when workspace roots nest, the outer root's listing includes the inner root's sessions.
Every session goes to the worktree `WorktreeCatalog` names as its owner, and a linked row
found under another worktree than its session's owner moves there (keeping its name and
star) unless its terminal or tab is open.

Naming uses `HarnessSession.summary`, which each adapter maps from the harness's own
session name: Claude's `ai-title` entries (a summary entry and then the first prompt are
fallbacks), Codex's thread name (preview fallback), opencode's title, and Pi's latest
`session_info` name (first prompt fallback). A linked chat
whose name is still automatic follows the harness name; the user's **Rename Session**
sets `customName`, which stops further automatic renames.

Retention is based on the later of the native session's last activity and the chat's
`lastAccessedAt`. Every row, whether Agntree started it or the importer created it, is
removed from Agntree after `agntree.autoImport.retentionDays` (default 15) quiet days; the
native session is untouched. A star is the only user-controlled exemption, and a chat open
in a terminal or native-UI tab is kept while it is open. A chat with no linked session ages
out by its own `lastAccessedAt`. Retention is not a tombstone, so a session that becomes
active again can return; a manual import starts a fresh window. A session the user removes
from the list is tombstoned (`STORAGE_KEYS.REMOVED_SESSIONS`, pruned after 90 days and
capped at 500), so the next scan cannot resurrect it; a manual import clears the tombstone.

The importer scans every 3 seconds while a UI placeholder is in its first five minutes,
then every 2 minutes while auto-import is enabled, and stops when auto-import is disabled
and no placeholder is waiting. A fast scan lists only the worktree whose placeholder is
linking; imports, renames, and retention run on the full scan.
`agntree.autoImport.enabled` only controls outside sessions and retention; a UI
placeholder is always linked.

A scan is skipped entirely while the Agntree view is hidden and nothing is waiting to
link (`isVisible`), so an idle window spawns no harness process; becoming visible wakes
it. The worktree list is cached for 15 seconds because listing it is one synchronous git
call per repository and the hot scan runs every few seconds, and activation reads the
worktrees only when a chat is actually waiting for a UI session.

### Choosing a session's surface

A row click resolves in this order: a tracked terminal is focused, an open native-UI tab
is revealed, a pending UI placeholder explains that its session is still starting, a
session the harness reports running outside Agntree gets a QuickPick (**Copy Resume
Command** or a confirmed **Start Another Process…**), the official UI is used when
`NativeUiCapability.checkAvailability()` allows it, and otherwise the terminal opens.
`agntree.defaultSessionSurface` now only chooses where a **new** session starts; it is
read when a session is created, not per click. **Show Starred Sessions** and **Go to Next
Session That Needs You** resolve through the same helper, so none of them can start a CLI
beside an open panel. An unavailable extension or another workspace folder falls back to
the terminal; the explicit UI commands explain the reason instead. **Open Session in
Terminal** is the reverse handoff: if the session is open in its UI tab, it confirms and
calls the tracker's `closeSurface()` before launching the CLI, because two agent
processes must not share one session.

Both directions are refused while `SessionAttentionService.getTurnState(chat.id)` is
`working` (an unknown state does not block), so a surface change cannot kill a running
turn. The running-elsewhere check is `HarnessAdapter.isSessionRunning?()`; Claude answers
from `claude agents --json` (with `ignoreEnabled` so turning off needs-input
notifications does not disable the guard), and the other harnesses have no answer.

`NativeUiCapability` owns the surface rules: `checkAvailability()` for an existing
session, `checkNewSessionAvailability()` for a new one (Claude's first folder; Codex's
single-folder workspace), `openSession()` for an existing session, and
`openNewSession()` for a new conversation. Menus stay harness-agnostic through
`contextValueSuffix`; the UI entries are visible even when the extension is missing, and
`extensionId` lets the explanation offer **Find Extension**.

## Session Notifications

`SessionAttentionService` decides *when* to notify; `NotificationService` decides *how*.

- **Turn state lives on the adapter.** `HarnessSession.turnState` is `done` when Claude's last
  non-sidechain entry is an assistant message with a stop reason other than `tool_use`
  (a `user` entry may be a tool result, so it means working), when opencode reports
  `time.idle >= time.updated`, when Codex's latest rollout event is `task_complete`
  or `turn_aborted`, or when Pi's last `message` entry is an assistant message with a
  terminal stop reason. Do not add harness conditionals to the attention service. Claude's
  and Pi's attention paths read only the record tail; each harness's full parser and tail
  reader share one derivation so they cannot drift.
- **Background agents keep a Claude session working.** A subagent launched with the async
  shape returns "Async agent launched successfully" and the parent may end its turn while it
  runs. The authoritative signal is the `turn_duration` system entry Claude writes at every
  turn end: `pendingBackgroundAgentCount` is present only while agents run, so its absence
  means zero. There is no fallback for transcripts that predate that field.
- **"Needs you" comes from `claude agents --json`.** `ClaudeAgentsService` reads the
  process-level `status` and `waitingFor` for active sessions, cached for 10s. When
  `agntree.notifications.onNeedsInput` is off it returns nothing without spawning the CLI.
  Claude-only today: opencode, Codex, and Pi expose no pending-permission state through
  their implementations. `waitingFor` is passed to the notifier as-is; `status: waiting`
  without a reason becomes `input needed`.
- **No spam.** Notifications are skipped for the terminal you are looking at, re-armed by the
  next prompt, and rate-limited to one "needs you" per session per minute. A waiting
  session suppresses its turn-end notification.
- **Needs-you queue.** The same tick records when an open chat finished a turn or began
  waiting while the user was not looking at it (`sessionsNeedingYou()`, oldest first). An
  entry goes when the chat is visited (`activateChat` or a row selection calls
  `markSeen`), the agent starts working again, or the chat closes, so the queue is bounded
  by the open chats and is not persisted. **Go to Next Session That Needs You**
  (`agntree.openNextSessionNeedingYou`) opens its head through the same path as a row
  click. It does not depend on the notification settings, except that waiting reasons are
  only read while `agntree.notifications.onNeedsInput` is on.

## Destructive Operations

Deletion is narrow by design; the rules are in
[`AGENTS.md`](AGENTS.md#non-negotiables). This is where each guard lives:

- File operations in `commands/files.ts` use `isWithin` / `isStrictlyWithin` from
  `utils/paths.ts`, validate names to one path segment, and delete through
  `vscode.workspace.fs.delete(..., { useTrash: true })`.
- Creating or pasting never overwrites: `writeFile`/`rename`/`copy` use `overwrite: false`
  (or an explicit existence check) so a stale tree cannot truncate a file.
- `GitService` runs git with argument arrays (no shell) and never runs a command with
  interpolated user input.
- `GitService.forceRemoveWorktree()` is the only recursive Node delete, and it is reached only after the Trash and `git worktree remove` both fail. It refuses the filesystem root, the repository, the user's home, ancestors of those, and any path git does not list as a worktree.
- Deleting a worktree moves its directory to the Trash
  (`vscode.workspace.fs.delete(..., { useTrash: true })`) and then runs `git worktree prune`;
  only a host without a usable Trash falls back to `GitService.removeWorktree()`, and the
  success message and operation log say the delete was permanent. The confirmation names
  the branch, the uncommitted-file count, and the open agent sessions
  ([ADR 0024](adr/0024-preflights-and-trash-delete.md)).
- Deleting a worktree removes its session rows (closing their terminals) without
  tombstones, and removing a workspace root does the same for each of its worktrees, so
  re-adding the folder can import the sessions again. The confirmation says so
  ([ADR 0013](adr/0013-rows-leave-with-their-worktree.md)).
- User-triggered destructive actions and refusals are recorded with `logOperation()`.

## Dynamic View Titles

The Changes and All Files panels show the active worktree and repository in their titles (e.g., "Changes (feature-branch ~ my-repo)"). `showWorktree()` in `extension.ts` sets them whenever the shown worktree changes.

## Worktree Management

### Worktree Path Convention

Every new worktree (Create Worktree, PR checkout, and the default for Fork to New
Worktree) goes in a dedicated folder beside the repository, from `defaultWorktreePath()` in
`commands/common.ts`:
```
/path/to/my-repo/                    # main repository
/path/to/my-repo-worktrees/          # dedicated worktrees folder
  ├── feature-login/                 # worktree for feature/login branch
  └── bugfix-header/                 # worktree for bugfix/header branch
```

### New Branch Creation

When creating a worktree with a new branch, the user selects:
1. Base branch to create the new branch from
2. New branch name
3. Worktree path (`<repo>-worktrees/<branch-name>`)

### Auto-Refresh on Branch Switch

The `WorkspacesTreeProvider` watches `.git/HEAD` and `.git/worktrees/*/HEAD` files using `vscode.RelativePattern` with absolute paths. This allows detecting branch changes even for repositories outside the current workspace. The tree auto-refreshes within 300ms of a branch switch.

### Folders without git

Adding a folder never rejects it for lacking git. `Repository` stores only the root path —
git-ness is derived on every render by `GitService.listRepositoryWorktrees()`, so there is
no stored flag to migrate and no downgrade state if the repository is removed.

- `listRepositoryWorktrees()` returns `{ isGit, worktrees }`. When the root is not a git
  working tree, it synthesizes one root worktree using the deterministic id
  `worktreeId(repoId, canonicalPath(rootPath))` — the same id the porcelain parse
  produces after `git init`, so chats keep their worktree binding across the conversion.
  A path only counts as git when the porcelain output lists it as a worktree; git also
  answers from a subdirectory of a repository, and that ancestor's worktrees are not this
  root. Bare repositories report `isGit: true` with no worktrees.
- The tree renders that folder as a `folderRepository` row and its chats directly beneath
  it, with no synthetic worktree row. `getWorktreeForItem()` resolves the folder row to the
  root worktree, so New Session, Open Terminal, the file panels, and restored terminals
  all work from the folder. `getTreeItemForWorktree()` returns the folder row for reveal,
  and the Changes panel asks `isGitWorktree()` so both panels share one derived answer.
  A plain folder returns its placeholder before running any git command.
- Watchers add a `vscode.RelativePattern(rootPath, '.git')` watcher per repository. When
  `.git` appears or is removed, the provider rebuilds the watchers and refreshes, so `git init` upgrades the row
  (and deleting `.git` returns it to a plain folder) with no manual refresh.
- Menus widen shared actions to `folderRepository`; git-only row actions (worktree
  create/delete, merge, rebase, PR checkout) stay exact-match on `repository` and
  `worktree`. A session in a plain folder keeps **Fork to New Worktree** in its menu and
  explains that there is no branch to fork into.

## PR Checkout

The `agntree.checkoutPR` command creates a worktree from a GitHub pull request. It uses `gh` CLI for both PR discovery and fetching.

### Flow

1. User selects a PR from a list (via `gh pr list`) or enters a PR number/URL manually
2. The PR's branch name (`headRefName`) is extracted via `gh pr view`
3. A local branch `pr-<number>` is created using `gh pr checkout <number> --branch pr-<number>` (handles remote resolution for forks automatically)
4. The checkout is immediately reverted with `git checkout -` — the local branch remains
5. A worktree is created from `pr-<number>`, stored in `<repo>-worktrees/<branch-name-with-hyphens>/`
6. The PR number is associated with the worktree via `storageService.setPRWorktree()`

### Why `pr-<number>` branch names?

Using `pr-<number>` (e.g., `pr-4267`) instead of the PR's actual branch name avoids collisions with existing local branches. The worktree directory still uses the original branch name for readability.

## Important VS Code Extension Gotchas

### Multi-root Workspace Edits and Host Restarts

In a multi-root workspace, `vscode.workspace.updateWorkspaceFolders()` edits the
`.code-workspace` configuration in place; the extension host keeps running and agents keep
their terminals. Only replacing the sole folder of a single-folder window calls
`createAndEnterWorkspace`, which restarts the host — that is the one-time conversion when
a single-folder window opens the managed workspace.

1. Keep state that must survive in `globalState` (the active chat, the focused worktree, terminal PIDs)
2. Derive the rest in `activate()`: the shown worktree comes from the persisted Focus id, falling back to the first workspace folder
3. Don't rely on in-memory maps or caches surviving a conversion

### Tree View reveal() Requirements

To use `treeView.reveal()` on nested items:

1. **Stable IDs** - Tree items must have consistent `id` properties (e.g., `this.id = \`${itemType}-${data.id}\``)
2. **getParent()** - Must implement `TreeDataProvider.getParent()` method
3. **Visibility** - Wait for tree to be visible before revealing:
   ```typescript
   if (treeView.visible) {
     treeView.reveal(item);
   } else {
     treeView.onDidChangeVisibility(e => { if (e.visible) treeView.reveal(item); });
   }
   ```

### Terminal Persistence Across Restarts

An Agntree terminal has two identities, and
[ADR 0009](adr/0009-restored-terminals-keep-their-chat.md) records why and what each
costs: the title `Agntree: <chat name> [<shortId>]` (`terminalTitle()` /
`titleShortId()` in `terminalEvents.ts`) identifies a tab after a quit, and the pty PID
recorded per workspace (`StorageService.getTerminalPids()` /
`rememberTerminalPid()`, keyed by the workspace file when the managed workspace is open,
else the first folder) identifies a live agent after a reload. A rename is durable
only once the launch command has started, and only the active tab can be renamed, so
title writes are serialized and re-check the active tab. Background retitling marks its
activations so `consumeBackgroundActivation()` lets the extension ignore them.

`TerminalManager.beginRestoreSync(getWorktree)` runs during `activate()` and returns
`{ adopted, complete }`:

1. `adopted` reads each relevant terminal's PID (bounded to two seconds; unrelated user
   terminals are skipped) and adopts terminals whose PID a chat recorded, restoring the
   chat map, status, title, and record. It never sends input to an adopted terminal.
   Activation awaits this phase before commands exist, so a click cannot open a second
   agent for an adopted chat.
2. `complete` resumes revived tabs after the views and commands exist: match
   `[shortId]`, require a recorded PID for that chat and a different current PID, skip
   ambiguous ids, unlinked forks, and missing worktrees, resolve the launch commands
   concurrently, and send `cd <worktree> && <launch command>` in order. Until a
   candidate's resumability check finishes, `openChat` treats that tab as the chat's
   terminal. Missing-session warnings are suppressed at startup.
3. Each restored chat without a native session is registered with its harness watcher
   again, because that registration died with the previous extension host.
4. Revived tabs whose shell reports integration are retitled after their commands
   start, in the background; the previously active tab is restored afterwards.
5. Owned chats still marked `active` without a live terminal become `idle`.

Worktree lookups during restore go through `WorkspacesTreeProvider`, which lists each
repository at most once. The limits (hand-renamed tabs, duplicate titles, shells without
integration, persistence settings, one window per workspace, POSIX quoting) are the
consequences listed in the ADR.
