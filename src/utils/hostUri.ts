import * as vscode from 'vscode';

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
