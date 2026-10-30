/**
 * Function that returns the command line that runs the entry point `entryPoint` of the command line tool that waits
 * for the messages of the session `sessionId`, and acknowledges the messages up to the number `after`. Without
 * `after`, the command line acknowledges no message. The command line may name the session by the beginning of its
 * id only.
 */
export type AwaitCommandLineFunction = (entryPoint: string, sessionId: string, after?: number) => string;
