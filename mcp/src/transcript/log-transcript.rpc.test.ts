import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { testClock } from '../testing/test-clock.ts';
import { testConnection } from '../testing/test-connection.ts';
import type { Transcript, TranscriptEntry } from './find-transcript.ts';
import { rpcLogTranscript } from './log-transcript.rpc.ts';
import type { TailFileFunction } from './tail-file.ts';

/**
 * Time in ms since the epoch at which the logs of the tests start.
 */
const SINCE = 1000;

/**
 * Signal that never aborts.
 */
const NEVER = new AbortController().signal;

/**
 * Returns a promise that resolves once `signal` aborts.
 */
const aborted = async (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) resolve();
    else signal.addEventListener('abort', () => resolve(), { once: true });
  });

/**
 * Returns the facets of a line with the facets of `facets`, and no other facet.
 */
const entry = (facets: Partial<TranscriptEntry>): TranscriptEntry => ({
  message: undefined,
  skills: undefined,
  activity: undefined,
  action: undefined,
  usage: undefined,
  task: undefined,
  ticketId: undefined,
  ...facets,
});

/**
 * Returns the transcript of the session `session-1`, whose line of each key of `entries` holds the facets of its value,
 * and whose session ends when `waitForEnd` resolves, by default once its signal aborts.
 */
const transcript = (
  entries: Readonly<Record<string, Partial<TranscriptEntry>>> = {},
  waitForEnd: (signal: AbortSignal) => Promise<void> = aborted,
): Transcript => ({
  agent: 'claude',
  sessionId: 'session-1',
  path: '/projects/repository/session-1.jsonl',
  backgroundTaskId: undefined,
  parseLine: (line) => entry(entries[line] ?? {}),
  waitForEnd,
});

/**
 * Returns a `TailFileFunction` that passes each read of `reads` to `handle` in turn, then resolves. Adds the path that
 * it follows to `paths`.
 */
const tailReads =
  (reads: readonly (readonly string[])[], paths: string[] = []): TailFileFunction =>
  async (path, handle) => {
    paths.push(path);
    for (const lines of reads) await handle(lines);
  };

describe('rpcLogTranscript', () => {
  it('registers the session first, and follows the file of the transcript', async () => {
    const connection = testConnection();
    const paths: string[] = [];
    const dependencies = { tailFile: tailReads([], paths), clock: testClock(SINCE) };
    await rpcLogTranscript(transcript(), '/repository', connection, NEVER, dependencies);
    assert.deepEqual(connection.requests, [
      { method: 'sessionRegister', params: { sessionId: 'session-1', agent: 'claude', directory: '/repository' } },
    ]);
    assert.deepEqual(paths, ['/projects/repository/session-1.jsonl']);
  });

  it('reports the task, the ticket and the message of each line in the order of the lines', async () => {
    const connection = testConnection();
    const message = { messageId: 'message-1', sender: 'user', content: 'Hello', timestamp: 2000 } as const;
    const lines = {
      read: { task: { taskId: 9, created: false } },
      ticket: { ticketId: 6 },
      message: { message },
    };
    const dependencies = { tailFile: tailReads([['read', 'ticket', 'message']]), clock: testClock(SINCE) };
    await rpcLogTranscript(transcript(lines), '/repository', connection, NEVER, dependencies);
    assert.deepEqual(connection.requests.slice(1), [
      { method: 'sessionTaskSet', params: { sessionId: 'session-1', taskId: 9, created: false } },
      { method: 'sessionTicketSet', params: { sessionId: 'session-1', ticketId: 6 } },
      { method: 'messageLog', params: { sessionId: 'session-1', ...message } },
    ]);
  });

  it('reports a task that the session created with sessionTaskSet alone, since the server sets the alias', async () => {
    const connection = testConnection();
    const lines = { created: { task: { taskId: 9, created: true } } };
    const dependencies = { tailFile: tailReads([['created']]), clock: testClock(SINCE) };
    await rpcLogTranscript(transcript(lines), '/repository', connection, NEVER, dependencies);
    assert.deepEqual(connection.requests.slice(1), [
      { method: 'sessionTaskSet', params: { sessionId: 'session-1', taskId: 9, created: true } },
    ]);
  });

  it('reports each change of the status, then the newest action, then the newest usage after the lines', async () => {
    const connection = testConnection();
    const message = { messageId: 'message-1', sender: 'agent', content: 'Done', timestamp: 2000 } as const;
    const lines = {
      start: { activity: { status: 'working', timestamp: 2000 } },
      call: { activity: { status: 'working', timestamp: 2100 }, action: { action: 'Bash: npm test', timestamp: 2100 } },
      end: {
        activity: { status: 'idle', timestamp: 2200 },
        usage: { contextTokens: 500, model: 'claude-opus-5-5', effort: 'high', timestamp: 2200 },
        message,
      },
    } as const;
    const dependencies = { tailFile: tailReads([['start', 'call', 'end']]), clock: testClock(SINCE) };
    await rpcLogTranscript(transcript(lines), '/repository', connection, NEVER, dependencies);
    assert.deepEqual(connection.requests.slice(1), [
      { method: 'messageLog', params: { sessionId: 'session-1', ...message } },
      { method: 'sessionActivityReport', params: { sessionId: 'session-1', status: 'working', at: 2000 } },
      { method: 'sessionActivityReport', params: { sessionId: 'session-1', status: 'idle', at: 2200 } },
      { method: 'sessionActionReport', params: { sessionId: 'session-1', action: 'Bash: npm test', at: 2100 } },
      {
        method: 'sessionUsageSet',
        params: { sessionId: 'session-1', contextTokens: 500, model: 'claude-opus-5-5', effort: 'high' },
      },
    ]);
  });

  it('reports the usage but no status and no action of the lines from before the start of the log', async () => {
    const connection = testConnection();
    const lines = {
      old: {
        activity: { status: 'working', timestamp: 500 },
        action: { action: 'Read: a.ts', timestamp: 500 },
        usage: { contextTokens: 500, model: null, effort: null, timestamp: 500 },
      },
    } as const;
    const dependencies = { tailFile: tailReads([['old']]), clock: testClock(SINCE) };
    await rpcLogTranscript(transcript(lines), '/repository', connection, NEVER, dependencies);
    assert.deepEqual(connection.requests.slice(1), [
      {
        method: 'sessionUsageSet',
        params: { sessionId: 'session-1', contextTokens: 500, model: null, effort: null },
      },
    ]);
  });

  it('summarizes the lines of each read on their own', async () => {
    const connection = testConnection();
    const lines = {
      first: { activity: { status: 'working', timestamp: 2000 } },
      second: { activity: { status: 'working', timestamp: 3000 } },
    } as const;
    const dependencies = { tailFile: tailReads([['first'], ['second']]), clock: testClock(SINCE) };
    await rpcLogTranscript(transcript(lines), '/repository', connection, NEVER, dependencies);
    assert.deepEqual(
      connection.requests.slice(1).map(({ params }) => params),
      [
        { sessionId: 'session-1', status: 'working', at: 2000 },
        { sessionId: 'session-1', status: 'working', at: 3000 },
      ],
    );
  });

  it('stops following the transcript once its session ends', async () => {
    const connection = testConnection();
    let tailSignal: AbortSignal | undefined;
    const tailFile: TailFileFunction = async (_path, _handle, signal) => {
      tailSignal = signal;
      await aborted(signal);
    };
    const ended = transcript({}, async () => undefined);
    await rpcLogTranscript(ended, '/repository', connection, NEVER, { tailFile, clock: testClock(SINCE) });
    assert.equal(tailSignal?.aborted, true);
  });

  it('resolves once the signal aborts', async () => {
    const connection = testConnection();
    const abort = new AbortController();
    const tailFile: TailFileFunction = async (_path, _handle, signal) => aborted(signal);
    const logged = rpcLogTranscript(transcript(), '/repository', connection, abort.signal, {
      tailFile,
      clock: testClock(SINCE),
    });
    abort.abort();
    assert.equal(await logged, undefined);
  });

  it('rejects when the repository server fails a request', async () => {
    const connection = testConnection();
    connection.close();
    const dependencies = { tailFile: tailReads([]), clock: testClock(SINCE) };
    await assert.rejects(rpcLogTranscript(transcript(), '/repository', connection, NEVER, dependencies), Error);
  });
});
