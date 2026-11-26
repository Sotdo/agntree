import * as vscode from 'vscode';

/**
 * VS Code keeps one `globalState` for a window, and a remote window shares the
 * client's store, so a persisted key must name the host it belongs to. A local
 * window keeps the plain key; a remote window suffixes it with its authority.
 */
export function hostKey(key: string): string {
  if (!vscode.env.remoteName) {
    return key;
  }
  const authority = vscode.workspace.workspaceFolders?.[0]?.uri.authority || vscode.env.remoteName;
  return `${key}@${authority}`;
}

/**
 * The URI a folder or workspace file needs in this window. A Remote-SSH window
 * addresses its folders as `vscode-remote://<authority>/<path>`; a local window
 * uses `file:`. The authority comes from an open folder because VS Code does
 * not expose it directly.
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
