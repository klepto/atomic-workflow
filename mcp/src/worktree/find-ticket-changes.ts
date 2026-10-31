import { branchExists } from './branches.ts';
import {
  isBig,
  isGeneratedPath,
  type ListedFile,
  parseBlobSizes,
  parseGeneratedAttributes,
  parseListedFiles,
  splitPatch,
} from './changed-files.ts';
import { TASK_TRAILER, TICKET_TRAILER } from './merge-ticket.ts';
import { gitFailure, gitOutput } from './run-git.ts';
import { WorktreeError } from './worktree-error.ts';
import { branchRef, taskBranchOf } from './worktree-layout.ts';
import type { ChangedFile, TicketChanges, WorkName } from './worktrees.ts';
import type { WorktreesContext } from './worktrees-context.ts';

/**
 * Arguments of `git show` that print only the patch of a commit, with renames detected and paths not quoted.
 */
const SHOW_PATCH: readonly string[] = [
  '-c',
  'core.quotePath=false',
  'show',
  '--format=',
  '--no-color',
  '--no-ext-diff',
  '-M',
];

/**
 * Returns the commit that holds the landed work of the ticket `ticket` of the task `task` in the repository of
 * `context`, with the files that it changes: the latest commit whose trailers name both, on the task branch while it
 * exists, else on the base branch `baseBranch`. Each file that is not big comes with its section of the patch. If
 * neither branch exists, or neither holds such a commit, returns `undefined` instead. If git fails to find or to show
 * the commit, rejects with the error of `gitFailure`.
 */
export const findTicketChanges = async (
  task: WorkName,
  ticket: WorkName,
  baseBranch: string | null,
  context: WorktreesContext,
): Promise<TicketChanges | undefined> => {
  const commit = await findTicketCommit(task, ticket, baseBranch, context);
  if (commit === undefined) return undefined;
  const listed = await listFiles(commit, context);
  const [sizes, attributes] = await Promise.all([
    blobSizes(listed, context),
    generatedAttributes(commit, listed, context),
  ]);
  const big = listed.filter((file) => isBig(file, sizes));
  const patches = await smallPatches(commit, listed, big, context);
  const files = listed.map(
    (file): ChangedFile => ({
      path: file.path,
      oldPath: file.oldPath,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      binary: file.binary,
      generated: attributes.get(file.path) ?? isGeneratedPath(file.path),
      patch: patches.get(file) ?? null,
    }),
  );
  return { commit, files };
};

/**
 * Returns the section of the patch of the file `path` of the commit `commit`, in the form of `ChangedFile.patch`,
 * where `commit` must be the commit that `findTicketChanges` finds for the ticket `ticket` of the task `task`. If the
 * commit does not change a file named `path`, returns `undefined` instead. If `commit` is no longer the commit of the
 * ticket, rejects with `not-allowed`. If git fails, rejects with the error of `gitFailure`.
 */
export const findTicketFilePatch = async (
  task: WorkName,
  ticket: WorkName,
  baseBranch: string | null,
  commit: string,
  path: string,
  context: WorktreesContext,
): Promise<string | undefined> => {
  const found = await findTicketCommit(task, ticket, baseBranch, context);
  if (found !== commit) {
    throw new WorktreeError(
      'not-allowed',
      `The changes of ticket ${ticket.id} of task ${task.id} moved to another commit than ${commit}, so reload the review`,
    );
  }
  const file = (await listFiles(commit, context)).find((listed) => listed.path === path);
  if (file === undefined) return undefined;
  // Both paths of a rename go in the pathspec, so that git still pairs them.
  const paths = file.oldPath === null ? [file.path] : [file.oldPath, file.path];
  const stdout = await gitStdout(
    [...SHOW_PATCH, commit, '--', ...paths.map((each) => `:(literal)${each}`)],
    undefined,
    context,
  );
  return splitPatch(stdout).join('');
};

/**
 * Returns the id of the latest commit whose trailers name the ticket `ticket` of the task `task`, on the task branch
 * while it exists, else on the base branch `baseBranch`. If neither branch exists, or neither holds such a commit,
 * returns `undefined` instead. If git fails, rejects with the error of `gitFailure`.
 */
const findTicketCommit = async (
  task: WorkName,
  ticket: WorkName,
  baseBranch: string | null,
  context: WorktreesContext,
): Promise<string | undefined> => {
  const taskBranch = taskBranchOf(task);
  const branch = (await branchExists(taskBranch, context)) ? taskBranch : baseBranch;
  if (branch === null || !(await branchExists(branch, context))) return undefined;
  const search = [
    'log',
    '-1',
    '--format=%H',
    '--all-match',
    // Each pattern matches a whole line, so ticket 1 does not match the trailer of ticket 11. A slug holds no
    // character that a regular expression reads as special.
    `--grep=^${TASK_TRAILER}: ${task.id}-${task.slug}$`,
    `--grep=^${TICKET_TRAILER}: ${ticket.id}-${ticket.slug}$`,
    branchRef(branch),
  ];
  const commit = await gitOutput(context.layout.checkout, search, context.runGit);
  return commit === '' ? undefined : commit;
};

/**
 * Returns the files that the commit `commit` changes, in the order of `git show -M`. If git fails, rejects with the
 * error of `gitFailure`.
 */
const listFiles = async (commit: string, context: WorktreesContext): Promise<readonly ListedFile[]> =>
  parseListedFiles(
    await gitStdout([...SHOW_PATCH, '--raw', '--numstat', '--no-abbrev', '-z', commit], undefined, context),
  );

/**
 * Returns the sizes in bytes of the old and the new blobs of the files `files`, by their ids. If git fails, rejects
 * with the error of `gitFailure`.
 */
const blobSizes = async (
  files: readonly ListedFile[],
  context: WorktreesContext,
): Promise<ReadonlyMap<string, number>> => {
  const blobs = files.flatMap((file) => [file.oldBlob, file.newBlob]).filter((blob) => blob !== null);
  if (blobs.length === 0) return new Map();
  return parseBlobSizes(await gitStdout(['cat-file', '--batch-check'], `${blobs.join('\n')}\n`, context));
};

/**
 * Returns the attribute `linguist-generated` of the paths of the files `files`, as the commit `commit` sets it, by
 * their paths. A path whose attribute is unspecified has no entry. If git fails, rejects with the error of
 * `gitFailure`.
 */
const generatedAttributes = async (
  commit: string,
  files: readonly ListedFile[],
  context: WorktreesContext,
): Promise<ReadonlyMap<string, boolean>> => {
  if (files.length === 0) return new Map();
  // The attributes come from the commit itself, so a review shows what the commit declares, not the main checkout.
  const commandLine = ['check-attr', '--stdin', '-z', `--source=${commit}`, 'linguist-generated'];
  const input = files.map((file) => `${file.path}\0`).join('');
  return parseGeneratedAttributes(await gitStdout(commandLine, input, context));
};

/**
 * Returns the section of the patch of the commit `commit` for each file of `files` that is not one of the big files
 * `big`, by its file. Rejects if git fails, with the error of `gitFailure`, or if git shows another number of files.
 */
const smallPatches = async (
  commit: string,
  files: readonly ListedFile[],
  big: readonly ListedFile[],
  context: WorktreesContext,
): Promise<ReadonlyMap<ListedFile, string>> => {
  const small = files.filter((file) => !big.includes(file));
  if (small.length === 0) return new Map();
  // Both paths of a big rename stay out, so that neither shows as an added or a deleted file.
  const excluded = big.flatMap((file) => (file.oldPath === null ? [file.path] : [file.oldPath, file.path]));
  const pathspec = excluded.length === 0 ? [] : ['--', ...excluded.map((path) => `:(exclude,literal)${path}`)];
  const sections = splitPatch(await gitStdout([...SHOW_PATCH, commit, ...pathspec], undefined, context));
  if (sections.length !== small.length) {
    throw new Error(`Git showed ${sections.length} files of commit ${commit} where ${small.length} were expected`);
  }
  return new Map(small.map((file, index) => [file, sections[index] ?? '']));
};

/**
 * Returns the standard output of git with the arguments `commandLine` in the main checkout of `context`, with `input`
 * on its standard input when given. If git exits with an error, rejects with the error of `gitFailure`.
 */
const gitStdout = async (
  commandLine: readonly string[],
  input: string | undefined,
  context: WorktreesContext,
): Promise<string> => {
  const output = await context.runGit(context.layout.checkout, commandLine, input);
  if (output.exitCode !== 0) throw gitFailure(context.layout.checkout, commandLine, output);
  return output.stdout;
};
