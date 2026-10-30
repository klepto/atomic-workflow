import { randomUUID } from 'node:crypto';
import type { CreateSessionIdFunction } from './create-session-id.ts';

/**
 * `CreateSessionIdFunction` that returns a random UUID, such as the session ids that agents give their sessions.
 */
export const cryptoCreateSessionId: CreateSessionIdFunction = () => randomUUID();
