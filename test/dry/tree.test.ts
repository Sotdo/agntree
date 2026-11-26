import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { WorkspaceTreeItem, WorkspacesTreeProvider } from '../../src/providers/WorkspacesTreeProvider';
import { HarnessRegistry } from '../../src/harnesses/HarnessRegistry';
import { HarnessAdapter, SessionMetadata } from '../../src/harnesses/types';
import { ChatSession, BranchListing, Repository, RepositoryWorktrees, Worktree } from '../../src/types';
import { fakeAdapter, fakeNativeUi, makeStorage, stub, tempDir, waitFor, worktreeRecord } from './support';

beforeEach(() => stub.__reset());

const MINUTE = 60_000;
const noPRs = { getCachedPRInfo: () => null, fetchPRInfo: async () => null, clearCache: () => undefined };
const terminals = { onTerminalStateChange: () => ({ dispose: () => undefined }), isActive: () => false };

function provider(
  t: { after(fn: () => void): void },
  storage: ReturnType<typeof makeStorage>,
  listWorktrees: (repo: Repository) => RepositoryWorktrees,
  adapters: HarnessAdapter[],
  listBranches: (repo: Repository) => string[] = () => []
) {
  const tree = new WorkspacesTreeProvider(
    storage,
    {
      listRepositoryWorktrees: (_rootPath: string, repoId: string) =>
        listWorktrees(storage.getRepository(repoId)!),
      getAheadBehind: () => null,
      getLocalBranches: (rootPath: string) =>
        listBranches(storage.getRepositories().find((repo) => repo.rootPath === rootPath)!),
    } as never,
    terminals as never,
    new HarnessRegistry(adapters),
    noPRs as never,
    vscode.Uri.file('/extension')
  );
  t.after(() => tree.dispose());
  return tree;
}

/** One git worktree holding a Claude chat, an opencode chat, and a new chat. */
function sessionRows(t: { after(fn: () => void): void }) {
  const now = Date.now();
  const storage = makeStorage();
  const repo = storage.addRepository('demo', '/work/demo');
  const worktree = worktreeRecord({ repoId: repo.id, path: '/work/demo' });
  const chat = (id: string, harness: ChatSession['harness'], sessionId: string | null, createdAt: number) => {
    const created = storage.createChat(worktree.id, harness, id);
    return storage.updateChat(created.id, { harnessSessionId: sessionId, createdAt })!;
  };
  const claude = chat('claude', 'claude', 'claude-1', 1);
  const opencode = chat('opencode', 'opencode', 'ses_2', 2);
  const fresh = chat('new', 'opencode', null, 3);
  storage.toggleStar(claude.id);

  let exported = false;
  const claudeUi = fakeNativeUi('Claude Code UI', { contextValueSuffix: 'ClaudeUi' });
  const adapters = [
    fakeAdapter('claude', {
      nativeUi: claudeUi.nativeUi,
      getSessionMetadata: async (): Promise<SessionMetadata> => ({
        lastActivity: now - 16 * MINUTE,
        preview: [{ text: 'claude prompt', timestamp: now - 16 * MINUTE }],
        lastReply: { text: 'claude reply', timestamp: now - 15 * MINUTE },
      }),
    }),
    // Like the opencode service: previews need an export, which metadata
    // includes once it is cached.
    fakeAdapter('opencode', {
      getSessionMetadata: async (): Promise<SessionMetadata> => ({
        lastActivity: now - 33 * MINUTE,
        preview: exported ? [{ text: 'opencode prompt', timestamp: null }] : [],
        model: 'provider/model',
        agent: 'build',
      }),
      getPreview: async () => {
        exported = true;
        return [{ text: 'opencode prompt', timestamp: null }];
      },
    }),
  ];
  const tree = provider(t, storage, () => ({ isGit: true, worktrees: [worktree] }), adapters);
  const row = new WorkspaceTreeItem(worktree.name, 1, 'worktree', worktree, 'worktree');
  const rows = async () => {
    const items = await tree.getChildren(row);
    return Object.assign(new Map(items.map((item) => [item.label, item])), { order: items.map((item) => item.label) });
  };
  return { tree, rows, claude, opencode, fresh, exported: () => exported };
}

const mark = (item: vscode.TreeItem) => ((item.iconPath as { light: vscode.Uri }).light.path.split('/').pop());

test('rows keep creation order and show only what changes: time or "new", a star, and the harness mark', async (t) => {
  const { rows } = sessionRows(t);
  const items = await rows();
  assert.deepEqual(items.order, ['new', 'opencode', 'claude'], 'newest first; stars and activity never reorder');
  assert.deepEqual(
    items.order.map((label) => `${items.get(label)!.description} ${mark(items.get(label)!)} ${items.get(label)!.contextValue}`),
    ['new opencode-light-new.svg chat', '33m opencode-light-closed.svg chat', '★ 16m claude-light-closed.svg starredChatClaudeUi']
  );
});

test('an open chat, by terminal or native UI, shows the done mark and running context in place', async (t) => {
  const { tree, rows, claude } = sessionRows(t);
  tree.setChatOpenProvider((chat) => chat.id === claude.id);
  const items = await rows();
  assert.deepEqual(items.order, ['new', 'opencode', 'claude']);
  const row = items.get('claude')!;
  assert.equal(row.contextValue, 'runningStarredChatClaudeUi');
  assert.equal(mark(row), 'claude-light-done.svg');

  tree.setTurnStateProvider(() => 'working');
  assert.equal(mark((await rows()).get('claude')!), 'claude-light-working.svg');
});

test('tooltips brief the last exchange; a lazy harness fetches its preview only on hover', async (t) => {
  const { tree, rows, exported } = sessionRows(t);
  const items = await rows();
  const tooltip = (item: vscode.TreeItem) => (item.tooltip as vscode.MarkdownString | undefined)?.value;

  assert.match(tooltip(items.get('claude')!) ?? '', /Last exchange[\s\S]*claude prompt[\s\S]*claude reply/);
  assert.match(tooltip(items.get('new')!) ?? '', /No messages yet/);

  const opencode = items.get('opencode')!;
  assert.equal(opencode.tooltip, undefined, 'rendering does not export');
  assert.equal(exported(), false);
  await tree.resolveTreeItem(opencode, opencode as WorkspaceTreeItem);
  assert.ok(exported());
  assert.match(tooltip(opencode) ?? '', /opencode prompt[\s\S]*provider\/model · build/);
});

test('a Project lists its local branches; a branch with a worktree opens it, one without is greyed', async (t) => {
  const storage = makeStorage();
  const repo = storage.addRepository('demo', '/work/demo');
  const main = worktreeRecord({ id: 'wt-main', repoId: repo.id, name: 'main', branch: 'main', path: '/work/demo' });
  const feature = worktreeRecord({
    id: 'wt-feature',
    repoId: repo.id,
    name: 'feature',
    branch: 'feature/x',
    path: '/work/feature',
    isMain: false,
  });
  const detached = worktreeRecord({
    id: 'wt-detached',
    repoId: repo.id,
    name: 'release',
    path: '/work/release',
    isMain: false,
    head: 'abcdef1234567',
  });
  const tree = provider(
    t,
    storage,
    () => ({ isGit: true, worktrees: [main, feature, detached] }),
    [fakeAdapter('claude')],
    () => ['feature/x', 'main', 'unused']
  );

  const [repoRow] = await tree.getChildren();
  const children = await tree.getChildren(repoRow);
  assert.deepEqual(children.map((item) => item.label), ['main', 'feature', 'release', 'Branches'], 'worktrees, then the group');
  const group = children.at(-1)!;
  assert.equal(group.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

  const rows = await tree.getChildren(group);
  assert.deepEqual(rows.map((item) => item.label), ['feature/x', 'main', 'unused', 'abcdef1']);
  assert.deepEqual(rows.map((item) => item.description), ['feature', undefined, 'no worktree', 'detached · release']);
  assert.equal((rows[0].data as BranchListing).worktree?.id, 'wt-feature');
  assert.equal((rows[2].data as BranchListing).worktree, undefined);
  assert.equal((rows[3].data as BranchListing).worktree?.id, 'wt-detached');
  assert.equal(tree.getParent(rows[0])?.label, 'Branches', 'reveal goes through the group');
  assert.equal(tree.getParent(group)?.label, 'demo');
});

test('worktree lookups list each repository at most once', (t) => {
  const storage = makeStorage();
  storage.addRepository('a', '/work/a');
  storage.addRepository('b', '/work/b');
  const listed: string[] = [];
  const tree = provider(t, storage, (repo) => {
    listed.push(repo.name);
    return { isGit: true, worktrees: [worktreeRecord({ id: `wt-${repo.name}`, repoId: repo.id, path: repo.rootPath })] };
  }, [fakeAdapter('claude')]);

  assert.equal(tree.getWorktreeById('wt-b')?.path, '/work/b');
  assert.equal(tree.getWorktreeById('wt-b')?.path, '/work/b');
  assert.equal(tree.findWorktreeByPath('/work/a')?.id, 'wt-a');
  assert.deepEqual(listed, ['a', 'b']);
});

test('worktree lookup resolves symlinks to match canonical worktree paths', (t) => {
  if (process.platform === 'win32') return;
  const dir = tempDir(t);
  const real = fs.realpathSync(path.join(dir));
  const physical = path.join(real, 'real-repo');
  const link = path.join(real, 'link-repo');
  fs.mkdirSync(physical);
  fs.symlinkSync(physical, link);

  const storage = makeStorage();
  const repo = storage.addRepository('repo', physical);
  const tree = provider(
    t,
    storage,
    () => ({ isGit: true, worktrees: [worktreeRecord({ id: 'wt-real', repoId: repo.id, path: physical })] }),
    [fakeAdapter('claude')]
  );

  assert.equal(tree.findWorktreeByPath(link)?.id, 'wt-real');
});

test('a plain folder shows its sessions directly and follows git init and removal through its watcher', async (t) => {
  const storage = makeStorage();
  const folder = storage.addRepository('notes', '/work/notes');
  storage.addRepository('empty', '/work/empty');
  let isGit = false;
  const worktreeOf = (repo: Repository): Worktree =>
    worktreeRecord({ id: `wt-${repo.name}`, repoId: repo.id, name: isGit ? 'main' : repo.name, path: repo.rootPath });
  const tree = provider(t, storage, (repo) => ({ isGit, worktrees: [worktreeOf(repo)] }), [fakeAdapter('claude')]);
  const session = storage.createChat('wt-notes', 'claude', 'Folder session', { harnessSessionId: 'claude-folder' });
  const rootRow = async () => (await tree.getChildren())[0];
  const fireGitDir = (event: '__fireCreate' | '__fireDelete') => {
    for (const watcher of [...stub.__fileWatchers]) {
      if (!watcher.disposed && watcher.pattern.base === folder.rootPath) watcher[event]();
    }
  };

  const [notes, empty] = await tree.getChildren();
  assert.equal(notes.contextValue, 'folderRepository');
  assert.match(String(notes.tooltip), /Not a git repository/);
  assert.equal(notes.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);
  assert.equal(empty.collapsibleState, vscode.TreeItemCollapsibleState.None, 'nothing to expand');
  const [chatRow] = await tree.getChildren(notes);
  assert.equal(chatRow.data.id, session.id);
  assert.equal(tree.getParent(chatRow)?.id, notes.id, 'reveal goes through the folder row');
  assert.equal(tree.getWorktreeForItem(notes)?.id, 'wt-notes');

  isGit = true;
  fireGitDir('__fireCreate');
  await waitFor(async () => (await rootRow()).contextValue === 'repository', 'the git upgrade');
  const parent = tree.getParent(chatRow);
  assert.equal(parent?.itemType, 'worktree', 'reveal now goes through the main worktree');
  assert.equal(tree.getWorktreeForItem(await rootRow()), undefined);
  assert.deepEqual((await tree.getChildren(parent)).map((item) => item.data.id), [session.id], 'the chat stays bound');

  isGit = false;
  fireGitDir('__fireDelete');
  await waitFor(async () => (await rootRow()).contextValue === 'folderRepository', 'the downgrade');
  assert.equal(tree.getParent(chatRow)?.itemType, 'repository');
});
