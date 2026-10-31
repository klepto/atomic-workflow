import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AwaitCommandLineFunction } from '../attachment/await-command-line.ts';
import { awaitReport } from './await-report.ts';

/**
 * Options of the reports of the tests.
 */
const OPTIONS = { entryPoint: '/plugin/dist/await-command.mjs' };

/**
 * `AwaitCommandLineFunction` of the tests, which names each of its arguments.
 */
const awaitCommandLine: AwaitCommandLineFunction = (entryPoint, sessionId, after) =>
  `node ${entryPoint} ${sessionId} ${after ?? 'none'}`;

/**
 * Dependencies of the reports of the tests.
 */
const DEPENDENCIES = { awaitCommandLine };

/**
 * Returns the report of the wait that took the messages `contents`, numbered from 1, of the session `sessionId`.
 */
const reportOf = (contents: readonly string[], sessionId = 'session-1'): string =>
  awaitReport(
    { status: 'messages', sessionId, messages: contents.map((content, index) => ({ id: index + 1, content })) },
    OPTIONS,
    DEPENDENCIES,
  );

/**
 * Returns the lines of the quote of `reportOf` for the messages `contents`: the lines after the mark.
 */
const quotesOf = (contents: readonly string[]): readonly string[] => {
  const lines = reportOf(contents).split('\n');
  return lines.slice(3, 3 + contents.length);
};

describe('awaitReport', () => {
  it('hands one message to the agent with the command line of the next wait', () => {
    assert.equal(
      reportOf(['Implement ticket 3']),
      [
        'Run in the background first: node /plugin/dist/await-command.mjs session-1 1',
        'Start your reply with these lines as they are:',
        'atomic-workflow:',
        '> Implement ticket 3',
        'Handle like a message of the user:',
        'Implement ticket 3',
      ].join('\n'),
    );
  });

  it('hands several messages oldest first, and acknowledges up to the last one', () => {
    assert.equal(
      reportOf(['First', 'Second']),
      [
        'Run in the background first: node /plugin/dist/await-command.mjs session-1 2',
        'Start your reply with these lines as they are:',
        'atomic-workflow:',
        '> First',
        '> Second',
        'Handle like messages of the user, oldest first:',
        'First\n\n---\n\nSecond',
      ].join('\n'),
    );
  });

  it('names the session that the inbox belongs to now in the command line', () => {
    assert.equal(
      reportOf(['Hello'], 'session-2').split('\n')[0],
      'Run in the background first: node /plugin/dist/await-command.mjs session-2 1',
    );
  });

  it('quotes the first line that is not blank of a message, with an ellipsis for the rest', () => {
    assert.deepEqual(quotesOf(['\n  First line  \nSecond line']), ['> First line …']);
  });

  it('cuts the quote of a long line to 200 characters, with an ellipsis', () => {
    assert.deepEqual(quotesOf(['a'.repeat(201)]), [`> ${'a'.repeat(200)} …`]);
  });

  it('quotes a line of 200 characters whole', () => {
    assert.deepEqual(quotesOf(['a'.repeat(200)]), [`> ${'a'.repeat(200)}`]);
  });

  it('tells the agent to stop waiting once the messages are stopped', () => {
    assert.equal(
      awaitReport({ status: 'stop' }, OPTIONS, DEPENDENCIES),
      'The atomic-workflow server has stopped the messages of this session. Do not run the wait command again.',
    );
  });

  it('tells the agent to do nothing once a newer wait replaced the wait', () => {
    assert.equal(
      awaitReport({ status: 'replaced' }, OPTIONS, DEPENDENCIES),
      'A newer wait for the messages of this session has replaced this one. Do nothing about it.',
    );
  });
});
