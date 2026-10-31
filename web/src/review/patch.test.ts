import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type DiffLine, numberOn, parsePatch, sideOf, signOf } from '@/review/patch.ts';

/**
 * Returns the lines `lines` as one patch, each line ended with a line break.
 */
const patchOf = (...lines: readonly string[]): string => `${lines.join('\n')}\n`;

/**
 * Returns a line of a hunk of the kind `kind`, with only the fields that a test states.
 */
const line = (kind: DiffLine['kind'], fields: Partial<DiffLine> = {}): DiffLine => ({
  kind,
  oldNumber: null,
  newNumber: null,
  text: '',
  noNewline: false,
  ...fields,
});

describe('parsePatch', () => {
  it('reads a modified file with its lines and their numbers', () => {
    const patch = patchOf(
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,3 @@',
      ' one',
      '-two',
      '+TWO',
      ' three',
    );
    assert.deepEqual(parsePatch(patch), [
      {
        status: 'modified',
        oldPath: 'src/a.ts',
        newPath: 'src/a.ts',
        path: 'src/a.ts',
        similarity: null,
        modeChange: null,
        binary: false,
        hunks: [
          {
            header: '@@ -1,3 +1,3 @@',
            lines: [
              line('context', { oldNumber: 1, newNumber: 1, text: 'one' }),
              line('delete', { oldNumber: 2, text: 'two' }),
              line('add', { newNumber: 2, text: 'TWO' }),
              line('context', { oldNumber: 3, newNumber: 3, text: 'three' }),
            ],
          },
        ],
        additions: 1,
        deletions: 1,
      },
    ]);
  });

  it('reads an added file with no old path', () => {
    const patch = patchOf(
      'diff --git a/new.ts b/new.ts',
      'new file mode 100644',
      'index 0000000..3333333',
      '--- /dev/null',
      '+++ b/new.ts',
      '@@ -0,0 +1,2 @@',
      '+first',
      '+second',
    );
    const [file] = parsePatch(patch);
    assert.equal(file.status, 'added');
    assert.equal(file.oldPath, null);
    assert.equal(file.newPath, 'new.ts');
    assert.equal(file.path, 'new.ts');
    assert.deepEqual(file.hunks[0].lines, [
      line('add', { newNumber: 1, text: 'first' }),
      line('add', { newNumber: 2, text: 'second' }),
    ]);
    assert.equal(file.additions, 2);
    assert.equal(file.deletions, 0);
  });

  it('reads a deleted file with no new path, named by its old path', () => {
    const patch = patchOf(
      'diff --git a/old.ts b/old.ts',
      'deleted file mode 100644',
      'index 4444444..0000000',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
    );
    const [file] = parsePatch(patch);
    assert.equal(file.status, 'deleted');
    assert.equal(file.oldPath, 'old.ts');
    assert.equal(file.newPath, null);
    assert.equal(file.path, 'old.ts');
    assert.deepEqual(file.hunks[0].lines, [line('delete', { oldNumber: 1, text: 'gone' })]);
    assert.equal(file.additions, 0);
    assert.equal(file.deletions, 1);
  });

  it('reads a renamed file with both paths and its similarity', () => {
    const patch = patchOf(
      'diff --git a/src/from.ts b/src/to.ts',
      'similarity index 90%',
      'rename from src/from.ts',
      'rename to src/to.ts',
      'index 5555555..6666666 100644',
      '--- a/src/from.ts',
      '+++ b/src/to.ts',
      '@@ -1,2 +1,2 @@',
      '-old',
      '+new',
      ' same',
    );
    const [file] = parsePatch(patch);
    assert.equal(file.status, 'renamed');
    assert.equal(file.oldPath, 'src/from.ts');
    assert.equal(file.newPath, 'src/to.ts');
    assert.equal(file.path, 'src/to.ts');
    assert.equal(file.similarity, 90);
    assert.equal(file.hunks.length, 1);
  });

  it('reads a file that was only moved with no hunks', () => {
    const patch = patchOf('diff --git a/a.ts b/b.ts', 'similarity index 100%', 'rename from a.ts', 'rename to b.ts');
    const [file] = parsePatch(patch);
    assert.equal(file.status, 'renamed');
    assert.equal(file.oldPath, 'a.ts');
    assert.equal(file.path, 'b.ts');
    assert.equal(file.similarity, 100);
    assert.deepEqual(file.hunks, []);
  });

  it('reads a copied file with both paths', () => {
    const patch = patchOf('diff --git a/a.ts b/c.ts', 'similarity index 100%', 'copy from a.ts', 'copy to c.ts');
    const [file] = parsePatch(patch);
    assert.equal(file.status, 'copied');
    assert.equal(file.oldPath, 'a.ts');
    assert.equal(file.newPath, 'c.ts');
  });

  it('reads several hunks of a file, each with the numbers of its header', () => {
    const patch = patchOf(
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,2 +1,2 @@',
      '-one',
      '+ONE',
      ' two',
      '@@ -10,2 +10,3 @@ const x = () => {',
      ' ten',
      '+ten and a half',
      ' eleven',
    );
    const [file] = parsePatch(patch);
    assert.deepEqual(
      file.hunks.map((hunk) => hunk.header),
      ['@@ -1,2 +1,2 @@', '@@ -10,2 +10,3 @@ const x = () => {'],
    );
    assert.deepEqual(file.hunks[1].lines, [
      line('context', { oldNumber: 10, newNumber: 10, text: 'ten' }),
      line('add', { newNumber: 11, text: 'ten and a half' }),
      line('context', { oldNumber: 11, newNumber: 12, text: 'eleven' }),
    ]);
    assert.equal(file.additions, 2);
    assert.equal(file.deletions, 1);
  });

  it('marks the last line of each side that has no newline at the end of the file', () => {
    const patch = patchOf(
      'diff --git a/a.txt b/a.txt',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1 @@',
      '-a',
      '\\ No newline at end of file',
      '+b',
      '\\ No newline at end of file',
    );
    const [file] = parsePatch(patch);
    assert.deepEqual(file.hunks[0].lines, [
      line('delete', { oldNumber: 1, text: 'a', noNewline: true }),
      line('add', { newNumber: 1, text: 'b', noNewline: true }),
    ]);
  });

  it('marks a binary file, which holds no hunks', () => {
    const patch = patchOf(
      'diff --git a/image.png b/image.png',
      'index 7777777..8888888 100644',
      'Binary files a/image.png and b/image.png differ',
    );
    const [file] = parsePatch(patch);
    assert.equal(file.binary, true);
    assert.deepEqual(file.hunks, []);
  });

  it('marks a binary file whose patch holds its content', () => {
    const patch = patchOf('diff --git a/image.png b/image.png', 'GIT binary patch', 'literal 4', 'zcmZ?wbhPF');
    const [file] = parsePatch(patch);
    assert.equal(file.binary, true);
    assert.deepEqual(file.hunks, []);
  });

  it('reads the old and the new mode of a file whose mode changed', () => {
    const patch = patchOf('diff --git a/run.sh b/run.sh', 'old mode 100644', 'new mode 100755');
    const [file] = parsePatch(patch);
    assert.deepEqual(file.modeChange, { old: '100644', new: '100755' });
  });

  it('reads several files in their order', () => {
    const patch = patchOf(
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1 +1 @@',
      '-a',
      '+A',
      'diff --git a/b.ts b/b.ts',
      '--- a/b.ts',
      '+++ b/b.ts',
      '@@ -1 +1 @@',
      '-b',
      '+B',
    );
    assert.deepEqual(
      parsePatch(patch).map((file) => file.path),
      ['a.ts', 'b.ts'],
    );
  });

  it('reads a patch with CRLF line breaks like one with LF line breaks', () => {
    const lines = ['diff --git a/a.ts b/a.ts', '--- a/a.ts', '+++ b/a.ts', '@@ -1 +1 @@', '-a', '+A'];
    assert.deepEqual(parsePatch(`${lines.join('\r\n')}\r\n`), parsePatch(patchOf(...lines)));
  });

  it('ignores the lines before the first file', () => {
    const patch = patchOf('commit 0123456', '', 'diff --git a/a.ts b/a.ts', 'old mode 100644', 'new mode 100755');
    assert.deepEqual(
      parsePatch(patch).map((file) => file.path),
      ['a.ts'],
    );
  });

  it('reads a path that holds a space and b/ from the first line of a file', () => {
    const patch = patchOf('diff --git a/x b/y.ts b/x b/y.ts', 'old mode 100644', 'new mode 100755');
    const [file] = parsePatch(patch);
    assert.equal(file.oldPath, 'x b/y.ts');
    assert.equal(file.path, 'x b/y.ts');
  });

  it('drops the tab that git puts after a path with spaces', () => {
    const patch = patchOf(
      'diff --git a/my file.ts b/my file.ts',
      '--- a/my file.ts\t',
      '+++ b/my file.ts\t',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    );
    const [file] = parsePatch(patch);
    assert.equal(file.oldPath, 'my file.ts');
    assert.equal(file.newPath, 'my file.ts');
  });

  it('returns no files for an empty patch', () => {
    assert.deepEqual(parsePatch(''), []);
  });
});

describe('numberOn', () => {
  it('returns the old number on the old side and the new number on the new side', () => {
    const shared = line('context', { oldNumber: 3, newNumber: 5 });
    assert.equal(numberOn(shared, 'old'), 3);
    assert.equal(numberOn(shared, 'new'), 5);
  });

  it('returns null on the side where the line has no number', () => {
    assert.equal(numberOn(line('add', { newNumber: 2 }), 'old'), null);
  });
});

describe('sideOf', () => {
  it('returns old for a deleted line', () => {
    assert.equal(sideOf(line('delete', { oldNumber: 1 })), 'old');
  });

  it('returns new for an added line and for a shared line', () => {
    assert.equal(sideOf(line('add', { newNumber: 1 })), 'new');
    assert.equal(sideOf(line('context', { oldNumber: 1, newNumber: 1 })), 'new');
  });
});

describe('signOf', () => {
  it('returns the sign of each kind of line in a patch', () => {
    assert.deepEqual([signOf(line('add')), signOf(line('delete')), signOf(line('context'))], ['+', '-', ' ']);
  });
});
