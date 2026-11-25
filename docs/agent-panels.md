# Agent panels

A Claude Code or Codex session can run in two places: the agent's CLI in a terminal, or the chat panel of the agent's own VS Code extension. Agntree lets you open a session in either, move it between them, and choose which one a click prefers. The session is the same in both places.

opencode and Pi sessions open in a terminal.

## What you need

| Panel | Extension | Extension ID |
| --- | --- | --- |
| Claude Code UI | [Claude Code for VS Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) | `anthropic.claude-code` |
| Codex UI | [Codex](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt) | `openai.chatgpt` |

The panel actions are shown even when the extension is not installed, so they can tell you what to install.

## Open an existing session in a panel

Hover a Claude Code or Codex session and select the panel icon, or right-click and choose **Open in Claude Code UI** or **Open in Codex UI**.

If the session is running in a terminal, Agntree asks before closing it, waits for the process to stop, and then opens the same session in the panel. Two processes never write to one session.

The panel opens in the editor group you are in, where the terminal or your files are, rather than in a new group on the right. While it is open, the session's row is selected and marked as active, and its turn state and [notifications](notifications.md) keep working.

A session needs at least one prompt before a panel can open it. A session that is still `new` starts in the terminal first.

## Go back to the terminal

Choose **Open Session in Terminal** on the row. Agntree asks before closing the panel tab, then resumes the session in the CLI. A switch the other way — from a terminal to a panel — asks the same way. Both are refused while the agent is working on a turn, so a surface change never kills a running turn; wait for it to finish and try again.

## What a click opens

A click on a session that is not running follows this order:

1. The terminal Agntree tracks for it.
2. The panel that already shows it.
3. The agent's official panel, when its extension is installed and can open the session's worktree.
4. A terminal, resuming the session.

A Claude Code or Codex session therefore opens in its own extension's panel by default. **Open Session in Terminal** resumes it in the CLI instead. [`agntree.defaultSessionSurface`](reference/settings.md#sessions) chooses where a **new** session starts, not what a click does.

When the harness can tell that a process Agntree did not start is using the session — Claude Code through `claude agents --json` — a click does not start a second process. It offers **Copy Resume Command** or a confirmed **Start Another Process…**. Codex, opencode, and Pi cannot report a session running elsewhere, so they have no such guard.

## Start a new session in a panel

In the **New Session** menu, choose **New Claude Code Session in Claude Code UI** or **New Codex Session in Codex UI**. Agntree adds a row straight away, opens a new conversation, and links the row to the real session after your first prompt. Setting [`agntree.defaultSessionSurface`](reference/settings.md#sessions) to **Agent's VS Code panel** makes every new session start there.

## Which folder the panel runs in

The two extensions decide where a conversation runs, which sets what Agntree can offer.

| | Claude Code UI | Codex UI |
| --- | --- | --- |
| Open an existing session | The session's worktree must be the **first folder** open in the VS Code window. Agntree focuses the worktree first, which moves its folder to the front of the [managed workspace](getting-started.md#open-the-managed-workspace) | Any worktree; the thread keeps its own directory |
| Start a new session | Same: the worktree's folder moves first | The worktree must be the **only folder** in the window |
| Otherwise | Agntree offers **Open in New Window** for that worktree | Agntree offers **Open in New Window** for that worktree |

The Claude Code panel reads the first folder when it creates its host and offers no way to pass a different directory. Focusing the worktree before the panel opens satisfies that without changing the folder set, so no running agent is interrupted. A window that is not the managed workspace, or a worktree that is not in it, still cannot host the panel: Agntree explains why and offers **Open in New Window**. It never starts a conversation in the wrong directory. Starting in the terminal and moving to the panel after the first prompt always works for Codex, and now works for Claude Code in the managed workspace.

## Which panels Agntree follows

- **Codex:** every Codex conversation panel is recognized, including panels restored after a reload and panels you opened from the Codex extension itself. The Codex sidebar view is not an editor tab and is not followed.
- **Claude Code:** panels that Agntree opened are recognized. A Claude Code tab that you opened from the extension directly, or that VS Code restored after a reload, is not matched to its row.

## Related

- [Claude Code](agents/claude-code.md)
- [Codex](agents/codex.md)
- [Sessions](sessions.md)
