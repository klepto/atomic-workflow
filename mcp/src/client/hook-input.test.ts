import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { hookDirectory, parseHookInput } from './hook-input.ts';

describe('parseHookInput', () => {
  it('returns the session id and the working directory of the input', () => {
    const text = JSON.stringify({ session_id: 'session-1', cwd: '/repository', hook_event_name: 'Stop' });
    assert.deepEqual(parseHookInput(text), { session_id: 'session-1', cwd: '/repository' });
  });

  it('throws for a text that is not valid JSON', () => {
    assert.throws(() => parseHookInput('{"session_id":'), SyntaxError);
  });

  it('throws for an input without a session id', () => {
    assert.throws(() => parseHookInput(JSON.stringify({ cwd: '/repository' })), z.ZodError);
  });

  it('throws for an input without a working directory', () => {
    assert.throws(() => parseHookInput(JSON.stringify({ session_id: 'session-1' })), z.ZodError);
  });

  it('throws for an input with an empty field', () => {
    assert.throws(() => parseHookInput(JSON.stringify({ session_id: '', cwd: '/repository' })), z.ZodError);
  });
});

describe('hookDirectory', () => {
  it('returns CLAUDE_PROJECT_DIR of the environment when it is set', () => {
    const input = { session_id: 'session-1', cwd: '/repository/mcp' };
    assert.equal(hookDirectory(input, { CLAUDE_PROJECT_DIR: '/repository' }), '/repository');
  });

  it('returns the working directory of the session without CLAUDE_PROJECT_DIR', () => {
    const input = { session_id: 'session-1', cwd: '/repository/mcp' };
    assert.equal(hookDirectory(input, {}), '/repository/mcp');
  });
});
