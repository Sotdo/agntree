import * as fs from 'fs';
import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { HarnessId } from '../types';

/**
 * Resolve a harness CLI command from its `agntree.harnessCommands.<harness>`
 * setting. VS Code merges the per-harness settings into one object, so an
 * `agntree.harnessCommands` object saved by an earlier version still applies.
 */
export function getHarnessCommand(harness: HarnessId, fallback: string): string {
  const configured = vscode.workspace
    .getConfiguration('agntree')
    .get<Record<string, string>>('harnessCommands', {});
  const value = configured?.[harness];
  return value && value.trim() ? value.trim() : fallback;
}

/**
 * Quote one argument for a POSIX shell used by a VS Code terminal.
 *
 * This is used for both the executable and values such as Codex's `--cd`
 * path. Terminal launches on Windows need a different quoting strategy; keep
 * that limitation in `ROADMAP.md`. A CLI Agntree runs itself goes through
 * `harnessInvocation()` instead.
 */
export function quoteShellArgument(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Check whether a command is available on PATH (or is an existing executable).
 */
export function commandExists(command: string): Promise<boolean> {
  if (command.includes('/') || command.includes('\\')) {
    try {
      fs.accessSync(command, fs.constants.X_OK);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  return new Promise((resolve) => {
    const probe = process.platform === 'win32' ? 'where' : 'which';
    execFile(
      probe,
      [command],
      { timeout: 3000, windowsHide: true },
      (error, stdout) => {
        resolve(!error && String(stdout).trim().length > 0);
      }
    );
  });
}

/**
 * How to run a harness CLI with an argument list. npm installs CLIs on
 * Windows as `.cmd` shims, which only cmd.exe can start, and Node joins the
 * arguments for cmd.exe unquoted, so each one is quoted for it.
 */
export function harnessInvocation(command: string, args: string[]): { command: string; args: string[]; shell: boolean } {
  if (process.platform !== 'win32') {
    return { command, args, shell: false };
  }
  return { command: quoteForCmd(command), args: args.map(quoteForCmd), shell: true };
}

/**
 * One argument for a cmd.exe command line. Double quotes keep spaces and
 * `&|<>^()` literal; nothing escapes `%` or a quote there, so those are
 * refused rather than passed through.
 */
export function quoteForCmd(value: string): string {
  if (/["%\r\n]/.test(value)) {
    throw new Error(`Agntree cannot pass this to a command on Windows: ${value}`);
  }
  return /^[\w@+=:,.\/\\[\]-]+$/.test(value) ? value : `"${value}"`;
}
