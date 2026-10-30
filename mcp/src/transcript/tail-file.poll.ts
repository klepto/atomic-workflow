import { type FileHandle, open, stat } from 'node:fs/promises';
import { StringDecoder } from 'node:string_decoder';
import { setTimeout as sleep } from 'node:timers/promises';
import { isNotFound } from './is-not-found.ts';
import type { TailFileFunction } from './tail-file.ts';

/**
 * Time in ms between two checks of the size of the file.
 */
const POLL_INTERVAL = 500;

/**
 * Greatest number of bytes that one read takes from the file.
 */
const CHUNK_SIZE = 1024 * 1024;

/**
 * State of a file that is followed.
 */
interface Tail {
  /**
   * Absolute path of the file.
   */
  readonly path: string;

  /**
   * Number of bytes of the file that are read.
   */
  offset: number;

  /**
   * Text after the last line break that is read, which is the start of a line that is not complete yet.
   */
  partial: string;

  /**
   * Decoder of the bytes that are read, which keeps a character whose bytes a read splits until its next read.
   */
  decoder: StringDecoder;
}

/**
 * `TailFileFunction` that checks the size of the file every `POLL_INTERVAL` ms, and reads what was appended since the
 * last check. A check of the size works the same on every file system, which a watch of the file does not. Resolves
 * after the read that follows the abort of `signal`. Rejects when the size of the file cannot be read for another
 * cause than that the file does not exist, when the file cannot be opened or read, or when `handle` rejects.
 */
export const pollTailFile: TailFileFunction = async (path, handle, signal) => {
  const tail: Tail = { path, offset: 0, partial: '', decoder: new StringDecoder('utf8') };
  for (;;) {
    // A read after the abort passes the lines that were appended before it.
    const aborted = signal.aborted;
    await readAppended(tail, handle);
    if (aborted) return;
    // The only failure of the sleep is the abort, which the next round of the loop handles.
    await sleep(POLL_INTERVAL, undefined, { signal }).catch(() => undefined);
  }
};

/**
 * Reads what was appended to the file of `tail` since the last read, and passes its complete lines to `handle`. A
 * file that shrank is read from its start again.
 */
const readAppended = async (tail: Tail, handle: (lines: readonly string[]) => Promise<void>): Promise<void> => {
  const size = await sizeOf(tail.path);
  if (size < tail.offset) restart(tail);
  if (size === tail.offset) return;
  const file = await open(tail.path, 'r');
  try {
    while (tail.offset < size && (await readChunk(tail, file, size, handle)) > 0);
  } finally {
    await file.close();
  }
};

/**
 * Returns the size of the file at `path` in bytes, or 0 when the file does not exist. Rejects when the size cannot be
 * read for another cause.
 */
const sizeOf = async (path: string): Promise<number> => {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isNotFound(error)) return 0;
    throw error;
  }
};

/**
 * Makes `tail` read its file from the start again.
 */
const restart = (tail: Tail): void => {
  tail.offset = 0;
  tail.partial = '';
  tail.decoder = new StringDecoder('utf8');
};

/**
 * Reads the next chunk of `file` up to the byte `size`, passes the lines that it completes to `handle`, and returns
 * the number of bytes that it read.
 */
const readChunk = async (
  tail: Tail,
  file: FileHandle,
  size: number,
  handle: (lines: readonly string[]) => Promise<void>,
): Promise<number> => {
  const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, size - tail.offset));
  const { bytesRead } = await file.read(buffer, 0, buffer.length, tail.offset);
  tail.offset += bytesRead;
  const lines = `${tail.partial}${tail.decoder.write(buffer.subarray(0, bytesRead))}`.split('\n');
  tail.partial = lines.pop() ?? '';
  const complete = lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line)).filter((line) => line !== '');
  if (complete.length > 0) await handle(complete);
  return bytesRead;
};
