import * as os from 'os';
import * as vscode from 'vscode';

/**
 * VS Code keeps one `globalState` for a window, and a remote window shares the
 * client's store, so a persisted key must name the host it belongs to. A local
 * window keeps the plain key; a remote window suffixes it with its remote name
 * and host name. The workspace folder URIs inside a remote extension host are
 * `file:` URIs, so the window's authority is not visible here.
 */
export function hostKey(key: string): string {
  if (!vscode.env.remoteName) {
    return key;
  }
  return `${key}@${vscode.env.remoteName}:${os.hostname()}`;
}

/**
 * The URI a folder or workspace file needs in this window. When a folder URI
 * carries a remote authority, preserve `vscode-remote://`; inside a remote
 * extension host `workspaceFolders` URIs are `file:` (whose authority is empty),
 * and VS Code's IPC layer translates `vscode.Uri.file()` to the remote host.
 */
export function hostUri(fsPath: string): vscode.Uri {
  if (!vscode.env.remoteName) {
    return vscode.Uri.file(fsPath);
  }
  const authority = vscode.workspace.workspaceFolders?.[0]?.uri.authority;
  if (!authority) {
    return vscode.Uri.file(fsPath);
  }
  return vscode.Uri.from({
    scheme: 'vscode-remote',
    authority,
    path: vscode.Uri.file(fsPath).path,
  });
}
