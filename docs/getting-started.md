# Getting started

Install Agntree from the VS Code Marketplace, add a Project, and click **+** to start a Claude Code, Codex, opencode, or Pi session. This page walks through that, start to finish.

## Requirements

- **VS Code 1.106 or newer**, or an editor built on it such as Cursor.
- **Git**, for Projects, worktrees, the Changes panel, and pull requests. Adding a folder that is not a repository offers to initialize one.
- **At least one supported agent CLI**, installed and working in a terminal:

  | Agent | Command | Notes |
  | --- | --- | --- |
  | [Claude Code](https://claude.ai/code) | `claude` | Version 2.1.310 or newer |
  | [Codex](https://developers.openai.com/codex) | `codex` | |
  | [opencode](https://opencode.ai) | `opencode` | Version 2 or newer |
  | [Pi](https://pi.dev) | `pi` | |

- **GitHub CLI** (`gh`), optional. Agntree uses it to check out pull requests and to show a PR number on a branch.

Agntree is developed and tested on macOS and Linux. Windows support is partial: commands that Agntree types into a terminal are quoted for POSIX shells.

## Install

**From VS Code:** open the Extensions view (`Ctrl+Shift+X`, `Cmd+Shift+X` on macOS), search for **Agntree**, and select **Install**.

**From a terminal:**

```bash
code --install-extension subhashkhileri.agntree
```

**In Cursor and other VS Code forks:** search for **Agntree** in the Extensions view. If it is not listed there, download the `.vsix` file from the [latest release](https://github.com/subhashkhileri/agntree/releases/latest) and run **Extensions: Install from VSIX…** from the Command Palette.

Agntree needs no account and no configuration.

## Add a Project

1. Select the Agntree icon in the Activity Bar. `Ctrl+Alt+A` (`Ctrl+Cmd+A` on macOS) opens it from anywhere.
2. In the **Projects** view, choose **Add Project…** and pick a folder. If it is not a git repository, Agntree offers to initialize one (it creates `.git` and makes no commit). To start from GitHub, choose **Clone from GitHub…** and enter a URL or `owner/repo`.

The Project appears as a row. A git repository expands to its worktrees, starting with the one you already have (usually `main`).

Add as many Projects as you like. They do not have to be open in VS Code.

**All Files** and **Changes** open in the Secondary Side Bar, in their own container next to Projects, so projects, files, and changes are visible at the same time. Run **View: Toggle Secondary Side Bar** if that column is hidden; VS Code remembers the layout. See [Changes and files](changes-and-files.md).

## Open the managed workspace

Agntree keeps every worktree of your Open Projects in one VS Code workspace, per host: `~/.agntree/agntree.code-workspace` on the machine VS Code is connected to (a Remote-SSH window keeps its own). This is what lets agents run side by side in different worktrees without switching folders or reloading the window.

- On first run Agntree offers to open it. **Open Managed Workspace** in the view's `…` menu opens it later.
- **Add Project to Workspace** on a Project's right-click menu opens all of its worktrees as folders; **Remove Project from Workspace** takes them out. Files, agents, and sessions are not affected either way.
- **Open in New Window** on a worktree still opens that worktree alone in its own window.

Selecting a worktree **focuses** it: the Changes and All Files panels follow it, and its folder moves to the front of the workspace, which is where the Claude Code extension's panel runs. The folder set never changes, so a running agent is never interrupted.

The view marks a Project that is not in the workspace with **not in workspace**. Its sessions still run in terminals, but the Claude Code panel cannot be used until it is added.

## Start your first session

1. Hover the worktree (or the folder) and select **New Session** (**+**).
2. Choose an agent. Only installed agents are listed.

A terminal opens in that worktree with the agent running, and a row named **New Session** appears with `new` beside it. Type your first prompt. The agent then creates the session, and Agntree renames the row to the name the agent gave it.

To skip the menu next time, choose **Set Default Agent…** in that same menu. From then on **+** starts your agent in one click, and `Ctrl+Alt+Enter` (`Ctrl+Cmd+Enter` on macOS) starts one in the worktree you are working in.

## Come back to a session

Close the terminal, or quit VS Code entirely. The session stays in the sidebar. Click its row and Agntree opens it where it belongs: a tracked terminal or an open panel is focused, otherwise the agent's official panel opens, and the CLI is the fallback.

Sessions you already had before installing Agntree show up too: Agntree lists recent sessions the agents hold for each folder you add. See [Sessions](sessions.md#sessions-started-outside-agntree).

## Next steps

- [Create a worktree](worktrees.md#create-a-worktree) so a second agent can work on another branch at the same time.
- [Fork a session](fork-sessions.md) to try a different approach.
- [Turn on the notifications you want](notifications.md), then press `Ctrl+Alt+N` to jump to the agent that needs you.
- Learn the [keyboard shortcuts](reference/keyboard-shortcuts.md).

If an agent is missing from the **New Session** menu, see [Troubleshooting](troubleshooting.md#an-agent-is-missing-from-the-new-session-menu).
