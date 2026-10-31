import type { ChangedFileStatus } from './worktrees.ts';

/**
 * Most changed lines of a file whose patch comes with the list of the changed files.
 */
const BIG_FILE_LINES = 1000;

/**
 * Most bytes of the old or the new blob of a file whose patch comes with the list of the changed files.
 */
const BIG_FILE_BYTES = 1024 * 1024;

/**
 * Id of the missing blob of an added or a deleted file.
 */
const MISSING_BLOB = /^0+$/;

/**
 * Header of a record of `git show --raw -z`: the modes, the blob ids and the status letter with its score.
 */
const RAW_HEADER = /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(\d*)$/;

/**
 * Line that starts the section of a file in a patch.
 */
const SECTION_START = /^diff --git /gm;

/**
 * Names of the directories whose files are build output.
 */
const GENERATED_DIRECTORIES: readonly string[] = ['dist', 'build'];

/**
 * Endings of the names of minified files and source maps.
 */
const GENERATED_ENDINGS: readonly string[] = ['.min.js', '.min.css', '.map'];

/**
 * Names of the lock files of package managers.
 */
const GENERATED_NAMES: readonly string[] = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];

/**
 * File of a commit as the raw and the numstat output of `git show -z` list it.
 */
export interface ListedFile {
  /**
   * Path that names the file: its new path, or its old path for a deleted file.
   */
  readonly path: string;

  /**
   * Path before a rename or a copy, else `null`.
   */
  readonly oldPath: string | null;

  /**
   * Kind of the change.
   */
  readonly status: ChangedFileStatus;

  /**
   * Id of the blob before the change, or `null` for an added file.
   */
  readonly oldBlob: string | null;

  /**
   * Id of the blob after the change, or `null` for a deleted file.
   */
  readonly newBlob: string | null;

  /**
   * Added lines, 0 for a binary file.
   */
  readonly additions: number;

  /**
   * Deleted lines, 0 for a binary file.
   */
  readonly deletions: number;

  /**
   * Whether git reads the file as binary.
   */
  readonly binary: boolean;
}

/**
 * Raw record of a file, before its line counts are known.
 */
type RawRecord = Omit<ListedFile, 'additions' | 'deletions' | 'binary'>;

/**
 * Returns the files that the output `stdout` of `git show --format= --raw --numstat --no-abbrev -z` lists, in its
 * order. Throws if the output does not have that form.
 */
export const parseListedFiles = (stdout: string): readonly ListedFile[] => {
  const tokens = stdout.split('\0');
  const records: RawRecord[] = [];
  let index = 0;
  while (tokens[index]?.startsWith(':')) {
    const match = RAW_HEADER.exec(tokens[index] ?? '');
    if (match === null) throw new Error(`Git listed an unexpected record ${tokens[index]}`);
    const [, , , oldBlob = '', newBlob = '', letter = ''] = match;
    const twoPaths = letter === 'R' || letter === 'C';
    const first = tokens[index + 1] ?? '';
    const second = twoPaths ? (tokens[index + 2] ?? '') : null;
    index += twoPaths ? 3 : 2;
    records.push({
      path: second ?? first,
      oldPath: second === null ? null : first,
      status: statusOf(letter),
      oldBlob: MISSING_BLOB.test(oldBlob) ? null : oldBlob,
      newBlob: MISSING_BLOB.test(newBlob) ? null : newBlob,
    });
  }
  return records.map((record) => {
    const counts = tokens[index] ?? '';
    const [additions = '', deletions = '', path = ''] = counts.split('\t');
    // A rename or a copy leaves the path of its counts empty, and lists its two paths after them.
    index += path === '' ? 3 : 1;
    const binary = additions === '-';
    return {
      ...record,
      additions: binary ? 0 : Number(additions),
      deletions: binary ? 0 : Number(deletions),
      binary,
    };
  });
};

/**
 * Returns the kind of change that the status letter `letter` of `git show --raw` names. A change of the type of a
 * file counts as modified.
 */
const statusOf = (letter: string): ChangedFileStatus => {
  switch (letter) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    default:
      return 'modified';
  }
};

/**
 * Returns whether the file `file` is big, so that its patch does not come with the list, by the sizes of its blobs in
 * `sizes`. A binary file is never big.
 */
export const isBig = (file: ListedFile, sizes: ReadonlyMap<string, number>): boolean => {
  if (file.binary) return false;
  if (file.additions + file.deletions > BIG_FILE_LINES) return true;
  return [file.oldBlob, file.newBlob].some((blob) => blob !== null && (sizes.get(blob) ?? 0) > BIG_FILE_BYTES);
};

/**
 * Returns the sizes of the blobs that the output `stdout` of `git cat-file --batch-check` lists, by their ids.
 */
export const parseBlobSizes = (stdout: string): ReadonlyMap<string, number> => {
  const sizes = new Map<string, number>();
  for (const line of stdout.split('\n')) {
    const [blob, type, size] = line.trim().split(' ');
    if (blob !== undefined && type === 'blob' && size !== undefined) sizes.set(blob, Number(size));
  }
  return sizes;
};

/**
 * Returns the value of the attribute that the output `stdout` of `git check-attr -z` gives for each path: `true` for
 * a set attribute, `false` for an unset one or one set to false, and no entry for an unspecified one.
 */
export const parseGeneratedAttributes = (stdout: string): ReadonlyMap<string, boolean> => {
  const values = new Map<string, boolean>();
  const tokens = stdout.split('\0');
  for (let index = 0; index + 2 < tokens.length; index += 3) {
    const path = tokens[index] ?? '';
    const value = tokens[index + 2] ?? '';
    if (value === 'unspecified') continue;
    values.set(path, value !== 'unset' && value !== 'false');
  }
  return values;
};

/**
 * Returns whether the path `path` is build output, minified or a lock file by its name alone: a directory `dist` or
 * `build` on it, a name that ends in `.min.js`, `.min.css` or `.map`, or the name of a lock file.
 */
export const isGeneratedPath = (path: string): boolean => {
  const parts = path.split('/');
  const name = parts.pop() ?? '';
  return (
    parts.some((part) => GENERATED_DIRECTORIES.includes(part)) ||
    GENERATED_ENDINGS.some((ending) => name.endsWith(ending)) ||
    GENERATED_NAMES.includes(name)
  );
};

/**
 * Returns the sections of the patch `patch`, one for each file, each from its `diff --git` line to the line before the
 * next one.
 */
export const splitPatch = (patch: string): readonly string[] => {
  const starts = [...patch.matchAll(SECTION_START)].map((match) => match.index);
  return starts.map((start, index) => patch.slice(start, starts[index + 1] ?? patch.length));
};
