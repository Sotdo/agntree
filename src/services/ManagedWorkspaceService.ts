import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { canonicalPath } from '../utils/paths';
import { hostUri } from '../utils/hostUri';

const PROMPTED_KEY = 'agntree.managedWorkspacePrompted';
/** A folder update that has not landed by now is left as started; the command is not held forever. */
const FOLDER_UPDATE_TIMEOUT_MS = 2000;

interface ManagedWorkspaceFile {
  folders: { path: string }[];
}

/**
 * The per-Host VS Code workspace that holds every worktree of the Open
 * Projects. The file is the durable membership list; the live window is
 * updated in place when it is open. Focus only reorders it.
 */
export class ManagedWorkspaceService {
  private folders: string[] = [];
  private invalid = false;
  private readonly filePath: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    home = os.homedir()
  ) {
    this.filePath = path.join(home, '.agntree', 'agntree.code-workspace');
  }

  get workspaceFilePath(): string {
    return this.filePath;
  }

  get folderPaths(): readonly string[] {
    return this.folders;
  }

  isOpen(): boolean {
    const workspaceFile = vscode.workspace.workspaceFile;
    return workspaceFile ? canonicalPath(workspaceFile.fsPath) === canonicalPath(this.filePath) : false;
  }

  exists(): boolean {
    return fs.existsSync(this.filePath);
  }

  has(fsPath: string): boolean {
    const target = canonicalPath(fsPath);
    return this.folders.some((folder) => canonicalPath(folder) === target);
  }

  async load(): Promise<void> {
    this.folders = await this.readFolders();
  }

  /** Offer the managed workspace once, then leave the command in the menu. */
  async promptOnce(): Promise<void> {
    if (this.context.globalState.get<boolean>(PROMPTED_KEY, false)) {
      return;
    }
    if (!this.exists() || this.isOpen()) {
      return;
    }
    await this.context.globalState.update(PROMPTED_KEY, true);
    const choice = await vscode.window.showInformationMessage(
      'Agntree keeps the worktrees of your Open Projects in one managed workspace. Open it now? VS Code reloads this window.',
      'Open Managed Workspace',
      'Not Now'
    );
    if (choice === 'Open Managed Workspace') {
      await this.open();
    }
  }

  async open(): Promise<void> {
    if (this.isOpen()) {
      return;
    }
    await this.ensureFile();
    await vscode.commands.executeCommand('vscode.openFolder', hostUri(this.filePath), {
      forceNewWindow: false,
    });
  }

  async add(folderPaths: readonly string[]): Promise<void> {
    const additions = folderPaths.filter((folderPath) => !this.has(folderPath));
    if (additions.length === 0) {
      return;
    }
    this.assertWritable();
    this.folders = [...this.folders, ...additions.map(canonicalPath)];
    await this.write();
    if (this.isOpen()) {
      await this.addToWorkspace(additions);
    }
  }

  async remove(folderPaths: readonly string[]): Promise<void> {
    const targets = new Set(folderPaths.map(canonicalPath));
    const remaining = this.folders.filter((folder) => !targets.has(canonicalPath(folder)));
    if (remaining.length === this.folders.length) {
      return;
    }
    this.assertWritable();
    this.folders = remaining;
    await this.write();
    if (this.isOpen()) {
      await this.removeFromWorkspace(folderPaths);
    }
  }

  /**
   * Put one worktree first in the managed workspace. The set does not change.
   * A failed window update restores the previous file order, so the file and
   * the window never disagree.
   */
  async reorderToFirst(fsPath: string): Promise<void> {
    if (!this.isOpen()) {
      return;
    }
    const target = canonicalPath(fsPath);
    const index = this.folders.findIndex((folder) => canonicalPath(folder) === target);
    if (index <= 0) {
      return;
    }
    const previous = this.folders;
    const [first] = this.folders.slice(index, index + 1);
    this.folders = [first, ...this.folders.filter((_, position) => position !== index)];
    await this.write();
    if (!(await this.applyOrder())) {
      this.folders = previous;
      await this.write();
    }
  }

  private async applyOrder(): Promise<boolean> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const byPath = new Map(folders.map((folder) => [canonicalPath(folder.uri.fsPath), folder]));
    const known = this.folders.flatMap((folderPath) => {
      const folder = byPath.get(canonicalPath(folderPath));
      return folder ? [folder] : [];
    });
    const knownPaths = new Set(known.map((folder) => canonicalPath(folder.uri.fsPath)));
    const rest = folders.filter((folder) => !knownPaths.has(canonicalPath(folder.uri.fsPath)));
    const next = [...known, ...rest];
    if (next.every((folder, position) => folder === folders[position])) {
      return true;
    }
    return this.updateWindow(next);
  }

  /**
   * Replace the live folder list in one call and wait for it to land. VS Code
   * applies the change asynchronously and rejects a second call before
   * `onDidChangeWorkspaceFolders` fires, so the next folder read must wait.
   */
  private async updateWindow(
    folders: readonly { uri: vscode.Uri; name?: string }[]
  ): Promise<boolean> {
    const current = vscode.workspace.workspaceFolders ?? [];
    let applied: () => void = () => undefined;
    const changed = new Promise<void>((resolve) => {
      applied = resolve;
    });
    const listener = vscode.workspace.onDidChangeWorkspaceFolders(applied);
    const timer = setTimeout(applied, FOLDER_UPDATE_TIMEOUT_MS);
    const started = vscode.workspace.updateWorkspaceFolders(
      0,
      current.length,
      ...folders.map((folder) => ({ uri: folder.uri, name: folder.name }))
    );
    if (started) {
      await changed;
    }
    clearTimeout(timer);
    listener.dispose();
    return started;
  }

  private async addToWorkspace(folderPaths: readonly string[]): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const existing = new Set(folders.map((folder) => canonicalPath(folder.uri.fsPath)));
    const additions = folderPaths
      .map(canonicalPath)
      .filter((folderPath) => !existing.has(folderPath))
      .map((folderPath) => ({ uri: hostUri(folderPath), name: path.basename(folderPath) }));
    if (additions.length > 0) {
      await this.updateWindow([...folders, ...additions]);
    }
  }

  private async removeFromWorkspace(folderPaths: readonly string[]): Promise<void> {
    const targets = new Set(folderPaths.map(canonicalPath));
    const folders = vscode.workspace.workspaceFolders ?? [];
    const kept = folders.filter((folder) => !targets.has(canonicalPath(folder.uri.fsPath)));
    if (kept.length !== folders.length) {
      await this.updateWindow(kept);
    }
  }

  private assertWritable(): void {
    if (this.invalid) {
      throw new Error(`The managed workspace file is not valid: ${this.filePath}`);
    }
  }

  private async ensureFile(): Promise<void> {
    if (fs.existsSync(this.filePath)) {
      return;
    }
    await this.write();
  }

  private async readFolders(): Promise<string[]> {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const value = JSON.parse(raw) as Partial<ManagedWorkspaceFile>;
      // A file we cannot fully read is refused, not rewritten: adding a folder
      // must never drop an entry another editor wrote.
      if (!Array.isArray(value.folders) || value.folders.some((entry) => typeof entry?.path !== 'string')) {
        throw new Error('the file is not a list of folders with paths');
      }
      this.invalid = false;
      // VS Code rewrites folder paths relative to the workspace file when it
      // saves it, so every entry is resolved against this file's directory.
      const directory = path.dirname(this.filePath);
      return value.folders.map((entry) => path.resolve(directory, entry.path));
    } catch (error) {
      this.invalid = true;
      throw new Error(
        `Could not read ${this.filePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async write(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    const body: ManagedWorkspaceFile = { folders: this.folders.map((folder) => ({ path: folder })) };
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    await fs.promises.rename(temporary, this.filePath);
  }
}
