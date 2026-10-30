/**
 * Returns the detail of the caught value `error` for a diagnostic: the stack of an `Error`, else its message, or else
 * the value as text.
 *
 * The rule of the entry points: a process that runs long, the session server and the repository server, and the build
 * write the detail of a failure, since a failure there is a defect to find. A command line tool and a hook write only
 * the message, through `errorMessage` of `rpc/error-message.ts`, since the user or the agent reads it.
 */
export const errorDetail = (error: unknown): string =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);
