/**
 * Pattern of a notification that Claude Code writes into the transcript as a message of the user when a background
 * task, such as a command or a subagent, ends: tags such as `<task-id>` and `<status>` inside one
 * `<task-notification>` tag.
 */
const TASK_NOTIFICATION = /^<task-notification>[\s\S]*<\/task-notification>$/;

/**
 * Pattern of the summary of a notification, such as `Background command "Build" completed (exit code 0)`. The text of
 * the summary is its first group.
 */
const SUMMARY = /<summary>([\s\S]*?)<\/summary>/;

/**
 * Returns the summary of the notification that the text `text` of the user is, when a background task ended. If the
 * text is no notification, or the notification holds no summary, returns `undefined` instead.
 */
export const parseTaskNotification = (text: string): string | undefined => {
  const trimmed = text.trim();
  if (!TASK_NOTIFICATION.test(trimmed)) {
    return undefined;
  }
  const summary = SUMMARY.exec(trimmed)?.[1]?.trim();
  return summary === '' ? undefined : summary;
};
