import { socketServeRepository } from './serve-repository.socket.ts';

/**
 * Function that serves as the repository server at `address`, and resolves when the last session server that
 * attached to it leaves. A repository server that no session server attaches to in its first seconds ends as well.
 * If another repository server serves `address` already, rejects.
 */
export type ServeRepositoryFunction = (address: string) => Promise<void>;

/**
 * Default `ServeRepositoryFunction`, which listens on a named pipe or a Unix domain socket.
 */
export const ServeRepository: ServeRepositoryFunction = socketServeRepository;
