import type { RegisteredSession } from '../storage/session-store.ts';
import type { Task, TaskStore } from '../storage/task-store.ts';

/**
 * Name of the chat of every orchestrator session: the main session, which runs the atomic-workflow server.
 */
export const MAIN_NAME = 'main';

/**
 * Job of the orchestrator of a task: a subagent of the main session that takes the commands of one task which need an
 * agent, such as the resolution of a conflict when the task lands.
 */
export const ORCHESTRATOR_JOB = 'orchestrator';

/**
 * Number of the characters of a session id that the name of a subagent with no job holds, such as `agent-1a2b3c4d`.
 */
const SHORT_ID_LENGTH = 8;

/**
 * Pattern of a first message that runs a skill: a slash, the name of the plugin and a colon when the skill has one,
 * then the name of the skill, such as `/atomic-workflow:plan`.
 */
const SKILL_COMMAND = /^\/(?:[\w-]+:)?([\w-]+)(?:\s|$)/;

/**
 * The fields of a session that its name depends on.
 */
type NamedSession = Pick<RegisteredSession, 'id' | 'role' | 'job' | 'taskId' | 'ticketId'>;

/**
 * Returns the job that the first message `prompt` gives a subagent: the name of the skill that it runs, without the
 * name of its plugin, such as `plan` for `/atomic-workflow:plan add a cache`. If the message runs no skill, or there is
 * none, returns `null` instead.
 */
export const jobOfPrompt = (prompt: string | undefined): string | null =>
  SKILL_COMMAND.exec(prompt?.trimStart() ?? '')?.[1] ?? null;

/**
 * Returns whether a subagent with the job `job` works on one ticket, which names it: `implement` and each stage of it,
 * but not `implement-all`, which works on every ticket of a task.
 */
export const isTicketJob = (job: string | null): boolean =>
  job !== null && job.startsWith('implement') && job !== 'implement-all';

/**
 * Returns the name of the chat of each session of `sessions`, by its id. `sessions` must be in the order of their
 * start, as `SessionStore.list` returns them, and the tasks that they work on are read from `tasks`. A name that an
 * earlier session has already gets `-2`, `-3` and so on, so each subagent has a name of its own. Every orchestrator
 * session shares the name `main`, since they share one chat.
 */
export const sessionNames = async (
  sessions: readonly NamedSession[],
  tasks: TaskStore,
): Promise<ReadonlyMap<string, string>> => {
  const taskIds = [...new Set(sessions.flatMap(({ taskId }) => (taskId === null ? [] : [taskId])))];
  const known = new Map(
    (await Promise.all(taskIds.map((id) => tasks.get(id)))).flatMap((task) =>
      task === undefined ? [] : [[task.id, task] as const],
    ),
  );
  const counts = new Map<string, number>();
  return new Map(
    sessions.map((session) => {
      const base = baseNameOf(session, session.taskId === null ? undefined : known.get(session.taskId));
      if (session.role === 'orchestrator') return [session.id, base];
      const count = (counts.get(base) ?? 0) + 1;
      counts.set(base, count);
      return [session.id, count === 1 ? base : `${base}-${count}`];
    }),
  );
};

/**
 * Returns the name of the chat of `session`, which works on `task`, before a number tells it from an earlier session
 * of the same name: `main` for an orchestrator session, `agent-` and the start of its id for a subagent with no job,
 * and otherwise its job followed by the slug of its target. The target of a job that works on one ticket is its
 * ticket, and the target of every other job is its task. While the target is not known yet, the name is the job alone.
 */
export const baseNameOf = (session: NamedSession, task: Task | undefined): string => {
  if (session.role === 'orchestrator') return MAIN_NAME;
  const { job } = session;
  if (job === null) return `agent-${session.id.slice(0, SHORT_ID_LENGTH)}`;
  if (!isTicketJob(job)) return task === undefined ? job : `${job}-${task.slug}`;
  const ticket = task?.tickets.find(({ id }) => id === session.ticketId);
  return ticket === undefined ? job : `${job}-${ticket.slug}`;
};
