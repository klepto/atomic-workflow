import type { TaskSummary } from '@/api/types.ts';

/**
 * Stages of a task in their order, each with its label and the words that the task panel names the task by while it
 * stands at that stage.
 */
export const STAGES = [
  { stage: 'plan', label: 'Plan', words: 'Planning' },
  { stage: 'implement', label: 'Implement', words: 'Plan complete, tickets in work' },
  { stage: 'review', label: 'Review', words: 'Every ticket landed, waiting for approval' },
  { stage: 'done', label: 'Done', words: 'Landed on its base branch' },
] as const;

/**
 * Stage of a task, as the task panel shows it.
 */
export type Stage = (typeof STAGES)[number]['stage'];

/**
 * Words of each status of a task while it stands at the stage `plan`, which name the phase of planning.
 */
const PLAN_WORDS: Readonly<Record<string, string>> = {
  'plan-goals': 'Planning the goals',
  'plan-design': 'Planning the design',
  'plan-tickets': 'Planning the tickets',
};

/**
 * Returns the stage that the task `task` stands at: `plan` while any phase of planning runs, `implement` once the plan
 * is complete, `review` once the work of every ticket landed but the task did not, and `done` once the task landed. If
 * the status of the task has no stage, returns `undefined` instead.
 */
export const stageOf = (task: TaskSummary): Stage | undefined => {
  if (task.status === 'done') return 'done';
  if (task.status === 'complete') {
    return task.totalTickets > 0 && task.completedTickets === task.totalTickets ? 'review' : 'implement';
  }
  return task.status in PLAN_WORDS ? 'plan' : undefined;
};

/**
 * Returns the words that the task panel names the status of the task `task` by: the phase of planning while it plans,
 * else the words of its stage, else its status as it is.
 */
export const statusWordsOf = (task: TaskSummary): string =>
  PLAN_WORDS[task.status] ?? STAGES.find(({ stage }) => stage === stageOf(task))?.words ?? task.status;
