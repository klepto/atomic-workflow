import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pollTailFile } from './tail-file.poll.ts';

/**
 * Returns the lines that one read of `pollTailFile` passes for a file with the text `text`, with the options
 * `options`. The signal aborts before the read, so the follow ends after it.
 */
const readOnce = async (text: string, options?: { readonly offset?: number }): Promise<readonly string[]> => {
  const directory = await mkdtemp(join(tmpdir(), 'atomic-workflow-tail-'));
  try {
    const path = join(directory, 'transcript.jsonl');
    await writeFile(path, text);
    const lines: string[] = [];
    await pollTailFile(path, async (read) => void lines.push(...read), AbortSignal.abort(), options);
    return lines;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

describe('pollTailFile', () => {
  it('passes every complete line of the file from its start', async () => {
    assert.deepEqual(await readOnce('first\nsecond\nthird'), ['first', 'second']);
  });

  it('passes only the lines after the byte offset of the options', async () => {
    const earlier = 'früh\n';
    assert.deepEqual(await readOnce(`${earlier}later\nlast\n`, { offset: Buffer.byteLength(earlier) }), [
      'later',
      'last',
    ]);
  });
});
