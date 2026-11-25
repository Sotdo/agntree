import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { GitService } from '../../src/services/GitService';
import { ManagedWorkspaceService } from '../../src/services/ManagedWorkspaceService';
import { registerRepositoryCommands } from '../../src/commands/repository';
import { makeStorage, runCommand, shown, shownMessages, stub, tempDir } from './support';

beforeEach(() => stub.__reset());

function setup(t: { after(fn: () => void): void }) {
  const storage = makeStorage();
  const managedWorkspace = new ManagedWorkspaceService(
    { globalState: { get: () => undefined, update: async () => undefined } } as never,
    tempDir(t)
  );
  let refreshes = 0;
  const forgotten: string[] = [];
  registerRepositoryCommands({ subscriptions: [] } as never, {
    storageService: storage,
    gitService: new GitService(),
    managedWorkspace,
    forgetWorktrees: (worktrees) => forgotten.push(...worktrees.map((worktree) => worktree.path)),
    refreshTree: () => refreshes++,
  });
  const add = async (folder: string) => {
    stub.__openDialogResponses.push([{ fsPath: folder }]);
    await runCommand('agntree.addRepository');
    return shownMessages().at(-1);
  };
  const roots = () => storage.getRepositories().map((repo) => repo.name);
  return { storage, add, roots, forgotten, managedWorkspace, refreshes: () => refreshes };
}

/** A repository with one commit and one linked worktree, on disk. */
function projectWithWorktree(t: { after(fn: () => void): void }) {
  const scratch = tempDir(t);
  const repoPath = path.join(scratch, 'app');
  fs.mkdirSync(repoPath);
  execFileSync('git', ['init', '-q', repoPath]);
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'init'], {
    cwd: repoPath,
  });
  const linked = path.join(scratch, 'app-feature');
  execFileSync('git', ['worktree', 'add', '-q', '-b', 'feature', linked], { cwd: repoPath });
  return { scratch, repoPath, linked };
}

test('Add Project offers git init for a plain folder and refuses a bare repository', async (t) => {
  const scratch = tempDir(t);
  const plain = path.join(scratch, 'scratchpad');
  const repo = path.join(scratch, 'notes');
  const bare = path.join(scratch, 'bare.git');
  fs.mkdirSync(plain);
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  execFileSync('git', ['init', '-q', repo]);
  execFileSync('git', ['init', '-q', '--bare', bare]);
  const { add, roots } = setup(t);

  // Declining the init leaves the folder out and creates nothing.
  await add(plain);
  assert.ok(shown('is not a git repository'));
  assert.equal(fs.existsSync(path.join(plain, '.git')), false);
  assert.deepEqual(roots(), []);

  stub.__warningResponses.push('Initialize Git Repository');
  assert.match((await add(plain)) ?? '', /^Added Project: scratchpad/);
  assert.equal(fs.existsSync(path.join(plain, '.git')), true);
  assert.match((await add(path.join(repo, 'src'))) ?? '', /^Added Project: notes/);
  assert.match((await add(bare)) ?? '', /not a working tree/);
  assert.deepEqual(roots(), ['scratchpad', 'notes']);
});

test('Add Project to Workspace adds every worktree folder and Remove takes them out', async (t) => {
  const { repoPath, linked } = projectWithWorktree(t);
  const { storage, add, managedWorkspace } = setup(t);
  await add(repoPath);
  const row = { itemType: 'repository', data: storage.getRepositories()[0] };

  await runCommand('agntree.addToWorkspace', row);
  assert.deepEqual([...managedWorkspace.folderPaths].sort(), [repoPath, linked].sort());

  await runCommand('agntree.removeFromWorkspace', row);
  assert.deepEqual([...managedWorkspace.folderPaths], []);
});

test('Move Up and Move Down reorder roots; a refused move explains itself without a refresh', async (t) => {
  const { storage, roots, refreshes } = setup(t);
  const first = storage.addRepository('first', '/first');
  storage.addRepository('second', '/second');
  const row = { itemType: 'repository', data: first };

  await runCommand('agntree.moveRepositoryDown', row);
  assert.deepEqual(roots(), ['second', 'first']);
  await runCommand('agntree.moveRepositoryUp', row);
  assert.deepEqual(roots(), ['first', 'second']);
  assert.equal(refreshes(), 2);

  await runCommand('agntree.moveRepositoryUp', row);
  assert.equal(refreshes(), 2);
  assert.equal(shownMessages().at(-1), '"first" is already at the top.');
});

test('Remove forgets every worktree of the Project and drops its folders from the workspace', async (t) => {
  const { repoPath, linked } = projectWithWorktree(t);
  const { storage, add, roots, forgotten, managedWorkspace } = setup(t);
  await add(repoPath);
  const row = { itemType: 'repository', data: storage.getRepositories()[0] };
  await runCommand('agntree.addToWorkspace', row);

  await runCommand('agntree.removeRepository', row);
  assert.deepEqual(roots(), ['app'], 'nothing changes without confirmation');
  assert.deepEqual(forgotten, []);
  assert.deepEqual([...managedWorkspace.folderPaths].sort(), [repoPath, linked].sort());

  stub.__warningResponses.push('Remove');
  await runCommand('agntree.removeRepository', row);
  assert.deepEqual(roots(), []);
  assert.deepEqual(forgotten.map((p) => fs.realpathSync(p)).sort(), [fs.realpathSync(repoPath), fs.realpathSync(linked)].sort());
  assert.deepEqual([...managedWorkspace.folderPaths], []);
});
