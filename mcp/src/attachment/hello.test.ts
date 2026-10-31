import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RPC_ERROR_CODES, RpcError } from '../rpc/rpc-error.ts';
import { testCall } from '../testing/test-call.ts';
import { testMethodContext } from '../testing/test-method-context.ts';
import { helloMethod, isRepositoryClosing, PROTOCOL_VERSION, REPOSITORY_CLOSING } from './hello.ts';

/**
 * URL of the web server that the method of the tests returns.
 */
const WEB_URL = 'http://127.0.0.1:4000/';

/**
 * `attachSession` of `helloMethod` for a test, which counts its calls.
 */
interface AttachSession {
  /**
   * Returns the number of calls of `attach`.
   */
  readonly calls: () => number;

  /**
   * Function that `helloMethod` calls to attach a session server.
   */
  readonly attach: () => boolean;
}

/**
 * Returns an `AttachSession` whose `attach` returns `attached`.
 */
const attachSession = (attached: boolean): AttachSession => {
  let calls = 0;
  return {
    calls: () => calls,
    attach: () => {
      calls += 1;
      return attached;
    },
  };
};

describe('helloMethod', () => {
  it('returns the url to a client without an attach of a session', async () => {
    const session = attachSession(true);
    const result = await testCall(
      helloMethod(WEB_URL, session.attach),
      { protocol: PROTOCOL_VERSION, role: 'client' },
      testMethodContext(),
    );
    assert.deepEqual(result, { url: WEB_URL });
    assert.equal(session.calls(), 0);
  });

  it('attaches a session server and returns the url', async () => {
    const session = attachSession(true);
    const result = await testCall(
      helloMethod(WEB_URL, session.attach),
      { protocol: PROTOCOL_VERSION, role: 'session' },
      testMethodContext(),
    );
    assert.deepEqual(result, { url: WEB_URL });
    assert.equal(session.calls(), 1);
  });

  it('fails with REPOSITORY_CLOSING when the session server does not attach', async () => {
    await assert.rejects(
      testCall(
        helloMethod(WEB_URL, attachSession(false).attach),
        { protocol: PROTOCOL_VERSION, role: 'session' },
        testMethodContext(),
      ),
      { name: 'RpcError', code: REPOSITORY_CLOSING },
    );
  });

  it('fails with INVALID_PARAMS for another protocol', async () => {
    const session = attachSession(true);
    await assert.rejects(
      testCall(
        helloMethod(WEB_URL, session.attach),
        { protocol: PROTOCOL_VERSION - 1, role: 'session' },
        testMethodContext(),
      ),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS },
    );
    assert.equal(session.calls(), 0);
  });

  it('fails with INVALID_PARAMS for an unknown role', async () => {
    await assert.rejects(
      testCall(
        helloMethod(WEB_URL, attachSession(true).attach),
        { protocol: PROTOCOL_VERSION, role: 'admin' },
        testMethodContext(),
      ),
      { name: 'RpcError', code: RPC_ERROR_CODES.INVALID_PARAMS },
    );
  });
});

describe('isRepositoryClosing', () => {
  it('returns true for the RpcError of REPOSITORY_CLOSING', () => {
    assert.equal(isRepositoryClosing(new RpcError(REPOSITORY_CLOSING, 'The repository server is closing')), true);
  });

  it('returns false for an RpcError of another code', () => {
    assert.equal(isRepositoryClosing(new RpcError(RPC_ERROR_CODES.INTERNAL_ERROR, 'The method failed')), false);
  });

  it('returns false for an error that is no RpcError', () => {
    assert.equal(isRepositoryClosing(new Error('The repository server is closing')), false);
  });
});
