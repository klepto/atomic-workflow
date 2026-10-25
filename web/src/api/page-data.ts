import { useCallback, useEffect, useState } from 'react';
import { useEventStream } from './event-stream.ts';
import { call } from './rpc.ts';
import type { ListedSession, Repository, TaskSummary } from './types.ts';

/**
 * The data of the page, which `usePageData` keeps current by the stream at `/events`.
 */
export interface PageData {
  /**
   * The repository that the server serves, or `undefined` until `repositoryGet` answered, and while it fails.
   */
  repository: Repository | undefined;

  /**
   * The attached sessions, as the latest `sessionList` answered them, or `undefined` until it answered once.
   */
  sessions: readonly ListedSession[] | undefined;

  /**
   * The tasks in the order of their ids, as the latest `taskList` answered them, or `undefined` until it answered once.
   */
  tasks: readonly TaskSummary[] | undefined;

  /**
   * A counter that grows by one with each change of the message log, and after each reconnect of the stream, so that
   * a component that shows messages reads them again when it changes.
   */
  messages: number;

  /**
   * Reads the attached sessions again, such as after a call that changed them. Resolves once a read that started after
   * the call ended.
   */
  readSessions: () => Promise<void>;
}

/**
 * Returns a function that runs `read`, with reads that never overlap. A call during a read queues one more read, which
 * starts once that read ends, however many calls came meanwhile. The function resolves once a read that started after
 * its call ended. `read` must not reject.
 */
const serialReads = (read: () => Promise<void>): (() => Promise<void>) => {
  let running: Promise<void> | undefined;
  let queued: Promise<void> | undefined;

  /**
   * Starts a read, and notes it as the running one until it ends.
   */
  const start = () => {
    running = read().finally(() => {
      running = undefined;
    });
    return running;
  };

  return () => {
    if (queued !== undefined) {
      return queued;
    }
    if (running === undefined) {
      return start();
    }
    queued = running.then(() => {
      queued = undefined;
      return start();
    });
    return queued;
  };
};

/**
 * Ignores a failed read, so that the data of the page keeps the result of the latest read that succeeded.
 */
const keepLastData = () => undefined;

/**
 * Reads the data of the page and keeps it current by the one stream of the page at `/events`. At load it reads the
 * repository, the attached sessions and the tasks. On `sessions` it reads the sessions again, on `tasks` the tasks, and
 * on `messages` it adds one to `messages`. When the stream opens again after a drop, it reads everything again and adds
 * one to `messages`, since events may have been lost meanwhile. Reads of one resource never overlap.
 */
export const usePageData = (): PageData => {
  const [repository, setRepository] = useState<Repository>();
  const [sessions, setSessions] = useState<readonly ListedSession[]>();
  const [tasks, setTasks] = useState<readonly TaskSummary[]>();
  const [messages, setMessages] = useState(0);
  const [readers] = useState(() => ({
    repository: serialReads(() => call<Repository>('repositoryGet').then(setRepository, keepLastData)),
    sessions: serialReads(() =>
      call<{ sessions: readonly ListedSession[] }>('sessionList', { attached: true }).then(
        (result) => setSessions(result.sessions),
        keepLastData,
      ),
    ),
    tasks: serialReads(() =>
      call<{ tasks: readonly TaskSummary[] }>('taskList').then((result) => setTasks(result.tasks), keepLastData),
    ),
  }));

  const readAll = useCallback(() => {
    void readers.repository();
    void readers.sessions();
    void readers.tasks();
  }, [readers]);

  useEffect(() => {
    readAll();
  }, [readAll]);
  useEventStream(
    '/events',
    (event) => {
      switch (event) {
        case 'sessions':
          void readers.sessions();
          break;
        case 'tasks':
          void readers.tasks();
          break;
        case 'messages':
          setMessages((count) => count + 1);
          break;
      }
    },
    () => {
      readAll();
      setMessages((count) => count + 1);
    },
  );

  return { repository, sessions, tasks, messages, readSessions: readers.sessions };
};
