import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, type TestContext } from 'node:test';
import { createFixture } from './fixture.ts';
import { type StubServer, startStubServer } from './stub-server.ts';

/**
 * Fixture that every test of the stub serves.
 */
const FIXTURE = createFixture();

/**
 * Starts a stub over a temporary directory that holds `index.html` and `assets/app.js`, which the end of the test
 * `context` stops and removes.
 */
const startServer = async (context: TestContext): Promise<StubServer> => {
  const directory = await mkdtemp(join(tmpdir(), 'perf-stub-test-'));
  await mkdir(join(directory, 'assets'));
  await writeFile(join(directory, 'index.html'), '<!doctype html><title>app</title>');
  await writeFile(join(directory, 'assets', 'app.js'), 'export {};');
  const server = await startStubServer(directory, FIXTURE);
  context.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  return server;
};

/**
 * Sends the JSON-RPC 2.0 request for `method` with `params` to `server`, and returns its JSON answer.
 */
const rpc = async (server: StubServer, method: string, params?: Record<string, unknown>): Promise<unknown> => {
  const response = await fetch(new URL('rpc', server.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params }),
  });
  assert.equal(response.status, 200);
  return response.json();
};

/**
 * Returns the result of the JSON-RPC 2.0 answer `answer`, or `undefined` when it holds none.
 */
const resultOf = (answer: unknown): unknown =>
  typeof answer === 'object' && answer !== null && 'result' in answer ? answer.result : undefined;

describe('startStubServer', () => {
  it('answers ticketDiff with the changes of the fixture', async (context) => {
    const server = await startServer(context);
    assert.deepEqual(await rpc(server, 'ticketDiff', { taskId: 1, ticketId: 1 }), {
      jsonrpc: '2.0',
      id: 7,
      result: JSON.parse(JSON.stringify(FIXTURE.changes)),
    });
  });

  it('answers ticketFileDiff with the patch of a big file', async (context) => {
    const server = await startServer(context);
    const [path, patch] = [...FIXTURE.bigPatches][0] ?? [];
    assert.ok(path !== undefined);
    const answer = await rpc(server, 'ticketFileDiff', { taskId: 1, ticketId: 1, commit: 'c', path });
    assert.deepEqual(answer, { jsonrpc: '2.0', id: 7, result: { patch } });
  });

  it('answers the reads of the page from the fixture', async (context) => {
    const server = await startServer(context);
    const results = await Promise.all(
      ['repositoryGet', 'taskList', 'taskGet', 'sessionList', 'permissionPromptList', 'usageGet'].map(async (method) =>
        resultOf(await rpc(server, method, { task: 1 })),
      ),
    );
    assert.deepEqual(results, [
      FIXTURE.repository,
      { tasks: [FIXTURE.task] },
      FIXTURE.detail,
      { sessions: [] },
      { prompts: [] },
      FIXTURE.usage,
    ]);
  });

  it('answers a method that it does not know with a JSON-RPC error', async (context) => {
    const server = await startServer(context);
    const answer = await rpc(server, 'taskDelete', { task: 1 });
    assert.deepEqual(answer, {
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32601, message: 'The stub does not answer taskDelete' },
    });
  });

  it('serves a file of the built app with its content type', async (context) => {
    const server = await startServer(context);
    const response = await fetch(new URL('assets/app.js', server.url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
    assert.equal(await response.text(), 'export {};');
  });

  it('serves index.html for a path of the app that names no file', async (context) => {
    const server = await startServer(context);
    const response = await fetch(new URL('task/1-perf-fixture/1-large-diff/review', server.url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(await response.text(), '<!doctype html><title>app</title>');
  });

  it('holds the stream of events open', async (context) => {
    const server = await startServer(context);
    const abort = new AbortController();
    const response = await fetch(new URL('events', server.url), { signal: abort.signal });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    abort.abort();
  });
});
