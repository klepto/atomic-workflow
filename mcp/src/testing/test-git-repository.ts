import { appendFile, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { processRunGit } from '../worktree/run-git.process.ts';
import { gitOutput } from '../worktree/run-git.ts';

/**
 * Git command that makes a new repository with the branch `main`.
 */
const INIT_COMMAND: readonly string[] = ['init', '--quiet', '--initial-branch=main'];

/**
 * Settings that a new repository adds to its local configuration: a local user and no signing of commits. Written to
 * the file of the configuration directly, since each git command costs a process start.
 */
const LOCAL_SETTINGS = '[user]\n\tname = Test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n';

/**
 * Git commands that make the first commit of a new repository, which adds `README.md`.
 */
const COMMIT_COMMANDS: readonly (readonly string[])[] = [
  ['add', 'README.md'],
  ['commit', '--quiet', '--message', 'Initial commit'],
];

/**
 * Test or suite that runs functions once it ends, such as the `TestContext` of a test.
 */
export interface TestCleanup {
  /**
   * Registers `hook` to run once the test or the suite ends, whether it passes or fails.
   */
  after(hook: () => Promise<void>): void;
}

/**
 * Returns the absolute real path of a new git repository in a new temporary directory, with the branch `main`
 * checked out, a local user name and e-mail, and one commit that adds `README.md`. Registers the removal of the
 * directory with `after` of `context`, such as the `TestContext` of a test, so it goes away whether the test passes or
 * fails.
 * If the directory cannot be made or git fails, rejects, and the directory still goes away after the test.
 */
export const testGitRepository = async (context: TestCleanup): Promise<string> => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'atomic-workflow-test-')));
  context.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'README.md'), '# Test\n');
  await gitOutput(directory, INIT_COMMAND, processRunGit);
  await appendFile(join(directory, '.git', 'config'), LOCAL_SETTINGS);
  for (const commandLine of COMMIT_COMMANDS) await gitOutput(directory, commandLine, processRunGit);
  return directory;
};
