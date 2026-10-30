/**
 * Returns the message of the caught value `error`: the message of an `Error`, or else `error` as a string.
 */
export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
