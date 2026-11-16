import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ChangedFile } from '@/api/types.ts';
import { languageOfPath } from '@/lib/code-highlight.ts';
import { type FileDiff, parsePatch } from '@/review/patch.ts';
import { createFixture, type PerfFixture } from './fixture.ts';

/**
 * Returns the parsed diff of the changed file `file` of `fixture`, from its patch or from the patch of a big file.
 */
const diffOf = (fixture: PerfFixture, file: ChangedFile): FileDiff => {
  const patch = file.patch ?? fixture.bigPatches.get(file.path);
  assert.ok(patch !== undefined, `${file.path} has no patch`);
  const diff = parsePatch(patch)[0];
  assert.ok(diff !== undefined, `${file.path} holds no diff`);
  return diff;
};

/**
 * Returns the number of the lines of the hunks of `diff`.
 */
const lineCountOf = (diff: FileDiff): number => diff.hunks.reduce((count, hunk) => count + hunk.lines.length, 0);

describe('createFixture', () => {
  const fixture = createFixture();
  const { files } = fixture.changes;

  it('holds 120 changed files', () => {
    assert.equal(files.length, 120);
  });

  it('holds 20,000 changed lines or more in total', () => {
    const total = files.reduce((count, file) => count + file.additions + file.deletions, 0);
    assert.ok(total >= 20_000, `${total} changed lines`);
  });

  it('holds one file of 12,000 lines', () => {
    const counts = files.map((file) => lineCountOf(diffOf(fixture, file)));
    assert.equal(counts.filter((count) => count === 12_000).length, 1);
  });

  it('gives the patch null to some files, whose patch ticketFileDiff answers', () => {
    const big = files.filter((file) => file.patch === null);
    assert.ok(big.length >= 2, `${big.length} big files`);
    assert.deepEqual(
      big.map((file) => fixture.bigPatches.has(file.path)),
      big.map(() => true),
    );
    assert.equal(fixture.bigPatches.size, big.length);
  });

  it('holds one generated file', () => {
    assert.equal(files.filter((file) => file.generated).length, 1);
  });

  it('holds one file with a line longer than 1,000 characters', () => {
    const long = files.filter((file) =>
      diffOf(fixture, file).hunks.some((hunk) => hunk.lines.some((line) => line.text.length > 1000)),
    );
    assert.equal(long.length, 1);
  });

  it('holds files in TypeScript and in at least five other languages that shiki colors', () => {
    const extensions = new Set(files.map((file) => file.path.slice(file.path.lastIndexOf('.') + 1)));
    assert.ok(extensions.has('ts'));
    const colored = [...extensions].filter((extension) => languageOfPath(`file.${extension}`) !== undefined);
    assert.ok(colored.length >= 6, `colored extensions: ${colored.join(', ')}`);
  });

  it('counts the added and deleted lines of each file as its patch holds them', () => {
    const mismatched = files.filter((file) => {
      const diff = diffOf(fixture, file);
      return diff.additions !== file.additions || diff.deletions !== file.deletions || diff.path !== file.path;
    });
    assert.deepEqual(
      mismatched.map((file) => file.path),
      [],
    );
  });

  it('gives each file a patch only when it has 1,000 changed lines or fewer', () => {
    const wrong = files.filter((file) => (file.patch === null) !== file.additions + file.deletions > 1000);
    assert.deepEqual(
      wrong.map((file) => file.path),
      [],
    );
  });

  it('gives a ticket that needs review, in the task that taskList and taskGet answer', () => {
    assert.equal(fixture.ticket.status, 'needs-review');
    assert.deepEqual(fixture.detail.tickets, [fixture.ticket]);
    assert.equal(fixture.detail.id, fixture.task.id);
  });

  it('gives the same data on each call', () => {
    assert.deepEqual(createFixture(), fixture);
  });
});
