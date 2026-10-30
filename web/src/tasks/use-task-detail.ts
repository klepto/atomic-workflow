import { useEffect, useState } from 'react';
import { fetchCall } from '@/api/rpc.fetch.ts';
import type { TaskDetail, TaskSummary } from '@/api/types.ts';

/**
 * Reads of `taskGet` by the summary of their task. Each change of the tasks brings a new summary, so a summary names
 * one state of its task, and every component that shows that state shares one read.
 */
const reads = new WeakMap<TaskSummary, Promise<TaskDetail>>();

/**
 * Returns the goals and the tickets of the task `task`, each in the order of their ids. Sends `taskGet` only for the
 * first call with `task`, and gives every later call with `task` the same answer. Rejects when the read fails.
 */
const readTaskDetail = async (task: TaskSummary): Promise<TaskDetail> => {
  let read = reads.get(task);
  if (read === undefined) {
    read = fetchCall<TaskDetail>('taskGet', { task: task.id }).then((detail) => ({
      ...detail,
      goals: detail.goals.toSorted((first, second) => first.id - second.id),
      tickets: detail.tickets.toSorted((first, second) => first.id - second.id),
    }));
    reads.set(task, read);
  }
  return read;
};

/**
 * Returns the goals and the tickets of the task `task`, each in the order of their ids, read again with each change of
 * `task`, or `undefined` until the first read answered. A failed read keeps the answer of the latest read that
 * succeeded. Every component that shows the same `task` shares one read.
 */
export const useTaskDetail = (task: TaskSummary): TaskDetail | undefined => {
  const [detail, setDetail] = useState<TaskDetail>();
  useEffect(() => {
    let current = true;
    readTaskDetail(task).then(
      (answer) => {
        if (current) setDetail(answer);
      },
      // A failed read keeps the answer of the latest read that succeeded, and the next change of the task reads again.
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [task]);
  return detail;
};
