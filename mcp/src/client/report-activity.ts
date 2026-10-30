import { z } from 'zod';
import { sessionActivityReportMethod } from '../rpc/method.session-activity-report.ts';
import { type AttachClientDependencies, attachRunningClient } from './attach-client.ts';

/**
 * Schema of the statuses that a hook reports: `idle` once a turn ended, and `waiting` while the agent is blocked on
 * the user. The transcript of the session shows when the agent works, so no hook reports `working`.
 */
export const HOOK_ACTIVITY_STATUS = z.enum(['idle', 'waiting']);

/**
 * Status that a hook reports, one of `HOOK_ACTIVITY_STATUS`.
 */
type HookActivityStatus = z.infer<typeof HOOK_ACTIVITY_STATUS>;

/**
 * Reports to the repository server of the repository that holds `directory`, with `dependencies`, that the agent of
 * the session `sessionId` has the status `status`. The repository server stamps the report with the time it arrives.
 * Outside of a git repository, or without a running repository server, reports nothing.
 * If the attach or the request fails, rejects.
 */
export const reportActivity = async (
  sessionId: string,
  status: HookActivityStatus,
  directory: string,
  dependencies: AttachClientDependencies,
): Promise<void> => {
  const attachment = await attachRunningClient(directory, dependencies);
  if (attachment === undefined) return;
  const { connection } = attachment;
  try {
    const params: z.input<typeof sessionActivityReportMethod.params> = { sessionId, status };
    await connection.request(sessionActivityReportMethod.name, params);
  } finally {
    connection.close();
  }
};
