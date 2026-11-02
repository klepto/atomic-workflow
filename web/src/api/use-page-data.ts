import { useCallback, useEffect, useState } from 'react';
import { setOnline } from '@/api/connection.ts';
import { fetchCall } from '@/api/rpc.fetch.ts';
import { serialReads } from '@/api/serial-reads.ts';
import type { ListedSession, PermissionPrompt, Repository, TaskSummary, UsageLimits } from '@/api/types.ts';
import { useEventStream } from '@/api/use-event-stream.ts';

/**
 * Data of the page, which `usePageData` keeps current by the stream at `/events`.
 */
interface PageData {
  /**
   * Repository that the server serves, or `undefined` until `repositoryGet` answered, and while it fails.
   */
  readonly repository: Repository | undefined;

  /**
   * Sessions of the repository, attached or not, as the latest `sessionList` answered them, or `undefined` until it
   * answered once.
   */
  readonly sessions: readonly ListedSession[] | undefined;

  /**
   * Tasks in the order of their ids, as the latest `taskList` answered them, or `undefined` until it answered once.
   */
  readonly tasks: readonly TaskSummary[] | undefined;

  /**
   * Usage limits of the Claude subscription, as the latest `usageGet` answered them, or `undefined` until it answered
   * once, and while it fails.
   */
  readonly usage: UsageLimits | undefined;

  /**
   * Counter that grows by one with each change of the message log, and after each reconnect of the stream, so that a
   * component that shows messages reads them again when it changes.
   */
  readonly messages: number;

  /**
   * Open permission prompts of the repository, oldest first, as the latest `permissionPromptList` answered them, or
   * `undefined` until it answered once.
   */
  readonly prompts: readonly PermissionPrompt[] | undefined;

  /**
   * Reads the sessions again, such as after a call that changed them. Resolves once a read that started after the call
   * ended.
   */
  readonly readSessions: () => Promise<void>;

  /**
   * Reads the open permission prompts again, such as after an answer to a prompt that was gone. Resolves once a read
   * that started after the call ended.
   */
  readonly readPrompts: () => Promise<void>;
}

/**
 * Result of `sessionList`.
 */
interface SessionListResult {
  /**
   * Sessions of the repository, attached or not.
   */
  readonly sessions: readonly ListedSession[];
}

/**
 * Result of `taskList`.
 */
interface TaskListResult {
  /**
   * Tasks in the order of their ids.
   */
  readonly tasks: readonly TaskSummary[];
}

/**
 * Result of `permissionPromptList`.
 */
interface PromptListResult {
  /**
   * Every open permission prompt, oldest first.
   */
  readonly prompts: readonly PermissionPrompt[];
}

/**
 * Ignores a failed read, so that the data of the page keeps the result of the latest read that succeeded.
 */
const keepLastData = (): undefined => undefined;

/**
 * Reads the data of the page and keeps it current by the one stream of the page at `/events`, which also feeds the
 * state of the connection. At load it reads the repository, the sessions, the tasks, the usage limits and the open
 * permission prompts. On `sessions` it reads the sessions again, on `tasks` the tasks, on `usage` the usage limits, on
 * `prompts` the open permission prompts, and on `messages` it reads the
 * sessions again, since each holds the time of its latest message, and adds one to `messages`. When the stream opens
 * again after a drop, it reads everything again and adds one to `messages`, since events may have been lost meanwhile.
 * Reads of one resource never overlap. Returns the data of the page.
 */
export const usePageData = (): PageData => {
  const [repository, setRepository] = useState<Repository>();
  const [sessions, setSessions] = useState<readonly ListedSession[]>();
  const [tasks, setTasks] = useState<readonly TaskSummary[]>();
  const [usage, setUsage] = useState<UsageLimits>();
  const [messages, setMessages] = useState(0);
  const [prompts, setPrompts] = useState<readonly PermissionPrompt[]>();
  const [readers] = useState(() => ({
    repository: serialReads(() => fetchCall<Repository>('repositoryGet').then(setRepository, keepLastData)),
    sessions: serialReads(() =>
      fetchCall<SessionListResult>('sessionList').then((result) => setSessions(result.sessions), keepLastData),
    ),
    tasks: serialReads(() =>
      fetchCall<TaskListResult>('taskList').then((result) => setTasks(result.tasks), keepLastData),
    ),
    prompts: serialReads(() =>
      fetchCall<PromptListResult>('permissionPromptList').then((result) => setPrompts(result.prompts), keepLastData),
    ),
    // A failed read forgets the usage limits, so that the meter shows them as unknown, not as values that may be stale.
    usage: serialReads(() => fetchCall<UsageLimits>('usageGet').then(setUsage, () => setUsage(undefined))),
  }));

  const readAll = useCallback(() => {
    void readers.repository();
    void readers.sessions();
    void readers.tasks();
    void readers.usage();
    void readers.prompts();
  }, [readers]);

  useEffect(() => {
    readAll();
  }, [readAll]);
  useEventStream('/events', {
    onEvent: (event) => {
      switch (event) {
        case 'sessions':
          void readers.sessions();
          break;
        case 'tasks':
          void readers.tasks();
          break;
        case 'usage':
          void readers.usage();
          break;
        case 'prompts':
          void readers.prompts();
          break;
        case 'messages':
          // The sessions hold the time of the latest message of each, which orders the chats.
          void readers.sessions();
          setMessages((count) => count + 1);
          break;
      }
    },
    onReconnect: () => {
      readAll();
      setMessages((count) => count + 1);
    },
    onOnline: setOnline,
  });

  return {
    repository,
    sessions,
    tasks,
    usage,
    messages,
    prompts,
    readSessions: readers.sessions,
    readPrompts: readers.prompts,
  };
};
