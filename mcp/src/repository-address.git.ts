import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { RepositoryAddressFunction } from './repository-address.ts';

/**
 * `execFile` of Node.js as a function that returns a promise.
 */
const execFileAsync = promisify(execFile);

/**
 * Prefix of the name of every address of a repository server.
 */
const ADDRESS_PREFIX = 'atomic-workflow-';

/**
 * `RepositoryAddressFunction` that identifies a repository by its common git directory, which all worktrees of the
 * repository share. The address is a named pipe on Windows and a Unix domain socket in the temporary directory
 * elsewhere.
 */
export const gitRepositoryAddress: RepositoryAddressFunction = async (directory) => {
  const commandLine = ['rev-parse', '--path-format=absolute', '--git-common-dir'];
  const { stdout } = await execFileAsync('git', commandLine, { cwd: directory, windowsHide: true });
  const name = `${ADDRESS_PREFIX}${hash(stdout.trim())}`;
  return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`);
};

/**
 * Returns a short hash of the path `gitDirectory`. Paths that differ only in their separators, or on Windows only in
 * their case, give the same hash.
 */
const hash = (gitDirectory: string): string => {
  const normalized = resolve(gitDirectory);
  const key = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
};
