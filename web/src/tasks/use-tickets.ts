import { useEffect, useState } from 'react';
import { call } from '@/api/rpc.ts';
import type { TaskDetail, TaskSummary, Ticket } from '@/api/types.ts';

/**
 * Returns the tickets of the task `task` in the order of their ids, read again with each change of `task`, or
 * `undefined` until the first read answered. A failed read keeps the tickets of the latest read that succeeded.
 */
export const useTickets = (task: TaskSummary): readonly Ticket[] | undefined => {
  const [tickets, setTickets] = useState<readonly Ticket[]>();
  useEffect(() => {
    let current = true;
    call<TaskDetail>('taskGet', { task: task.id }).then(
      (detail) => {
        if (current) setTickets([...detail.tickets].sort((first, second) => first.id - second.id));
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [task]);
  return tickets;
};
