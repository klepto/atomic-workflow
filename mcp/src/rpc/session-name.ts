import { type RegisteredSession, SESSION_ALIAS_MAX_LENGTH } from '../storage/session-store.ts';
import type { Task, TaskStore } from '../storage/task-store.ts';

/**
 * Alias of every orchestrator session, which names the chat of the main session, the one that runs the
 * atomic-workflow server. No subagent holds it.
 */
export const MAIN_ALIAS = 'main';

/**
 * Job of a subagent that plans a task. A subagent with no job that creates a task gets the alias of this job, such as
 * `plan-cache-layer-redis`.
 */
export const PLAN_JOB = 'plan';

/**
 * Job of a subagent that implements one ticket of a task, such as one that `subagentCreate` registers for a ticket.
 */
export const IMPLEMENT_JOB = 'implement';

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
 * Fields of a session that its name depends on.
 */
type NamedSession = Pick<RegisteredSession, 'id' | 'role' | 'job' | 'taskId' | 'ticketId' | 'alias'>;

/**
 * Returns the job that the first message `prompt` gives a subagent: the name of the skill that it runs, without the
 * name of its plugin, such as `plan` for `/atomic-workflow:plan add a cache`. If the message runs no skill, or there is
 * none, returns `null` instead.
 */
export const jobOfPrompt = (prompt: string | undefined): string | null =>
  SKILL_COMMAND.exec(prompt?.trimStart() ?? '')?.[1] ?? null;

/**
 * Returns the words that follow the command of the skill that the first message `prompt` runs, such as `['3', '2']`
 * for `/atomic-workflow:implement 3 2`. If the message runs no skill, or there is none, returns no words.
 */
export const argumentsOfPrompt = (prompt: string | undefined): readonly string[] => {
  const text = prompt?.trimStart() ?? '';
  const command = SKILL_COMMAND.exec(text);
  if (command === null) return [];
  return text
    .slice(command[0].length)
    .split(/\s+/)
    .filter((word) => word.length > 0);
};

/**
 * Returns whether a subagent with the job `job` works on one ticket, which names it: `implement` and each stage of it,
 * but not `implement-all`, which works on every ticket of a task.
 */
export const isTicketJob = (job: string | null): boolean =>
  (job?.startsWith(IMPLEMENT_JOB) ?? false) && job !== `${IMPLEMENT_JOB}-all`;

/**
 * Returns the alias of a subagent with the job `job` that works on `task` and on its ticket `ticketId`: the job
 * followed by the slug of its target, such as `implement-cache-key-format`, cut to `SESSION_ALIAS_MAX_LENGTH`
 * characters. The target of a job that works on one ticket is its ticket, and the target of every other job is its
 * task. If `job` is `null`, or the target is not known yet, returns `null` instead.
 */
export const aliasOf = (job: string | null, task: Task | undefined, ticketId: number | null): string | null => {
  if (job === null || task === undefined) return null;
  const slug = isTicketJob(job) ? task.tickets.find(({ id }) => id === ticketId)?.slug : task.slug;
  return slug === undefined ? null : `${job}-${slug}`.slice(0, SESSION_ALIAS_MAX_LENGTH);
};

/**
 * Returns the name of the chat of each session of `sessions`, by its id. `sessions` must be in the order of their
 * start, as `SessionStore.list` returns them, and the tasks that they work on are read from `tasks`. A session with an
 * alias is named by its alias as it is, since sessions that share an alias share one chat. A session with no alias is
 * named by its base name, which gets `-2`, `-3` and so on when an earlier session has that name already or when it is
 * the alias of any session, so no session with no alias shares a name with another session. Rejects as `tasks` does.
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
  const taken = new Set(sessions.flatMap(({ alias }) => (alias === null ? [] : [alias])));
  const counts = new Map<string, number>();
  return new Map(
    sessions.map((session) => {
      if (session.alias !== null) return [session.id, session.alias];
      const base = baseNameOf(session, session.taskId === null ? undefined : known.get(session.taskId));
      return [session.id, freeName(base, counts, taken)];
    }),
  );
};

/**
 * Returns the first of the names `base`, `base-2`, `base-3` and so on that `taken` does not hold, starting after the
 * number that `counts` holds for `base`, and records it in `counts` and in `taken`.
 */
const freeName = (base: string, counts: Map<string, number>, taken: Set<string>): string => {
  let count = counts.get(base) ?? 0;
  let name: string;
  do {
    count += 1;
    name = count === 1 ? base : `${base}-${count}`;
  } while (taken.has(name));
  counts.set(base, count);
  taken.add(name);
  return name;
};

/**
 * Returns the name of the chat of `session`, which works on `task`, before a number tells it from an earlier session
 * of the same name: `main` for an orchestrator session, `agent-` and the start of its id for a subagent with no job,
 * and otherwise its job followed by the slug of its target. The target of a job that works on one ticket is its
 * ticket, and the target of every other job is its task. While the target is not known yet, the name is the job alone.
 */
export const baseNameOf = (session: NamedSession, task: Task | undefined): string => {
  if (session.role === 'orchestrator') return MAIN_ALIAS;
  const { job } = session;
  if (job === null) return `agent-${session.id.slice(0, SHORT_ID_LENGTH)}`;
  if (!isTicketJob(job)) return task === undefined ? job : `${job}-${task.slug}`;
  const ticket = task?.tickets.find(({ id }) => id === session.ticketId);
  return ticket === undefined ? job : `${job}-${ticket.slug}`;
};
