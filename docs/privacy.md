# Privacy

Agntree is local-first. It collects no telemetry, needs no account, and keeps its own state inside VS Code on your machine. Agntree itself never sends session text anywhere; this page says exactly what it reads, stores, and sends.

## What Agntree never does

- **No telemetry.** Agntree sends no usage data, crash reports, or analytics to its author or to any third party.
- **No account.** There is nothing to sign in to.
- **No servers.** Agntree has no backend. It cannot see your code, your sessions, or which agents you use.
- **No changes to your agents.** Agntree installs no hooks and edits no agent configuration files.

## What Agntree reads

To list and watch sessions, Agntree reads what each agent already keeps on your machine, through the interface that agent supports:

| Agent | What is read |
| --- | --- |
| Claude Code | Session transcripts under `~/.claude/projects/`, and the output of `claude agents --json` |
| Codex | Threads through a local `codex app-server`, and rollout files under `~/.codex/sessions/` |
| opencode | Sessions through the `opencode` CLI and API. Its database is never opened |
| Pi | Session records under `~/.pi/agent/sessions/` |

It also runs `git` in the folders you add, and `gh` for pull requests. All of this stays on your machine.

## What Agntree stores

Agntree keeps a small amount of state in VS Code's extension storage:

- the folders and repositories you added,
- the session list: for each row, its name, its agent, and the agent's session ID,
- your stars, and which sessions you removed,
- which worktrees came from a pull request.

It does not copy conversations. A session's content stays in the agent's own storage, which is why removing a row never deletes a conversation and uninstalling Agntree loses nothing.

## When something leaves your machine

Agntree itself makes no network requests. Network traffic comes only from tools you already use, when you ask for them:

| You do this | This tool talks to the network |
| --- | --- |
| Start or resume a session | The agent's CLI, to its model provider, as always |
| **Clone from GitHub…**, **Rebase onto Upstream…**, a worktree from `upstream` | `git`, to your remotes |
| **Check Out Pull Request…**, pull request numbers on branches | `gh`, to GitHub |

## Destructive actions

Agntree deletes very little, and says what it will delete before it does:

- Removing a session row or a repository from the sidebar deletes no files and no conversations.
- Deleting a file in the All Files panel, or discarding an untracked file, moves it to the Trash.
- Deleting a worktree removes its directory, after a confirmation that names what will be lost.
- These actions are logged in the **Agntree Operations** output channel.

## Open source

Agntree is MIT licensed, and everything on this page can be checked in the [source code](https://github.com/subhashkhileri/agntree). To report a security problem, see [SECURITY.md](../SECURITY.md).

## Related

- [FAQ](faq.md)
