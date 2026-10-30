/**
 * Function that returns a new session id for a subagent that the repository server registers, unique among every
 * session id.
 */
export type CreateSessionIdFunction = () => string;
