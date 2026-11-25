import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { StorageService } from '../services/StorageService';
import { GitService } from '../services/GitService';
import { ManagedWorkspaceService } from '../services/ManagedWorkspaceService';
import { WorkspaceTreeItem } from '../providers/WorkspacesTreeProvider';
import { Repository, Worktree } from '../types';
import { errorMessage } from '../utils/text';
import { canonicalPath } from '../utils/paths';
import { commandRegistrar, withProgress } from './common';

export interface RepositoryCommandDeps {
  storageService: StorageService;
  gitService: GitService;
  managedWorkspace: ManagedWorkspaceService;
  /** Remove a forgotten root's chats and clear the panels if they show it. */
  forgetWorktrees: (worktrees: Worktree[]) => void;
  refreshTree: () => void;
}

/** Project commands: add, clone, remove, reorder, and workspace membership. */
export function registerRepositoryCommands(context: vscode.ExtensionContext, deps: RepositoryCommandDeps): void {
  const { storageService, gitService, managedWorkspace, refreshTree } = deps;
  const register = commandRegistrar(context);

  const pickFolder = async (openLabel: string, title: string): Promise<string | undefined> =>
    (await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel, title }))?.[0]
      ?.fsPath;

  const projectWorktrees = (repo: Repository): Worktree[] =>
    gitService.listRepositoryWorktrees(repo.rootPath, repo.id).worktrees;

  const isProjectOpen = (repo: Repository): boolean => {
    const worktrees = projectWorktrees(repo);
    const primary = worktrees.find((worktree) => worktree.isMain) ?? worktrees[0];
    return primary ? managedWorkspace.has(primary.path) : false;
  };

  /** Report a refused workspace-file change instead of failing the command. */
  const changeWorkspace = async (change: () => Promise<void>): Promise<boolean> => {
    try {
      await change();
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(`Could not update the managed workspace: ${errorMessage(error)}`);
      return false;
    }
  };

  const resolveProject = async (
    item: WorkspaceTreeItem | undefined,
    placeHolder: string
  ): Promise<Repository | undefined> => {
    if (item?.itemType === 'repository') {
      return item.data as Repository;
    }
    const repos = storageService.getRepositories();
    if (repos.length === 0) {
      vscode.window.showInformationMessage('No Projects added.');
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(
      repos.map((repo) => ({ label: repo.name, description: repo.rootPath, repo })),
      { placeHolder }
    );
    return selected?.repo;
  };

  register('agntree.addRepository', async () => {
    const picked = await pickFolder('Add', 'Select a Project Folder');
    if (!picked) {
      return;
    }
    // The physical path, so a folder opened through a symlink gets the same
    // identity git reports after `git init`.
    const folderPath = canonicalPath(picked);
    // `--show-toplevel` resolves a subdirectory to its repository root and
    // answers null for a folder outside a repository.
    const repoRoot = gitService.getRepoRoot(folderPath);
    // A bare repository or a `.git` directory has no files to edit.
    if (!repoRoot && gitService.isGitRepository(folderPath)) {
      vscode.window.showErrorMessage(
        'That folder is a git directory, not a working tree. Select the project folder instead.'
      );
      return;
    }

    let rootPath = repoRoot;
    if (!rootPath) {
      const home = os.homedir();
      if (folderPath === home || folderPath === path.parse(folderPath).root) {
        vscode.window.showErrorMessage('Add a Project folder, not your home directory or a filesystem root.');
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `"${path.basename(folderPath)}" is not a git repository.\n\nInitialize one? This creates a .git directory and makes no commit.`,
        { modal: true },
        'Initialize Git Repository'
      );
      if (confirm !== 'Initialize Git Repository') {
        return;
      }
      const init = gitService.initRepository(folderPath);
      if (!init.success) {
        vscode.window.showErrorMessage(`Could not initialize a git repository: ${init.error ?? 'git failed.'}`);
        return;
      }
      rootPath = folderPath;
    }

    const repo = storageService.addRepository(path.basename(rootPath), rootPath);
    const added = `Added Project: ${repo.name}`;
    vscode.window.showInformationMessage(
      isProjectOpen(repo) ? added : `${added}. Add it to the workspace to open its worktrees here.`
    );
    refreshTree();
  });

  register('agntree.removeRepository', async (item?: WorkspaceTreeItem) => {
    const repo = await resolveProject(item, 'Select a Project to remove from Agntree');
    if (!repo) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove "${repo.name}" from Agntree?\n\nIts folders leave the workspace and its session rows leave the list, losing custom names and stars, and their terminals close. Your files, git repository, and the agents' conversations are NOT deleted; Import Sessions can bring the sessions back after you add it again.`,
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') {
      return;
    }
    // Its chats would otherwise linger unseen and keep their sessions from
    // being imported when the folder is added again.
    deps.forgetWorktrees(projectWorktrees(repo));
    await changeWorkspace(() => managedWorkspace.remove(projectWorktrees(repo).map((worktree) => worktree.path)));
    storageService.removeRepository(repo.id);
    vscode.window.showInformationMessage(`Removed "${repo.name}" from Agntree`);
    refreshTree();
  });

  register('agntree.addToWorkspace', async (item?: WorkspaceTreeItem) => {
    const repo = await resolveProject(item, 'Select a Project to add to the workspace');
    if (!repo) {
      return;
    }
    if (isProjectOpen(repo)) {
      vscode.window.showInformationMessage(`"${repo.name}" is already in the workspace.`);
      return;
    }
    const worktrees = projectWorktrees(repo);
    if (!(await changeWorkspace(() => managedWorkspace.add(worktrees.map((worktree) => worktree.path))))) {
      return;
    }
    refreshTree();
    if (!managedWorkspace.isOpen()) {
      const choice = await vscode.window.showInformationMessage(
        `Added "${repo.name}" to the managed workspace. Open it now? VS Code reloads this window.`,
        'Open Managed Workspace',
        'Later'
      );
      if (choice === 'Open Managed Workspace') {
        await managedWorkspace.open();
      }
      return;
    }
    vscode.window.showInformationMessage(`Added "${repo.name}" to the workspace.`);
  });

  register('agntree.removeFromWorkspace', async (item?: WorkspaceTreeItem) => {
    const repo = await resolveProject(item, 'Select a Project to remove from the workspace');
    if (!repo) {
      return;
    }
    if (!isProjectOpen(repo)) {
      vscode.window.showInformationMessage(`"${repo.name}" is not in the workspace.`);
      return;
    }
    const removed = await changeWorkspace(() =>
      managedWorkspace.remove(projectWorktrees(repo).map((worktree) => worktree.path))
    );
    refreshTree();
    if (!removed) {
      return;
    }
    vscode.window.showInformationMessage(
      `Removed "${repo.name}" from the workspace. Files, git, and agent sessions are unchanged.`
    );
  });

  register('agntree.openManagedWorkspace', async () => {
    await changeWorkspace(() => managedWorkspace.open());
  });

  const moveRepository = (direction: 'up' | 'down') => (item?: WorkspaceTreeItem) => {
    if (item?.itemType !== 'repository') {
      return;
    }
    const repo = item.data as Repository;
    if (storageService.moveRepository(repo.id, direction)) {
      refreshTree();
    } else {
      vscode.window.showInformationMessage(`"${repo.name}" is already at the ${direction === 'up' ? 'top' : 'bottom'}.`);
    }
  };
  register('agntree.moveRepositoryUp', moveRepository('up'));
  register('agntree.moveRepositoryDown', moveRepository('down'));

  register('agntree.refreshWorkspaces', refreshTree);

  register('agntree.cloneRepository', async () => {
    const input = await vscode.window.showInputBox({
      prompt: 'Enter GitHub repository URL',
      placeHolder: 'https://github.com/owner/repo or owner/repo',
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return 'Repository URL is required';
        }
        return trimmed.includes('github.com') || /^[\w-]+\/[\w.-]+$/.test(trimmed)
          ? undefined
          : 'Enter a valid GitHub URL or owner/repo format';
      },
    });
    if (!input) {
      return;
    }

    let url = input.trim();
    if (!url.includes('://')) {
      url = `https://github.com/${url}`;
    }
    if (!url.endsWith('.git')) {
      url = `${url}.git`;
    }
    const repoName = path.basename(url, '.git');
    if (!repoName || repoName === '.' || repoName === '..' || /[\\/]/.test(repoName)) {
      vscode.window.showErrorMessage('Could not determine a safe folder name from that URL.');
      return;
    }

    const parent = await pickFolder('Select Parent Folder', 'Select where to clone the repository');
    if (!parent) {
      return;
    }
    const clonePath = path.join(parent, repoName);
    const result = await withProgress(`Cloning ${repoName}...`, () => gitService.clone(url, clonePath));
    if (!result.success) {
      vscode.window.showErrorMessage(`Failed to clone repository: ${result.error}`);
      return;
    }
    const repo = storageService.addRepository(repoName, clonePath);
    vscode.window.showInformationMessage(`Cloned and added project: ${repo.name}`);
    refreshTree();
  });
}
