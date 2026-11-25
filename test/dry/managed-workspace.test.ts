import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { ManagedWorkspaceService } from '../../src/services/ManagedWorkspaceService';
import { stub, tempDir } from './support';

beforeEach(() => stub.__reset());

const context = { globalState: { get: () => undefined, update: async () => undefined } };

/** A service whose workspace file lives in a scratch home. */
function setup(t: { after(fn: () => void): void }) {
  const home = tempDir(t);
  const service = new ManagedWorkspaceService(context as never, home);
  const file = path.join(home, '.agntree', 'agntree.code-workspace');
  const folder = (name: string) => {
    const folderPath = path.join(home, name);
    fs.mkdirSync(folderPath, { recursive: true });
    return folderPath;
  };
  const fileFolders = () =>
    (JSON.parse(fs.readFileSync(file, 'utf8')) as { folders: { path: string }[] }).folders.map((entry) => entry.path);
  const windowFolders = () => stub.workspace.workspaceFolders.map((entry) => entry.uri.fsPath);
  const openWindow = (...folders: string[]) => {
    stub.workspace.workspaceFile = { fsPath: file };
    stub.workspace.workspaceFolders = folders.map((folderPath) => ({ uri: { fsPath: folderPath } }));
  };
  return { home, service, file, folder, fileFolders, windowFolders, openWindow };
}

test('Add and Remove keep the workspace file and the open window in step', async (t) => {
  const { service, folder, fileFolders, windowFolders, openWindow } = setup(t);
  const app = folder('app');
  const feature = folder('app-feature');
  const bugfix = folder('app-bugfix');

  await service.add([app, feature]);
  assert.deepEqual([...service.folderPaths], [app, feature]);
  assert.deepEqual(fileFolders(), [app, feature]);

  openWindow(app, feature);
  assert.equal(service.isOpen(), true);
  await service.add([bugfix]);
  assert.deepEqual(windowFolders(), [app, feature, bugfix]);

  await service.remove([feature]);
  assert.deepEqual([...service.folderPaths], [app, bugfix]);
  assert.deepEqual(fileFolders(), [app, bugfix]);
  assert.deepEqual(windowFolders(), [app, bugfix]);
  assert.equal(service.has(feature), false);
  assert.equal(service.has(app), true);
});

test('reorderToFirst moves the folder first in both, and a refused window edit restores the file', async (t) => {
  const { service, folder, fileFolders, windowFolders, openWindow } = setup(t);
  const app = folder('app');
  const feature = folder('app-feature');
  const bugfix = folder('app-bugfix');
  await service.add([app, feature, bugfix]);
  openWindow(app, feature, bugfix);

  await service.reorderToFirst(bugfix);
  assert.deepEqual([...service.folderPaths], [bugfix, app, feature]);
  assert.deepEqual(fileFolders(), [bugfix, app, feature]);
  assert.deepEqual(windowFolders(), [bugfix, app, feature]);

  const update = stub.workspace.updateWorkspaceFolders;
  stub.workspace.updateWorkspaceFolders = () => false;
  t.after(() => {
    stub.workspace.updateWorkspaceFolders = update;
  });
  await service.reorderToFirst(app);
  assert.deepEqual([...service.folderPaths], [bugfix, app, feature]);
  assert.deepEqual(fileFolders(), [bugfix, app, feature]);
  assert.deepEqual(windowFolders(), [bugfix, app, feature]);
});

test('folders added in a Remote-SSH window carry the remote host, not the local filesystem', async (t) => {
  const { service, folder, openWindow } = setup(t);
  const app = folder('app');
  const feature = folder('app-feature');
  openWindow(app);
  stub.workspace.workspaceFolders[0].uri.authority = 'ssh-remote+dev';
  stub.env.remoteName = 'ssh-remote';

  await service.add([feature]);
  const added = stub.workspace.workspaceFolders.at(-1)!;
  assert.deepEqual([added.uri.scheme, added.uri.authority, added.uri.fsPath], ['vscode-remote', 'ssh-remote+dev', feature]);
});

test('a workspace file VS Code rewrote with relative paths still matches its folders', async (t) => {
  const { service, file, folder, openWindow, windowFolders } = setup(t);
  const app = folder('app');
  const feature = folder('app-feature');
  openWindow(app, feature);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ folders: [{ name: 'app', path: '../app' }, { name: 'app-feature', path: '../app-feature' }] }, null, 2)
  );
  await service.load();

  assert.equal(service.has(app), true);
  assert.equal(service.has(feature), true);
  await service.reorderToFirst(feature);
  assert.deepEqual(windowFolders(), [feature, app]);
  assert.deepEqual(
    (JSON.parse(fs.readFileSync(file, 'utf8')) as { folders: { path: string }[] }).folders.map((entry) => entry.path),
    [feature, app]
  );
});

test('a malformed workspace file is refused, never overwritten', async (t) => {
  const { home, service, file, folder } = setup(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ not json');

  await assert.rejects(service.load());
  await assert.rejects(service.add([folder('app')]));
  assert.equal(fs.readFileSync(file, 'utf8'), '{ not json');

  // A folder written in a shape Agntree does not use is refused the same way.
  const partial = JSON.stringify({ folders: [{ path: folder('app') }, { uri: 'file:///other' }] }, null, 2);
  fs.writeFileSync(file, partial);
  const reread = new ManagedWorkspaceService(context as never, home);
  await assert.rejects(reread.load());
  assert.equal(fs.readFileSync(file, 'utf8'), partial);
});
