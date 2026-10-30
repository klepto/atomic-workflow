import type { TaskSummary } from '@/api/types.ts';
import { cn } from '@/lib/utils.ts';

/**
 * Props of `TicketCount`.
 */
interface TicketCountProps {
  /**
   * Task whose tickets the count shows.
   */
  readonly task: TaskSummary;
}

/**
 * Count of the tickets of the task `task`: how many of them landed, then one cell per ticket, filled for each that
 * landed. It reads `No tickets yet` while the task has none.
 */
export const TicketCount = ({ task }: TicketCountProps) => {
  if (task.totalTickets === 0) {
    return <p className="text-muted-foreground text-sm">No tickets yet</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        <span className="font-medium tabular-nums">{task.completedTickets}</span>
        <span className="text-muted-foreground">{` of ${task.totalTickets} landed`}</span>
      </p>
      <div aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: task.totalTickets }, (_, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the cells have no identity besides their place.
            key={index}
            className={cn('h-3 flex-1 rounded-[2px]', index < task.completedTickets ? 'bg-foreground/70' : 'bg-muted')}
          />
        ))}
      </div>
    </div>
  );
};
