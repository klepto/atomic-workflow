import assert from 'node:assert/strict';
import { join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';
import { type TestClock, testClock } from '../testing/test-clock.ts';
import { claudeCreateTranscriptFinder } from './find-transcript.claude.ts';
import type { Transcript, TranscriptFinder } from './find-transcript.ts';
import type { SleepFunction } from './sleep.ts';
import type { TranscriptFiles } from './transcript-files.ts';

/**
 * Home directory of the user in the tests.
 */
const HOME = join('/home', 'user');

/**
 * Configuration directory of Claude Code in the tests, by default.
 */
const CONFIG = join(HOME, '.claude');

/**
 * Directory of the transcripts of the project `/repository` in the tests.
 */
const PROJECT = join(CONFIG, 'projects', '-repository');

/**
 * Process id of the Claude Code process in the tests.
 */
const PROCESS_ID = 42;

/**
 * Session file of the Claude Code process in the tests.
 */
const SESSION_FILE = join(CONFIG, 'sessions', `${PROCESS_ID}.json`);

/**
 * Path of the transcript of the session `session-1` in the tests.
 */
const TRANSCRIPT = join(PROJECT, 'session-1.jsonl');

/**
 * Directory of the transcripts of the subagents of the session `session-1` in the tests.
 */
const SUBAGENTS = join(PROJECT, 'session-1', 'subagents');

/**
 * Signal that never aborts.
 */
const NEVER = new AbortController().signal;

/**
 * Time of the entries of the tests.
 */
const TIMESTAMP = '2026-10-31T10:00:00.000Z';

/**
 * `TranscriptFiles` of a test, which keeps its files in memory and lets the test write them.
 */
interface TestFiles extends TranscriptFiles {
  /**
   * Writes the text `text` to the file at `path`.
   */
  write(path: string, text: string): void;
}

/**
 * Finder of a test, with the parts that it reads.
 */
interface TestFinder {
  /**
   * Finder of the transcripts.
   */
  readonly finder: TranscriptFinder;

  /**
   * Files that the finder reads.
   */
  readonly files: TestFiles;

  /**
   * Clock of the finder, which each sleep moves on.
   */
  readonly clock: TestClock;

  /**
   * Returns the number of sleeps of the finder so far.
   */
  readonly sleeps: () => number;
}

/**
 * Returns `TestFiles` that hold the files of `initial`, by path. A directory exists while it holds a file.
 */
const testFiles = (initial: Readonly<Record<string, string>> = {}): TestFiles => {
  const files = new Map(Object.entries(initial));
  const below = (directory: string): readonly string[] =>
    [...files.keys()].map((path) => relative(directory, path)).filter((path) => path !== '' && !path.startsWith('..'));
  return {
    write: (path, text) => void files.set(path, text),
    readText: async (path) => files.get(path),
    readStart: async (path, length) => {
      const text = files.get(path);
      if (text === undefined) throw new Error(`The file ${path} does not exist`);
      return text.slice(0, length);
    },
    exists: async (path) => files.has(path) || below(path).length > 0,
    listNames: async (directory) => [...new Set(below(directory).map((path) => path.split(sep)[0] ?? path))],
    listDirectories: async (directory) => [
      ...new Set(
        below(directory)
          .filter((path) => path.includes(sep))
          .map((path) => path.split(sep)[0] ?? path),
      ),
    ],
  };
};

/**
 * Returns a finder on `files`, whose sleep moves its clock on by the time of the sleep, and then calls `onSleep` with
 * the number of sleeps so far.
 */
const testFinder = (files: TestFiles, onSleep: (count: number) => void = () => undefined): TestFinder => {
  const clock = testClock();
  let count = 0;
  const sleep: SleepFunction = async (duration) => {
    clock.advance(duration);
    count += 1;
    onSleep(count);
  };
  const finder = claudeCreateTranscriptFinder({ files, clock, sleep, homeDirectory: HOME });
  return { finder, files, clock, sleeps: () => count };
};

/**
 * Returns the text of the session file that names the session `sessionId`.
 */
const sessionFile = (sessionId: string): string => JSON.stringify({ pid: PROCESS_ID, sessionId });

/**
 * Returns the line of a message of the user with the content `content`, of a subagent with `sidechain`.
 */
const userLine = (content: string, sidechain = false): string =>
  JSON.stringify({
    type: 'user',
    uuid: 'message-1',
    timestamp: TIMESTAMP,
    isSidechain: sidechain,
    message: { content },
  });

/**
 * Returns the fields of `transcript` that are no functions.
 */
const fieldsOf = (transcript: Transcript | undefined): object | undefined =>
  transcript === undefined
    ? undefined
    : {
        agent: transcript.agent,
        sessionId: transcript.sessionId,
        path: transcript.path,
        backgroundTaskId: transcript.backgroundTaskId,
      };

/**
 * Returns the transcript of the session `session-1` that `finder` finds, which must exist.
 */
const sessionTranscript = async (finder: TranscriptFinder): Promise<Transcript> => {
  const transcript = await finder.findTranscript({}, PROCESS_ID);
  if (transcript === undefined) throw new Error('The transcript of the session is missing');
  return transcript;
};

/**
 * Files of a session `session-1` whose transcript exists.
 */
const SESSION_FILES = { [SESSION_FILE]: sessionFile('session-1'), [TRANSCRIPT]: '' };

describe('claudeCreateTranscriptFinder', () => {
  describe('findTranscript', () => {
    it('returns the transcript of the session that the session file of the process names', async () => {
      const { finder } = testFinder(testFiles(SESSION_FILES));
      assert.deepEqual(fieldsOf(await finder.findTranscript({}, PROCESS_ID)), {
        agent: 'claude',
        sessionId: 'session-1',
        path: TRANSCRIPT,
        backgroundTaskId: undefined,
      });
    });

    it('reads the configuration directory that CLAUDE_CONFIG_DIR names', async () => {
      const config = join('/config');
      const path = join(config, 'projects', '-repository', 'session-1.jsonl');
      const files = testFiles({ [join(config, 'sessions', '42.json')]: sessionFile('session-1'), [path]: '' });
      const { finder } = testFinder(files);
      assert.equal((await finder.findTranscript({ CLAUDE_CONFIG_DIR: config }, PROCESS_ID))?.path, path);
    });

    it('takes CLAUDE_CODE_SESSION_ID without a session file', async () => {
      const { finder } = testFinder(testFiles({ [TRANSCRIPT]: '' }));
      const transcript = await finder.findTranscript({ CLAUDE_CODE_SESSION_ID: 'session-1' }, PROCESS_ID);
      assert.equal(transcript?.path, TRANSCRIPT);
    });

    it('takes CLAUDE_CODE_SESSION_ID for a session file that names no session', async () => {
      const { finder } = testFinder(testFiles({ [SESSION_FILE]: '{"pid":', [TRANSCRIPT]: '' }));
      const transcript = await finder.findTranscript({ CLAUDE_CODE_SESSION_ID: 'session-1' }, PROCESS_ID);
      assert.equal(transcript?.sessionId, 'session-1');
    });

    it('returns undefined when nothing names a session', async () => {
      const { finder } = testFinder(testFiles({ [TRANSCRIPT]: '' }));
      assert.equal(await finder.findTranscript({}, PROCESS_ID), undefined);
    });

    it('rejects when the session file cannot be read', async () => {
      const files: TestFiles = {
        ...testFiles(SESSION_FILES),
        readText: async () => {
          throw new Error('Permission denied');
        },
      };
      const { finder } = testFinder(files);
      await assert.rejects(finder.findTranscript({}, PROCESS_ID), { message: 'Permission denied' });
    });

    it('returns the path in the directory of CLAUDE_PROJECT_DIR for a transcript that does not exist yet', async () => {
      const { finder } = testFinder(testFiles({ [SESSION_FILE]: sessionFile('session-1') }));
      const transcript = await finder.findTranscript({ CLAUDE_PROJECT_DIR: '/dev/my repo' }, PROCESS_ID);
      assert.equal(transcript?.path, join(CONFIG, 'projects', '-dev-my-repo', 'session-1.jsonl'));
    });

    it('returns undefined for a transcript that does not exist without CLAUDE_PROJECT_DIR', async () => {
      const { finder } = testFinder(testFiles({ [SESSION_FILE]: sessionFile('session-1') }));
      assert.equal(await finder.findTranscript({}, PROCESS_ID), undefined);
    });

    it('returns a transcript whose session ends once the session file names another session', async () => {
      const files = testFiles(SESSION_FILES);
      const test = testFinder(files, () => files.write(SESSION_FILE, sessionFile('session-2')));
      const transcript = await sessionTranscript(test.finder);
      await transcript.waitForEnd(NEVER);
      assert.equal(test.sleeps(), 1);
    });

    it('returns a transcript whose wait for the end resolves once the signal aborts', async () => {
      const test = testFinder(testFiles(SESSION_FILES));
      const transcript = await sessionTranscript(test.finder);
      await transcript.waitForEnd(AbortSignal.abort());
      assert.equal(test.sleeps(), 0);
    });

    it('returns a transcript that parses the entries of the session only', async () => {
      const { finder } = testFinder(testFiles(SESSION_FILES));
      const transcript = await sessionTranscript(finder);
      assert.equal(transcript.parseLine(userLine('Hello')).message?.content, 'Hello');
      assert.equal(transcript.parseLine(userLine('Hello', true)).message, undefined);
      assert.equal(transcript.parseLine('{"type":').activity, undefined);
    });

    it('shares the waits for the messages of the server among the transcripts of one finder', async () => {
      const { finder } = testFinder(testFiles(SESSION_FILES));
      const before = await sessionTranscript(finder);
      const call = { type: 'tool_use', id: 'call-1', input: { command: 'node await-command.mjs session-1' } };
      before.parseLine(JSON.stringify({ type: 'assistant', message: { content: [call] } }));
      const after = await sessionTranscript(finder);
      assert.equal(after.parseLine(userLine('The command call-1 ended')).message, undefined);
      const other = await sessionTranscript(testFinder(testFiles(SESSION_FILES)).finder);
      assert.equal(other.parseLine(userLine('The command call-1 ended')).message?.content, 'The command call-1 ended');
    });
  });

  describe('findSubagentTranscript', () => {
    it('returns the transcript of the subagent whose prompt names its session id', async () => {
      const files = testFiles({
        ...SESSION_FILES,
        [join(SUBAGENTS, 'agent-a1.jsonl')]: userLine('You are subagent-2.', true),
        [join(SUBAGENTS, 'agent-b2.jsonl')]: userLine('You are subagent-1.', true),
      });
      const { finder } = testFinder(files);
      const parent = await sessionTranscript(finder);
      assert.deepEqual(fieldsOf(await finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false)), {
        agent: 'claude',
        sessionId: 'subagent-1',
        path: join(SUBAGENTS, 'agent-b2.jsonl'),
        backgroundTaskId: 'b2',
      });
    });

    it('skips the files that are no transcripts of subagents', async () => {
      const files = testFiles({
        ...SESSION_FILES,
        [join(SUBAGENTS, 'agent-a1.meta.json')]: 'subagent-1',
        [join(SUBAGENTS, 'notes-subagent-1.jsonl')]: 'subagent-1',
      });
      const test = testFinder(files);
      const parent = await sessionTranscript(test.finder);
      assert.equal(
        await test.finder.findSubagentTranscript(parent, 'subagent-1', AbortSignal.abort(), false),
        undefined,
      );
    });

    it('returns undefined for a parent that is no transcript of Claude Code', async () => {
      const files = testFiles({ ...SESSION_FILES, [join(SUBAGENTS, 'agent-a1.jsonl')]: 'subagent-1' });
      const { finder } = testFinder(files);
      const parent: Transcript = { ...(await sessionTranscript(finder)), agent: 'codex' };
      assert.equal(await finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false), undefined);
    });

    it('rejects when a transcript of a subagent cannot be read', async () => {
      const files: TestFiles = {
        ...testFiles({ ...SESSION_FILES, [join(SUBAGENTS, 'agent-a1.jsonl')]: 'subagent-1' }),
        readStart: async () => {
          throw new Error('Permission denied');
        },
      };
      const { finder } = testFinder(files);
      const parent = await sessionTranscript(finder);
      await assert.rejects(finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false), {
        message: 'Permission denied',
      });
    });

    it('searches again until the transcript appears', async () => {
      const files = testFiles(SESSION_FILES);
      const test = testFinder(files, (count) => {
        if (count === 2) files.write(join(SUBAGENTS, 'agent-a1.jsonl'), 'subagent-1');
      });
      const parent = await sessionTranscript(test.finder);
      const transcript = await test.finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false);
      assert.equal(transcript?.backgroundTaskId, 'a1');
      assert.equal(test.sleeps(), 2);
    });

    it('gives up once 10 s have passed', async () => {
      const test = testFinder(testFiles(SESSION_FILES));
      const parent = await sessionTranscript(test.finder);
      assert.equal(await test.finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false), undefined);
      assert.equal(test.clock.now(), 10_000);
    });

    it('searches longer for a one-shot subagent', async () => {
      // The sleeps move the clock on by 500 ms each, so the transcript appears once 15 s have passed.
      const appearLate = (files: TestFiles) => (count: number) => {
        if (count === 30) files.write(join(SUBAGENTS, 'agent-a1.jsonl'), 'subagent-1');
      };
      const oneShotFiles = testFiles(SESSION_FILES);
      const oneShot = testFinder(oneShotFiles, appearLate(oneShotFiles));
      const oneShotParent = await sessionTranscript(oneShot.finder);
      const found = await oneShot.finder.findSubagentTranscript(oneShotParent, 'subagent-1', NEVER, true);
      assert.equal(found?.backgroundTaskId, 'a1');
      const regularFiles = testFiles(SESSION_FILES);
      const regular = testFinder(regularFiles, appearLate(regularFiles));
      const regularParent = await sessionTranscript(regular.finder);
      assert.equal(await regular.finder.findSubagentTranscript(regularParent, 'subagent-1', NEVER, false), undefined);
    });

    it('returns undefined without a search when the signal has aborted', async () => {
      const test = testFinder(testFiles(SESSION_FILES));
      const parent = await sessionTranscript(test.finder);
      assert.equal(
        await test.finder.findSubagentTranscript(parent, 'subagent-1', AbortSignal.abort(), false),
        undefined,
      );
      assert.equal(test.sleeps(), 0);
    });

    it('returns a transcript whose session ends once the subagent is stopped', async () => {
      const files = testFiles({ ...SESSION_FILES, [join(SUBAGENTS, 'agent-a1.jsonl')]: 'subagent-1' });
      const test = testFinder(files, () =>
        files.write(join(SUBAGENTS, 'agent-a1.meta.json'), JSON.stringify({ stoppedByUser: true })),
      );
      const parent = await sessionTranscript(test.finder);
      const transcript = await test.finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false);
      await transcript?.waitForEnd(NEVER);
      assert.equal(test.sleeps(), 1);
    });

    it('returns a transcript of a one-shot subagent whose session ends once the subagent finishes', async () => {
      const files = testFiles({
        ...SESSION_FILES,
        [join(SUBAGENTS, 'agent-a1.jsonl')]: 'subagent-1',
        [join(SUBAGENTS, 'agent-a1.meta.json')]: JSON.stringify({ finished: true }),
      });
      const test = testFinder(files);
      const parent = await sessionTranscript(test.finder);
      const transcript = await test.finder.findSubagentTranscript(parent, 'subagent-1', NEVER, true);
      await transcript?.waitForEnd(NEVER);
      assert.equal(test.sleeps(), 0);
    });

    it('returns a transcript of a subagent whose session goes on once the subagent finishes', async () => {
      const files = testFiles({
        ...SESSION_FILES,
        [join(SUBAGENTS, 'agent-a1.jsonl')]: 'subagent-1',
        [join(SUBAGENTS, 'agent-a1.meta.json')]: JSON.stringify({ finished: true }),
      });
      const abort = new AbortController();
      const test = testFinder(files, (count) => {
        if (count === 3) abort.abort();
      });
      const parent = await sessionTranscript(test.finder);
      const transcript = await test.finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false);
      await transcript?.waitForEnd(abort.signal);
      assert.equal(test.sleeps(), 3);
    });

    it('returns a transcript that parses the entries of the subagent only', async () => {
      const files = testFiles({ ...SESSION_FILES, [join(SUBAGENTS, 'agent-a1.jsonl')]: 'subagent-1' });
      const { finder } = testFinder(files);
      const parent = await sessionTranscript(finder);
      const transcript = await finder.findSubagentTranscript(parent, 'subagent-1', NEVER, false);
      assert.equal(transcript?.parseLine(userLine('Hello', true)).message?.content, 'Hello');
      assert.equal(transcript?.parseLine(userLine('Hello')).message, undefined);
    });
  });
});
