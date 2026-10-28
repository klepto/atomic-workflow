/**
 * Pattern of a notification that Claude Code writes into the transcript as a message of the user when a background
 * task, such as a command or a subagent, ends: tags such as `<task-id>` and `<status>` inside one
 * `<task-notification>` tag.
 */
const TASK_NOTIFICATION = /^<task-notification>[\s\S]*<\/task-notification>$/;

/**
 * Returns whether the text `text` of the user is the notification that a background task ended.
 */
export const isTaskNotification = (text: string): boolean => TASK_NOTIFICATION.test(text.trim());
