import { cn } from '@/lib/utils.ts';
import { STAGES, type Stage } from '@/tasks/task-stage.ts';

/**
 * Props of `StageTrack`.
 */
interface StageTrackProps {
  /**
   * Stage that the task stands at, or `undefined` while its status has no stage.
   */
  readonly stage: Stage | undefined;
}

/**
 * Stages of a task that stands at the stage `stage`, as a row of bars with the name of each stage below its bar. The
 * stages before the current one are filled, the current one is filled in the primary color, and the ones after it are
 * empty. A task that has landed stands at its last stage, `Done`.
 */
export const StageTrack = ({ stage: currentStage }: StageTrackProps) => {
  const current = STAGES.findIndex(({ stage }) => stage === currentStage);
  return (
    <ol aria-label="Stages" className="grid grid-cols-4 gap-1">
      {STAGES.map((stage, index) => {
        const passed = index < current;
        const isCurrent = index === current;
        return (
          <li key={stage.stage} aria-current={isCurrent ? 'step' : undefined} className="flex flex-col gap-1.5">
            <span
              aria-hidden="true"
              className={cn('h-1.5 rounded-full', isCurrent ? 'bg-primary' : passed ? 'bg-foreground/45' : 'bg-muted')}
            />
            <span className={cn('text-xs', isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {stage.label}
              <span className="sr-only">{isCurrent ? ', current' : passed ? ', passed' : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
};
