import { useEffect, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { Goal, TaskDetail, TaskSummary } from '@/api/types.ts';

/**
 * Returns the goals of the task `task` in the order of their ids, read again with each change of `task`, or
 * `undefined` until the first read answered. A failed read keeps the goals of the latest read that succeeded.
 */
export const useGoals = (task: TaskSummary): readonly Goal[] | undefined => {
  const [goals, setGoals] = useState<readonly Goal[]>();
  useEffect(() => {
    let current = true;
    call<TaskDetail>('taskGet', { task: task.id }).then(
      (detail) => {
        if (current) setGoals([...detail.goals].sort((first, second) => first.id - second.id));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [task]);
  return goals;
};
