import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NoRepositoryServerError } from '../attachment/attach.ts';
import type { RpcConnection } from '../rpc/rpc-connection.ts';
import { TEST_ATTACH_URL, testAttachClient } from '../testing/test-attach-client.ts';
import type { TestRequest } from '../testing/test-connection.ts';
import type { TailFileFunction } from '../transcript/tail-file.ts';
import type { TranscriptFiles } from '../transcript/transcript-files.ts';
import type { PermissionRequestInput } from './hook-input.ts';
import {
  permissionDecisionOutput,
  type RequestPermissionDependencies,
  requestPermission,
} from './request-permission.ts';

/**
 * Input of the hook of a prompt of the main session, which the tests change by the fields that matter to them.
 */
const INPUT: PermissionRequestInput = {
  session_id: 'session-1',
  cwd: '/repository',
  transcript_path: '/projects/repository/session-1.jsonl',
  tool_name: 'Bash',
  tool_input: { command: 'npm test' },
};

/**
 * Suggestion of Claude Code for an always-allow answer.
 */
const SUGGESTION = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'localSettings' };

/**
 * Connection whose requests wait until the test answers or fails them, or until their signal aborts.
 */
interface WaitingConnection extends RpcConnection {
  /**
   * Requests that the connection sent, in the order of sending.
   */
  readonly requests: readonly TestRequest[];

  /**
   * Resolves each request with `result`.
   */
  answer(result: unknown): void;

  /**
   * Rejects each request with `error`.
   */
  fail(error: Error): void;

  /**
   * Returns whether the connection is closed.
   */
  isClosed(): boolean;
}

/**
 * Follow of a transcript that a test drives.
 */
interface TestTail {
  /**
   * Path of the followed file.
   */
  readonly path: string;

  /**
   * Byte that the follow starts at.
   */
  readonly offset: number | undefined;

  /**
   * Signal that ends the follow.
   */
  readonly signal: AbortSignal;

  /**
   * Passes `lines`, appended to the file, to the follow.
   */
  append(lines: readonly string[]): Promise<void>;
}

/**
 * Harness of `requestPermission`: its dependencies, its connection, and the follow of the transcript once it starts.
 */
interface Harness {
  /**
   * Dependencies of `requestPermission`.
   */
  readonly dependencies: RequestPermissionDependencies;

  /**
   * Connection that the attach returns.
   */
  readonly connection: WaitingConnection;

  /**
   * Resolves with the follow of the transcript once it starts.
   */
  readonly tail: Promise<TestTail>;
}

/**
 * Returns a `WaitingConnection`.
 */
const waitingConnection = (): WaitingConnection => {
  const requests: TestRequest[] = [];
  const result = Promise.withResolvers<unknown>();
  const { promise: closed, resolve: resolveClosed } = Promise.withResolvers<void>();
  let isClosed = false;
  return {
    requests,
    answer: (value) => result.resolve(value),
    fail: (error) => result.reject(error),
    isClosed: () => isClosed,
    request: async (method, params, signal) => {
      if (isClosed) throw new Error(`The connection is closed, so the request of ${method} was not sent`);
      requests.push({ method, params });
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('The request was aborted')), { once: true });
        result.promise.then(resolve, reject);
      });
    },
    closed,
    close: () => {
      isClosed = true;
      resolveClosed();
    },
  };
};

/**
 * Returns a harness whose transcript holds `transcript` at the start, or that is missing for `undefined`, and whose
 * read of the transcript rejects with `readError` when it is set.
 */
const harness = (transcript: string | undefined = '', readError?: Error): Harness => {
  const connection = waitingConnection();
  const started = Promise.withResolvers<TestTail>();
  const tailFile: TailFileFunction = async (path, handle, signal, options) => {
    started.resolve({ path, offset: options?.offset, signal, append: handle });
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
  };
  const transcriptFiles: TranscriptFiles = {
    readText: async () => {
      if (readError !== undefined) throw readError;
      return transcript;
    },
    readStart: async () => '',
    exists: async () => false,
    listNames: async () => [],
    listDirectories: async () => [],
  };
  return {
    connection,
    tail: started.promise,
    dependencies: {
      ...testAttachClient().dependencies,
      attach: async () => ({ launched: false, url: TEST_ATTACH_URL, connection }),
      transcriptFiles,
      tailFile,
    },
  };
};

/**
 * Returns the line of the entry of the agent that calls the tool of `INPUT` with its input in the call `id`.
 */
const toolUse = (id: string): string =>
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', id, name: INPUT.tool_name, input: INPUT.tool_input }] },
  });

/**
 * Returns the line of the entry of the result of the call `id`.
 */
const toolResult = (id: string): string =>
  JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'done' }] } });

describe('requestPermission', () => {
  it('opens the prompt with the fields of the input of the hook of a subagent', async () => {
    const test = harness();
    const input = {
      ...INPUT,
      agent_id: 'agent-1',
      agent_type: 'general-purpose',
      permission_suggestions: [SUGGESTION],
    };
    const answer = requestPermission(input, '/repository', test.dependencies);
    await test.tail;
    test.connection.answer({ behavior: 'allow' });
    await answer;
    assert.deepEqual(test.connection.requests, [
      {
        method: 'permissionPromptOpen',
        params: {
          sessionId: 'session-1',
          agentId: 'agent-1',
          agentType: 'general-purpose',
          toolName: 'Bash',
          toolInput: { command: 'npm test' },
          suggestions: [SUGGESTION],
        },
      },
    ]);
  });

  it('opens the prompt of the main session with no agent and no suggestions', async () => {
    const test = harness();
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    await test.tail;
    test.connection.answer({ behavior: 'allow' });
    await answer;
    assert.deepEqual(test.connection.requests[0]?.params, {
      sessionId: 'session-1',
      agentId: null,
      agentType: null,
      toolName: 'Bash',
      toolInput: { command: 'npm test' },
      suggestions: [],
    });
  });

  it('returns an allow once answer of the web app', async () => {
    const test = harness();
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    await test.tail;
    test.connection.answer({ behavior: 'allow' });
    assert.deepEqual(await answer, { behavior: 'allow' });
  });

  it('returns an always allow answer of the web app with its suggestion', async () => {
    const test = harness();
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    await test.tail;
    test.connection.answer({ behavior: 'allow', updatedPermissions: [SUGGESTION] });
    assert.deepEqual(await answer, { behavior: 'allow', updatedPermissions: [SUGGESTION] });
  });

  it('returns a deny answer of the web app with its message', async () => {
    const test = harness();
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    await test.tail;
    test.connection.answer({ behavior: 'deny', message: 'Denied in the atomic-workflow web app.' });
    assert.deepEqual(await answer, { behavior: 'deny', message: 'Denied in the atomic-workflow web app.' });
  });

  it('closes the connection and ends the follow of the transcript after the answer', async () => {
    const test = harness();
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    const tail = await test.tail;
    test.connection.answer({ behavior: 'allow' });
    await answer;
    assert.equal(test.connection.isClosed(), true);
    assert.equal(tail.signal.aborted, true);
  });

  it('returns undefined and closes the connection once the transcript shows the call answered in the terminal', async () => {
    const test = harness(`${toolUse('call-1')}\n`);
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    const tail = await test.tail;
    await tail.append([toolResult('call-1')]);
    assert.equal(await answer, undefined);
    assert.equal(test.connection.isClosed(), true);
    assert.equal(tail.signal.aborted, true);
  });

  it('returns undefined once the transcript shows an interrupt', async () => {
    const test = harness();
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    const tail = await test.tail;
    const interrupt = { type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } };
    await tail.append([JSON.stringify(interrupt)]);
    assert.equal(await answer, undefined);
    assert.equal(test.connection.isClosed(), true);
  });

  it('waits on when the transcript shows a result of a call that was answered before the start', async () => {
    const test = harness(`${toolUse('call-1')}\n${toolResult('call-1')}\n`);
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    const tail = await test.tail;
    await tail.append([toolResult('call-1')]);
    test.connection.answer({ behavior: 'allow' });
    assert.deepEqual(await answer, { behavior: 'allow' });
  });

  it('follows the transcript of the session after its last complete line', async () => {
    const earlier = `${toolUse('call-1')}\n{"type":"user","message":{"content":"ä"}}\n`;
    const test = harness(`${earlier}{"type":"assist`);
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    const tail = await test.tail;
    test.connection.answer({ behavior: 'allow' });
    await answer;
    assert.equal(tail.path, '/projects/repository/session-1.jsonl');
    assert.equal(tail.offset, Buffer.byteLength(earlier, 'utf8'));
  });

  it('follows a transcript that does not exist yet from its start', async () => {
    const test = harness(undefined);
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    const tail = await test.tail;
    test.connection.answer({ behavior: 'allow' });
    await answer;
    assert.equal(tail.offset, 0);
  });

  it('follows the transcript of the subagent that asks', async () => {
    const test = harness();
    const answer = requestPermission({ ...INPUT, agent_id: 'agent-1' }, '/repository', test.dependencies);
    const tail = await test.tail;
    test.connection.answer({ behavior: 'allow' });
    await answer;
    assert.equal(tail.path, '/projects/repository/session-1/subagents/agent-agent-1.jsonl');
  });

  it('returns undefined and opens no prompt outside of a repository', async () => {
    const client = testAttachClient({ addressError: new Error('The directory is in no repository') });
    const dependencies = { ...harness().dependencies, ...client.dependencies };
    assert.equal(await requestPermission(INPUT, '/tmp', dependencies), undefined);
    assert.deepEqual(client.attaches, []);
  });

  it('returns undefined and opens no prompt when no repository server runs', async () => {
    const client = testAttachClient({ attachError: new NoRepositoryServerError('/repository/repository.sock') });
    const dependencies = { ...harness().dependencies, ...client.dependencies };
    assert.equal(await requestPermission(INPUT, '/repository', dependencies), undefined);
    assert.deepEqual(client.connection.requests, []);
  });

  it('rejects when the attach fails', async () => {
    const client = testAttachClient({ attachError: new Error('The repository server did not answer hello') });
    const dependencies = { ...harness().dependencies, ...client.dependencies };
    await assert.rejects(requestPermission(INPUT, '/repository', dependencies), {
      message: 'The repository server did not answer hello',
    });
  });

  it('rejects and closes the connection when the request fails', async () => {
    const test = harness();
    const answer = requestPermission(INPUT, '/repository', test.dependencies);
    await test.tail;
    test.connection.fail(new Error('Unknown method permissionPromptOpen'));
    await assert.rejects(answer, { message: 'Unknown method permissionPromptOpen' });
    assert.equal(test.connection.isClosed(), true);
  });

  it('rejects and closes the connection when the transcript cannot be read', async () => {
    const test = harness('', new Error('EACCES: permission denied'));
    await assert.rejects(requestPermission(INPUT, '/repository', test.dependencies), {
      message: 'EACCES: permission denied',
    });
    assert.equal(test.connection.isClosed(), true);
  });
});

describe('permissionDecisionOutput', () => {
  it('returns the allow decision without updatedPermissions for an allow once answer', () => {
    assert.deepEqual(JSON.parse(permissionDecisionOutput({ behavior: 'allow' })), {
      hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
    });
  });

  it('returns the allow decision with the suggestion for an always allow answer', () => {
    assert.deepEqual(JSON.parse(permissionDecisionOutput({ behavior: 'allow', updatedPermissions: [SUGGESTION] })), {
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'allow', updatedPermissions: [SUGGESTION] },
      },
    });
  });

  it('returns the deny decision with the message of the answer', () => {
    const output = permissionDecisionOutput({ behavior: 'deny', message: 'Denied in the atomic-workflow web app.' });
    assert.equal(
      output,
      '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied in the atomic-workflow web app."}}}',
    );
  });
});
