import * as vscode from 'vscode';
import { ChatSession, BranchListing, Worktree } from './types';
import { StorageService } from './services/StorageService';
import { WorktreeCatalog } from './services/WorktreeCatalog';
import { GitService } from './services/GitService';
import { GitHubService } from './services/GitHubService';
import { TerminalManager } from './services/TerminalManager';
import { ClaudeSessionService } from './services/ClaudeSessionService';
import { ClaudeSessionWatcher } from './services/ClaudeSessionWatcher';
import { OpencodeSessionWatcher } from './services/OpencodeSessionWatcher';
import { CodexSessionWatcher } from './services/CodexSessionWatcher';
import { PiSessionService } from './services/PiSessionService';
import { PiSessionWatcher } from './services/PiSessionWatcher';
import { HarnessWatcherRegistry } from './services/HarnessWatcherRegistry';
import { SessionImportService } from './services/SessionImportService';
import { NotificationService } from './services/NotificationService';
import { SessionAttentionService } from './services/SessionAttentionService';
import { ManagedWorkspaceService } from './services/ManagedWorkspaceService';
import { disposeOperationLog, logOperation } from './services/OperationLog';
import { ClaudeHarness } from './harnesses/ClaudeHarness';
import { OpencodeHarness } from './harnesses/OpencodeHarness';
import { CodexHarness } from './harnesses/CodexHarness';
import { PiHarness } from './harnesses/PiHarness';
import { HarnessRegistry } from './harnesses/HarnessRegistry';
import { chatNativeSessionIds } from './harnesses/sessionUtils';
import { WorkspacesTreeProvider } from './providers/WorkspacesTreeProvider';
import { ChangesTreeProvider } from './providers/ChangesTreeProvider';
import { FilesTreeProvider, FileTreeItem } from './providers/FilesTreeProvider';
import { registerRepositoryCommands } from './commands/repository';
import { registerWorktreeCommands } from './commands/worktree';
import { registerChatCommands } from './commands/chat';
import { registerChangesCommands } from './commands/changes';
import { registerSessionImportCommands } from './commands/sessionImport';
import { registerFileCommands } from './commands/files';
import { commandRegistrar } from './commands/common';
import { debounce } from './utils/debounce';

/** Panels re-read the worktree this long after its files stop changing. */
const FILE_CHANGE_DEBOUNCE_MS = 300;

export async function activate(context: vscode.ExtensionContext) {
  const config = () => vscode.workspace.getConfiguration('agntree');
  const register = commandRegistrar(context);
  const setContext = (key: string, value: unknown) =>
    void vscode.commands.executeCommand('setContext', key, value);

  // Services and harnesses
  const storageService = new StorageService(context);
  const gitService = new GitService();
  const worktreeCatalog = new WorktreeCatalog(storageService, gitService);
  const managedWorkspace = new ManagedWorkspaceService(context);
  await managedWorkspace.load().catch((error: unknown) => {
    logOperation(`Could not read the managed workspace: ${error instanceof Error ? error.message : String(error)}`);
    vscode.window.showWarningMessage(
      `Agntree could not read ${managedWorkspace.workspaceFilePath}. Add to Workspace and Remove from Workspace are unavailable until it is fixed.`
    );
  });
  const gitHubService = new GitHubService();
  const opencodeHarness = new OpencodeHarness();
  const codexHarness = new CodexHarness();
  const claudeSessionService = new ClaudeSessionService();
  const piSessionService = new PiSessionService();
  const piHarness = new PiHarness({ sessionService: piSessionService });
  const harnessRegistry = new HarnessRegistry([
    new ClaudeHarness({ sessionService: claudeSessionService }),
    opencodeHarness,
    codexHarness,
    piHarness,
  ]);
  const harnessWatcherRegistry = new HarnessWatcherRegistry([
    new ClaudeSessionWatcher(storageService, claudeSessionService),
    new OpencodeSessionWatcher(storageService, opencodeHarness, worktreeCatalog),
    new CodexSessionWatcher(storageService, codexHarness, worktreeCatalog),
    new PiSessionWatcher(storageService, piSessionService, worktreeCatalog),
  ]);
  const terminalManager = new TerminalManager(storageService, harnessRegistry, harnessWatcherRegistry);

  const hasOpenNativeUi = (chat: ChatSession): boolean => {
    const surfaces = harnessRegistry.get(chat.harness).nativeUi?.surfaces;
    return Boolean(surfaces && chatNativeSessionIds(chat).some((id) => surfaces.isOpen(id)));
  };
  /**
   * The one definition of an open chat: a live terminal or a mapped
   * native-UI tab. The tree, attention tick, and importer all use it.
   */
  const isChatOpen = (chat: ChatSession): boolean => terminalManager.isActive(chat.id) || hasOpenNativeUi(chat);
  /** Sessions with a live terminal or native-UI tab in a worktree, for preflights. */
  const runningSessionCount = (worktreeId: string): number =>
    storageService.getChatsByWorktree(worktreeId).filter(isChatOpen).length;

  /** The chat whose native-UI tab is the active editor tab, if any. */
  const activeNativeUiChatId = (): string | undefined => {
    const activeSessions = new Map(
      harnessRegistry.all().flatMap((adapter) => {
        const sessionId = adapter.nativeUi?.surfaces?.activeSessionId();
        return sessionId ? [[adapter.id, sessionId] as const] : [];
      })
    );
    if (activeSessions.size === 0) {
      return undefined;
    }
    return storageService.getChats().find((chat) => {
      const sessionId = activeSessions.get(chat.harness);
      return sessionId !== undefined && chatNativeSessionIds(chat).includes(sessionId);
    })?.id;
  };

  harnessWatcherRegistry.startAll();

  // Menu gating: a harness entry needs its CLI; a UI entry needs the agent's
  // extension, re-checked when extensions change so no reload is needed.
  void Promise.all(
    harnessRegistry.all().map(async (adapter) => {
      const installed = await harnessRegistry.isInstalled(adapter.id);
      setContext(`agntree.${adapter.id}Installed`, installed);
      return installed;
    })
  ).then((installed) => setContext('agntree.anyHarnessInstalled', installed.some(Boolean)));
  const updateNativeUiContexts = (): void => {
    let anyInstalled = false;
    for (const adapter of harnessRegistry.all()) {
      if (adapter.nativeUi) {
        const installed = adapter.nativeUi.isInstalled();
        anyInstalled ||= installed;
        setContext(`agntree.${adapter.id}UiInstalled`, installed);
      }
    }
    setContext('agntree.anyNativeUiInstalled', anyInstalled);
  };
  updateNativeUiContexts();
  context.subscriptions.push(vscode.extensions.onDidChange(updateNativeUiContexts));

  // Views
  const workspacesProvider = new WorkspacesTreeProvider(
    storageService,
    gitService,
    terminalManager,
    harnessRegistry,
    gitHubService,
    context.extensionUri
  );
  workspacesProvider.setChatOpenProvider(isChatOpen);
  workspacesProvider.setWorkspaceMembershipProvider((fsPath) => managedWorkspace.has(fsPath));
  workspacesProvider.setActiveWorktreeProvider(() => storageService.getActiveWorktreeId());

  // Reconcile terminals that survived a reload or a quit (ADR 0009). Adoption
  // must finish before a click can open a chat; resuming revived tabs asks
  // the harness whether each session still exists, so it continues after the
  // views and commands exist.
  const restore = terminalManager.beginRestoreSync((id) => workspacesProvider.getWorktreeById(id));
  await restore.adopted;
  void restore.complete.catch((error) => console.error('Agntree: restoring terminals failed', error));

  const changesProvider = new ChangesTreeProvider(gitService, (worktree) => workspacesProvider.isGitWorktree(worktree));
  const filesProvider = new FilesTreeProvider();
  const workspacesTreeView = vscode.window.createTreeView('agntree.workspacesView', {
    treeDataProvider: workspacesProvider,
    showCollapseAll: true,
    // Session rows can be removed, closed, and starred several at a time.
    canSelectMany: true,
  });
  const changesTreeView = vscode.window.createTreeView('agntree.changesView', { treeDataProvider: changesProvider });
  const filesTreeView = vscode.window.createTreeView('agntree.filesView', {
    treeDataProvider: filesProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(workspacesTreeView, changesTreeView, filesTreeView);
  const refreshTree = () => workspacesProvider.refresh();

  // The worktree the Changes and Files panels show, and one watcher on its
  // files that refreshes both.
  let shownWorktree: Worktree | undefined;
  let worktreeWatcher: vscode.FileSystemWatcher | undefined;
  const refreshPanels = debounce(() => {
    changesProvider.refresh();
    filesProvider.refresh();
  }, FILE_CHANGE_DEBOUNCE_MS);
  const showWorktree = (worktree: Worktree | undefined): void => {
    if (worktree?.id !== shownWorktree?.id) {
      shownWorktree = worktree;
      worktreeWatcher?.dispose();
      worktreeWatcher = undefined;
      if (worktree) {
        worktreeWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(worktree.path, '**/*'));
        worktreeWatcher.onDidChange(refreshPanels);
        worktreeWatcher.onDidCreate(refreshPanels);
        worktreeWatcher.onDidDelete(refreshPanels);
      }
      changesProvider.setActiveWorktree(worktree);
      filesProvider.setActiveWorktree(worktree);
    }
    const repoName = worktree && storageService.getRepository(worktree.repoId)?.name;
    const suffix = !worktree
      ? ''
      : repoName && worktree.name !== repoName
        ? ` (${worktree.name} ~ ${repoName})`
        : ` (${worktree.name})`;
    changesTreeView.title = `Changes${suffix}`;
    filesTreeView.title = `All Files${suffix}`;
  };

  /**
   * Focus a worktree: the Changes and All Files panels follow it, and its id
   * is what the tree marks and activation restores. Selecting a worktree or
   * opening one of its sessions also moves its folder first, so the Claude
   * Code UI, which runs in the first folder, opens in the right place. A
   * single-folder window and a worktree outside the managed workspace are
   * left alone.
   */
  const focusWorktree = async (worktree: Worktree, options: { reorder: boolean }): Promise<void> => {
    showWorktree(worktree);
    if (storageService.getActiveWorktreeId() !== worktree.id) {
      storageService.setActiveWorktreeId(worktree.id);
    }
    if (!options.reorder) {
      return;
    }
    await managedWorkspace.reorderToFirst(worktree.path).catch((error: unknown) => {
      logOperation(
        `Could not focus "${worktree.name}" in the managed workspace: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  };

  /** Close chats' terminals and delete their rows; a removed selection is cleared. */
  const removeChats = (chatIds: string[], options?: { rememberSession?: boolean }): string[] => {
    chatIds.forEach((id) => terminalManager.closeChat(id));
    const removed = storageService.deleteChats(chatIds, options);
    const activeId = storageService.getActiveChatId();
    if (activeId && removed.includes(activeId)) {
      storageService.setActiveChatId(undefined);
      showWorktree(undefined);
    }
    return removed;
  };

  /**
   * Forget worktrees that are gone from Agntree. Their chats are removed
   * without tombstones, so the sessions can be imported again later.
   */
  const forgetWorktrees = (worktrees: Worktree[]): void => {
    const ids = new Set(worktrees.map((worktree) => worktree.id));
    removeChats(
      storageService.getChats().filter((chat) => ids.has(chat.worktreeId)).map((chat) => chat.id),
      { rememberSession: false }
    );
    if (shownWorktree && ids.has(shownWorktree.id)) {
      showWorktree(undefined);
    }
  };

  /** Set once the attention service exists; visiting a chat clears its needs-you flag. */
  let markChatSeen: (chatId: string) => void = () => undefined;

  /** Select a chat's row and point the panels at its worktree. */
  const activateChat = (chat: ChatSession, options: { revealIfHidden?: boolean } = { revealIfHidden: true }) => {
    markChatSeen(chat.id);
    if (storageService.getActiveChatId() !== chat.id) {
      storageService.setActiveChatId(chat.id);
    }
    const worktree = workspacesProvider.getWorktreeById(chat.worktreeId);
    if (worktree) {
      void focusWorktree(worktree, { reorder: true });
    }
    if (options.revealIfHidden || workspacesTreeView.visible) {
      void workspacesTreeView
        .reveal(workspacesProvider.getChatTreeItem(chat), { select: true, focus: false, expand: true })
        .then(undefined, () => undefined);
    }
  };

  // Native sessions started outside an exact-ID launch: a UI launch, or a
  // session started outside Agntree. Also ages out quiet auto-imports.
  const sessionImporter = new SessionImportService(storageService, worktreeCatalog, harnessRegistry, {
    // Retention must also keep a chat whose terminal is still resuming.
    isChatOpen: (chat) => isChatOpen(chat) || terminalManager.isResuming(chat.id),
    isVisible: () => workspacesTreeView.visible,
    onChatsChanged: (event) => {
      workspacesProvider.softRefresh();
      const activeId = storageService.getActiveChatId();
      if (activeId && event.removed.includes(activeId)) {
        storageService.setActiveChatId(undefined);
        showWorktree(undefined);
      }
    },
  });
  context.subscriptions.push(sessionImporter);
  sessionImporter.start();

  /** Whether the chat's terminal or native-UI tab is the one in front of the user. */
  const isChatVisible = (chatId: string): boolean => {
    const terminal = terminalManager.getTerminal(chatId);
    return (terminal !== undefined && terminal === vscode.window.activeTerminal) || activeNativeUiChatId() === chatId;
  };
  const notificationService = new NotificationService(
    (chatId) => {
      const chat = storageService.getChat(chatId);
      if (chat) {
        terminalManager.focusChat(chatId);
        activateChat(chat, { revealIfHidden: false });
      }
    },
    isChatVisible
  );
  const attentionService = new SessionAttentionService(
    storageService,
    harnessRegistry,
    notificationService,
    (worktreeId) => workspacesProvider.getWorktreeById(worktreeId),
    // Turn changes swap the row mark between the beating mark and green dot.
    () => workspacesProvider.softRefresh(),
    isChatOpen,
    isChatVisible
  );
  markChatSeen = (chatId) => attentionService.markSeen(chatId);
  attentionService.start();
  workspacesProvider.setTurnStateProvider((chatId) => attentionService.getTurnState(chatId));

  // Commands
  registerRepositoryCommands(context, {
    storageService,
    gitService,
    managedWorkspace,
    forgetWorktrees,
    refreshTree,
  });
  registerWorktreeCommands(context, {
    storageService,
    gitService,
    gitHubService,
    managedWorkspace,
    workspacesProvider,
    forgetWorktrees,
    runningSessions: runningSessionCount,
    refreshTree,
  });
  registerChatCommands(context, {
    storageService,
    gitService,
    terminalManager,
    workspacesProvider,
    harnessRegistry,
    harnessWatcherRegistry,
    sessionImporter,
    sessionsNeedingYou: () => attentionService.sessionsNeedingYou(),
    selectedRows: () => workspacesTreeView.selection,
    activeWorktree: () => shownWorktree,
    activateChat,
    prepareWorktree: (worktree) => focusWorktree(worktree, { reorder: true }),
    managedWorkspace,
    showWorktree,
    turnState: (chatId) => attentionService.getTurnState(chatId),
    runningSessions: runningSessionCount,
    removeChats,
    refreshTree,
  });
  registerSessionImportCommands(context, storageService, gitService, worktreeCatalog, workspacesProvider, harnessRegistry, refreshTree);
  registerChangesCommands(context, gitService, changesProvider, refreshTree);
  registerFileCommands(context, filesProvider, () => {
    const [row] = filesTreeView.selection;
    return row instanceof FileTreeItem ? row : undefined;
  });

  // The Keyboard Shortcuts editor, filtered to this extension's commands.
  register('agntree.openKeybindings', () =>
    vscode.commands.executeCommand('workbench.action.openGlobalKeybindings', `@ext:${context.extension.id}`)
  );
  // The Settings editor, filtered to this extension's sections.
  register('agntree.openSettings', () =>
    vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${context.extension.id}`)
  );
  for (const enabled of [true, false]) {
    register(`agntree.${enabled ? 'enable' : 'disable'}FocusOnStartup`, async () => {
      await config().update('focusOnStartup', enabled, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`Focus on startup ${enabled ? 'enabled' : 'disabled'}`);
    });
  }

  // Follow focus: a terminal, an editor terminal tab, or a native-UI tab
  // selects its chat. Switching back from a Claude tab to an editor terminal
  // may not change `activeTerminal`, so the tab title is the fallback.
  const activateActiveEditorChat = (): void => {
    const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    if (!activeTab) {
      return;
    }
    let chatId: string | undefined;
    if (activeTab.input instanceof vscode.TabInputTerminal) {
      const terminal = vscode.window.activeTerminal;
      chatId =
        (terminal && terminalManager.getChatIdForTerminal(terminal)) ??
        terminalManager.getChatIdForTerminalName(activeTab.label);
    } else {
      chatId = activeNativeUiChatId();
    }
    const chat = chatId ? storageService.getChat(chatId) : undefined;
    if (chat) {
      activateChat(chat);
    }
  };
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(activateActiveEditorChat),
    vscode.window.tabGroups.onDidChangeTabGroups(activateActiveEditorChat),
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      // The retitle pass activates restored tabs to rename them; that is not
      // a user focus change and must not move the selection.
      if (!terminal || terminalManager.consumeBackgroundActivation(terminal)) {
        return;
      }
      const chatId = terminalManager.getChatIdForTerminal(terminal);
      const chat = chatId ? storageService.getChat(chatId) : undefined;
      if (chat) {
        activateChat(chat);
      }
    }),
    harnessWatcherRegistry.onChatNameUpdated(() => workspacesProvider.softRefresh()),
    // The importer pauses its discovery pass while the view is hidden.
    workspacesTreeView.onDidChangeVisibility((event) => {
      if (event.visible) {
        sessionImporter.wake();
      }
    }),
    workspacesTreeView.onDidChangeSelection(({ selection: [selected, ...others] }) => {
      // Selecting several rows prepares a bulk action; it is not a visit.
      if (!selected || others.length > 0) {
        return;
      }
      if (selected.itemType === 'branch') {
        const listing = selected.data as BranchListing;
        if (listing.worktree) {
          void focusWorktree(listing.worktree, { reorder: true });
          void workspacesTreeView
            .reveal(workspacesProvider.getTreeItemForWorktree(listing.worktree), { select: true, focus: false, expand: true })
            .then(undefined, () => undefined);
        }
        return;
      }
      if (selected.itemType === 'chat') {
        const chat = selected.data as ChatSession;
        markChatSeen(chat.id);
        storageService.setActiveChatId(chat.id);
        const worktree = workspacesProvider.getWorktreeById(chat.worktreeId);
        if (worktree) {
          // Browsing rows moves Focus but does not reorder the workspace.
          void focusWorktree(worktree, { reorder: false });
        }
        return;
      }
      // A plain folder row stands in for its root worktree; a git repository
      // row has none.
      const worktree = workspacesProvider.getWorktreeForItem(selected);
      if (worktree) {
        void focusWorktree(worktree, { reorder: true });
      }
    })
  );
  for (const adapter of harnessRegistry.all()) {
    const surfaces = adapter.nativeUi?.surfaces;
    if (surfaces) {
      context.subscriptions.push(surfaces.onDidChange(() => workspacesProvider.softRefresh()));
    }
  }

  // The workspace file is the membership list; a folder added or removed in
  // VS Code's own UI must show up in the tree without a reload.
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void managedWorkspace.load().catch((error: unknown) => {
        logOperation(
          `Could not reread the managed workspace: ${error instanceof Error ? error.message : String(error)}`
        );
      });
      refreshTree();
    })
  );
  void managedWorkspace.promptOnce();

  // Start on the worktree Focus last selected, or on the one that matches the
  // first workspace folder. Reveal is best-effort: the row may not have
  // rendered yet.
  const activeWorktreeId = storageService.getActiveWorktreeId();
  const folderPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const startWorktree =
    (activeWorktreeId ? workspacesProvider.getWorktreeById(activeWorktreeId) : undefined) ??
    (folderPath ? workspacesProvider.findWorktreeByPath(folderPath) : undefined);
  if (startWorktree) {
    showWorktree(startWorktree);
    const reveal = () =>
      setTimeout(() => {
        void workspacesTreeView
          .reveal(workspacesProvider.getTreeItemForWorktree(startWorktree), { select: true, focus: false, expand: true })
          .then(undefined, () => undefined);
      }, 100);
    if (workspacesTreeView.visible) {
      reveal();
    } else {
      const once = workspacesTreeView.onDidChangeVisibility((event) => {
        if (event.visible) {
          once.dispose();
          reveal();
        }
      });
      context.subscriptions.push(once);
    }
  }

  context.subscriptions.push({
    dispose: () => {
      refreshPanels.cancel();
      worktreeWatcher?.dispose();
      attentionService.dispose();
      terminalManager.dispose();
      changesProvider.dispose();
      filesProvider.dispose();
      workspacesProvider.dispose();
      harnessWatcherRegistry.dispose();
      harnessRegistry.dispose();
    },
  });

  if (config().get<boolean>('focusOnStartup', false)) {
    void vscode.commands.executeCommand('workbench.view.extension.agntree');
  }
}

export function deactivate() {
  disposeOperationLog();
}
