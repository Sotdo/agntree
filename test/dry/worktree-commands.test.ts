import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GitService } from '../../src/services/GitService';
import { GitHubService } from '../../src/services/GitHubService';
import { ManagedWorkspaceService } from '../../src/services/ManagedWorkspaceService';
import { registerWorktreeCommands } from '../../src/commands/worktree';
import { Worktree } from '../../src/types';
import { makeStorage, runCommand, shown, shownMessages, stub, tempDir } from './support';

beforeEach(() => stub.__reset());

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' }).trim();

/** A repository `app` with one commit on `main`, added as a root. */
function setup(t: { after(fn: () => void): void }) {
  const scratch = fs.realpathSync(tempDir(t));
  const repoPath = path.join(scratch, 'app');
  fs.mkdirSync(repoPath);
  git(repoPath, 'init', '-q', '-b', 'main');
  git(repoPath, 'commit', '-q', '--allow-empty', '-m', 'init');

  const storage = makeStorage();
  const repo = storage.addRepository('app', repoPath);
  const gitService = new GitService();
  const managedWorkspace = new ManagedWorkspaceService(
    { globalState: { get: () => undefined, update: async () => undefined } } as never,
    tempDir(t)
  );
  // Records whether each worktree's directory still existed when it was forgotten.
  const forgotten: { path: string; existed: boolean }[] = [];
  registerWorktreeCommands({ subscriptions: [] } as never, {
    storageService: storage,
    gitService,
    gitHubService: new GitHubService(),
    managedWorkspace,
    workspacesProvider: {
      getWorktreeForItem: (item) => item?.data as Worktree | undefined,
      isGitRepo: () => true,
      getPRUrl: () => undefined,
    },
    forgetWorktrees: (worktrees) =>
      forgotten.push(...worktrees.map((w) => ({ path: w.path, existed: fs.existsSync(w.path) }))),
    runningSessions: () => 0,
    refreshTree: () => undefined,
  });
  const worktreeAt = (worktreePath: string) =>
    gitService.listWorktrees(repoPath, repo.id).find((w) => w.path === worktreePath)!;
  const branches = () => gitService.getBranches(repoPath).sort();
  return { scratch, repoPath, repo, managedWorkspace, worktreeAt, branches, forgotten };
}

test('Create Worktree puts a new branch under <repo>-worktrees and hides branches already checked out', async (t) => {
  const { scratch, repo, worktreeAt, branches } = setup(t);
  const row = { itemType: 'repository', data: repo };

  stub.__quickPickResponses.push({ value: 'new' }, { label: 'main' });
  stub.__inputResponses.push('feat/login');
  await runCommand('agntree.addWorktree', row);
  const created = path.join(scratch, 'app-worktrees', 'feat-login');
  assert.equal(worktreeAt(created)?.branch, 'feat/login');
  assert.deepEqual(branches(), ['feat/login', 'main']);

  // Both branches are checked out, so "Existing branch" has nothing to offer.
  stub.__quickPickResponses.push({ value: 'existing' });
  await runCommand('agntree.addWorktree', row);
  assert.ok(shown('All branches are already checked out'));
});

test('Create Worktree adds the new folder to the managed workspace only when its Project is Open', async (t) => {
  const { scratch, repo, repoPath, managedWorkspace, worktreeAt } = setup(t);
  await managedWorkspace.add([repoPath]);
  stub.workspace.workspaceFile = { fsPath: managedWorkspace.workspaceFilePath };
  stub.workspace.workspaceFolders = [{ uri: { fsPath: repoPath } }];

  stub.__quickPickResponses.push({ value: 'new' }, { label: 'main' });
  stub.__inputResponses.push('feat/open');
  await runCommand('agntree.addWorktree', { itemType: 'repository', data: repo });
  const created = path.join(scratch, 'app-worktrees', 'feat-open');
  assert.equal(worktreeAt(created)?.branch, 'feat/open');
  assert.equal(managedWorkspace.has(created), true);
  assert.deepEqual(
    stub.workspace.workspaceFolders.map((folder) => folder.uri.fsPath),
    [repoPath, created]
  );
});

test('Delete Worktree closes its sessions before removing the directory, and a detached worktree never deletes a branch', async (t) => {
  const { scratch, repoPath, worktreeAt, branches, forgotten } = setup(t);
  // A branch that shares the detached worktree's folder name.
  git(repoPath, 'branch', 'release');
  const detached = path.join(scratch, 'release');
  git(repoPath, 'worktree', 'add', '-q', '--detach', detached);
  const worktree = worktreeAt(detached);
  assert.equal(worktree.name, 'release');
  assert.equal(worktree.branch, undefined);

  stub.__warningResponses.push('Delete Worktree Only');
  await runCommand('agntree.deleteWorktree', { itemType: 'worktree', data: worktree });

  const confirmation = stub.__messages.find((args) => String(args[0]).startsWith('Delete worktree'))!;
  assert.deepEqual(confirmation.slice(2), ['Delete Worktree Only'], 'no branch to delete');
  assert.equal(fs.existsSync(detached), false);
  assert.deepEqual(stub.__deleted.at(-1)?.options, { recursive: true, useTrash: true }, 'the directory goes to the Trash');
  assert.deepEqual(forgotten, [{ path: detached, existed: true }]);
  assert.deepEqual(branches(), ['main', 'release']);
});

test('a host without a usable Trash deletes the worktree permanently and says so', async (t) => {
  const { scratch, repoPath, worktreeAt } = setup(t);
  const linked = path.join(scratch, 'app-feature');
  git(repoPath, 'worktree', 'add', '-q', '-b', 'feature', linked);
  const trash = stub.workspace.fs.delete;
  stub.workspace.fs.delete = async () => {
    throw new Error('no trash on this host');
  };
  t.after(() => {
    stub.workspace.fs.delete = trash;
  });

  stub.__warningResponses.push('Delete Worktree Only');
  await runCommand('agntree.deleteWorktree', { itemType: 'worktree', data: worktreeAt(linked) });

  assert.equal(fs.existsSync(linked), false);
  assert.match(shownMessages().at(-1) ?? '', /permanently/);
});

test('Delete Worktree & Branch removes the worktree and its branch', async (t) => {
  const { scratch, repoPath, managedWorkspace, worktreeAt, branches } = setup(t);
  const linked = path.join(scratch, 'app-feature');
  git(repoPath, 'worktree', 'add', '-q', '-b', 'feature', linked);
  await managedWorkspace.add([repoPath, linked]);
  stub.workspace.workspaceFile = { fsPath: managedWorkspace.workspaceFilePath };
  stub.workspace.workspaceFolders = [{ uri: { fsPath: repoPath } }, { uri: { fsPath: linked } }];

  stub.__warningResponses.push('Delete Worktree & Branch');
  await runCommand('agntree.deleteWorktree', { itemType: 'worktree', data: worktreeAt(linked) });

  assert.equal(fs.existsSync(linked), false);
  assert.deepEqual(branches(), ['main']);
  assert.equal(managedWorkspace.has(linked), false);
  assert.deepEqual(
    stub.workspace.workspaceFolders.map((folder) => folder.uri.fsPath),
    [repoPath]
  );
});

test('Rebase offers the remote branches, recommended main first, but not the branch’s own remote copy', async (t) => {
  const { scratch, repoPath, worktreeAt } = setup(t);
  const remote = path.join(scratch, 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  git(repoPath, 'remote', 'add', 'origin', remote);
  git(repoPath, 'push', '-q', 'origin', 'main');
  const linked = path.join(scratch, 'app-feature');
  git(repoPath, 'worktree', 'add', '-q', '-b', 'feature', linked);
  git(linked, 'push', '-q', 'origin', 'feature', 'main:zeta');

  let offered: string[] = [];
  stub.__setQuickPickHandler((items: { branch: string }[]) => {
    offered = items.map((item) => item.branch);
    return undefined;
  });
  await runCommand('agntree.rebaseWorktree', { itemType: 'worktree', data: worktreeAt(linked) });

  assert.deepEqual(offered, ['origin/main', 'origin/zeta']);
});
