/**
 * Line of a hunk: a line that both sides share, one that the change added, or one that it deleted.
 */
export interface DiffLine {
  /**
   * What the change did to the line: `context` for a line that both sides share, `add` for an added line, and
   * `delete` for a deleted line.
   */
  kind: 'context' | 'add' | 'delete';

  /**
   * Number of the line in the old file, from 1, or `null` for an added line.
   */
  oldNumber: number | null;

  /**
   * Number of the line in the new file, from 1, or `null` for a deleted line.
   */
  newNumber: number | null;

  /**
   * Text of the line, without its sign and its line break.
   */
  text: string;

  /**
   * Whether the file ends with this line, without a line break.
   */
  noNewline: boolean;
}

/**
 * Hunk of the changes of a file: a run of changed lines with the lines around them.
 */
export interface DiffHunk {
  /**
   * Header line of the hunk, such as `@@ -10,7 +10,8 @@ const parse = () => {`.
   */
  header: string;

  /**
   * Lines of the hunk, in their order.
   */
  lines: DiffLine[];
}

/**
 * What a change did to a file.
 */
export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied';

/**
 * Changes of one file of a patch.
 */
export interface FileDiff {
  /**
   * What the change did to the file.
   */
  status: FileStatus;

  /**
   * Path of the file before the change, or `null` for an added file.
   */
  oldPath: string | null;

  /**
   * Path of the file after the change, or `null` for a deleted file.
   */
  newPath: string | null;

  /**
   * Path that names the file: its new path, or its old path for a deleted file.
   */
  path: string;

  /**
   * How much of the file a rename or a copy kept, in percent, or `null` for no rename and no copy.
   */
  similarity: number | null;

  /**
   * Old and new mode of the file when the change set its mode, such as `100644` and `100755`, or `null`.
   */
  modeChange: { old: string; new: string } | null;

  /**
   * Whether git found the file binary, so the patch holds no lines of it.
   */
  binary: boolean;

  /**
   * Hunks of the file, in their order. Empty for a binary file, and for a change of the path or the mode alone.
   */
  hunks: DiffHunk[];

  /**
   * Number of the added lines.
   */
  additions: number;

  /**
   * Number of the deleted lines.
   */
  deletions: number;
}

/**
 * Side of a diff: `old` for the lines before the change, `new` for the lines after it.
 */
export type DiffSide = 'old' | 'new';

/**
 * Changes of one file that `parseFile` read, with the index of the first line after them.
 */
interface ParsedFile {
  /**
   * Changes of the file.
   */
  readonly file: FileDiff;

  /**
   * Index of the first line of the patch after the changes of the file.
   */
  readonly next: number;
}

/**
 * Start of the first line of the changes of each file.
 */
const FILE_START = 'diff --git ';

/**
 * Pattern of the header line of a hunk, with its old start, its old count, its new start and its new count.
 */
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Keys of the extended header lines of a file that `readHeaderLine` reads, the longest first where one starts another.
 */
const HEADER_KEYS = [
  'new file mode',
  'deleted file mode',
  'old mode',
  'new mode',
  'similarity index',
  'rename from',
  'rename to',
  'copy from',
  'copy to',
  '---',
  '+++',
] as const;

/**
 * Returns the number of the line `line` on the side `side`, or `null` when the line has no number on that side.
 */
export const numberOn = (line: DiffLine, side: DiffSide): number | null =>
  side === 'old' ? line.oldNumber : line.newNumber;

/**
 * Returns the side that a click on the line `line` in the unified view points at: `old` for a deleted line, `new` for
 * every other line.
 */
export const sideOf = (line: DiffLine): DiffSide => (line.kind === 'delete' ? 'old' : 'new');

/**
 * Returns the sign of the line `line` in a patch: `+` for an added line, `-` for a deleted line, and a space for a line
 * that both sides share.
 */
export const signOf = (line: DiffLine): string => {
  if (line.kind === 'add') return '+';
  return line.kind === 'delete' ? '-' : ' ';
};

/**
 * Parses `patch`, the output of `git show --format= -M` with paths that are not quoted, into the changes of each of
 * its files, in their order. Line breaks may be LF or CRLF. Lines that belong to no file are ignored. Returns the
 * changes of each file.
 */
export const parsePatch = (patch: string): readonly FileDiff[] => {
  const files: FileDiff[] = [];
  const lines = patch.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.startsWith(FILE_START)) {
      index += 1;
      continue;
    }
    const parsed = parseFile(lines, index);
    files.push(parsed.file);
    index = parsed.next;
  }
  return files;
};

/**
 * Parses the changes of the file whose first line is `lines[start]`, and returns them with the index of the first line
 * after them.
 */
const parseFile = (lines: readonly string[], start: number): ParsedFile => {
  const [oldGuess, newGuess] = pathsOfHeader(lines[start].slice(FILE_START.length));
  const file: FileDiff = {
    status: 'modified',
    oldPath: oldGuess,
    newPath: newGuess,
    path: newGuess,
    similarity: null,
    modeChange: null,
    binary: false,
    hunks: [],
    additions: 0,
    deletions: 0,
  };
  let oldMode = '';
  let index = start + 1;
  while (index < lines.length && !lines[index].startsWith(FILE_START)) {
    const line = lines[index];
    if (line.startsWith('@@')) {
      index = parseHunk(lines, index, file);
      continue;
    }
    oldMode = readHeaderLine(line, file, oldMode);
    index += 1;
  }
  file.path = file.newPath ?? file.oldPath ?? newGuess;
  return { file, next: index };
};

/**
 * Applies the extended header line `line` of a file to `file`, and returns the old mode of the file as far as the
 * header named it, `oldMode` until a line names it.
 */
const readHeaderLine = (line: string, file: FileDiff, oldMode: string): string => {
  const [key, value] = splitHeaderLine(line);
  switch (key) {
    case 'new file mode':
      file.status = 'added';
      file.oldPath = null;
      return oldMode;
    case 'deleted file mode':
      file.status = 'deleted';
      file.newPath = null;
      return oldMode;
    case 'old mode':
      return value;
    case 'new mode':
      file.modeChange = { old: oldMode, new: value };
      return oldMode;
    case 'similarity index':
      file.similarity = Number.parseInt(value, 10);
      return oldMode;
    case 'rename from':
    case 'copy from':
      file.oldPath = value;
      file.status = key === 'rename from' ? 'renamed' : 'copied';
      return oldMode;
    case 'rename to':
    case 'copy to':
      file.newPath = value;
      return oldMode;
    case '---':
      file.oldPath = value === '/dev/null' ? null : stripSide(value, 'a/');
      return oldMode;
    case '+++':
      file.newPath = value === '/dev/null' ? null : stripSide(value, 'b/');
      return oldMode;
  }
  if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true;
  return oldMode;
};

/**
 * Returns the key of the header line `line` among `HEADER_KEYS` and its value after the space that follows the key,
 * without the tab that git puts after a path with spaces. A line with no such key returns an empty key.
 */
const splitHeaderLine = (line: string): [string, string] => {
  const key = HEADER_KEYS.find((candidate) => line.startsWith(`${candidate} `));
  if (key === undefined) return ['', ''];
  const value = line.slice(key.length + 1);
  return [key, value.endsWith('\t') ? value.slice(0, -1) : value];
};

/**
 * Returns `path` without the prefix `prefix` of its side, such as `a/`, or `path` as it is when it lacks it.
 */
const stripSide = (path: string, prefix: string): string =>
  path.startsWith(prefix) ? path.slice(prefix.length) : path;

/**
 * Returns the old and the new path of the rest `rest` of the first line of a file, `a/<old> b/<new>`. Both paths are
 * the same unless the file was renamed or copied, whose extended header names its paths anyway. So the split that
 * gives the same path on both sides wins, and a split at the first ` b/` serves for the others.
 */
const pathsOfHeader = (rest: string): [string, string] => {
  const half = (rest.length - 1) / 2;
  const same = rest.slice(2, half);
  if (Number.isInteger(half) && rest === `a/${same} b/${same}`) return [same, same];
  const split = rest.indexOf(' b/');
  if (split === -1) return [rest, rest];
  return [stripSide(rest.slice(0, split), 'a/'), rest.slice(split + 3)];
};

/**
 * Parses the hunk whose header line is `lines[start]` into `file`, and returns the index of the first line after it.
 * The counts of the header say where the hunk ends.
 */
const parseHunk = (lines: readonly string[], start: number, file: FileDiff): number => {
  const header = lines[start];
  const match = HUNK_HEADER.exec(header);
  const hunk: DiffHunk = { header, lines: [] };
  file.hunks.push(hunk);
  if (match === null) return start + 1;
  let oldNumber = Number(match[1]);
  let newNumber = Number(match[3]);
  let oldLeft = match[2] === undefined ? 1 : Number(match[2]);
  let newLeft = match[4] === undefined ? 1 : Number(match[4]);
  let index = start + 1;
  while (index < lines.length && (oldLeft > 0 || newLeft > 0 || lines[index].startsWith('\\'))) {
    const line = lines[index];
    index += 1;
    const sign = line[0];
    const text = line.slice(1);
    if (sign === '\\') {
      const last = hunk.lines[hunk.lines.length - 1];
      if (last !== undefined) last.noNewline = true;
    } else if (sign === '+') {
      hunk.lines.push({ kind: 'add', oldNumber: null, newNumber, text, noNewline: false });
      newNumber += 1;
      newLeft -= 1;
      file.additions += 1;
    } else if (sign === '-') {
      hunk.lines.push({ kind: 'delete', oldNumber, newNumber: null, text, noNewline: false });
      oldNumber += 1;
      oldLeft -= 1;
      file.deletions += 1;
    } else {
      hunk.lines.push({ kind: 'context', oldNumber, newNumber, text, noNewline: false });
      oldNumber += 1;
      newNumber += 1;
      oldLeft -= 1;
      newLeft -= 1;
    }
  }
  return index;
};
