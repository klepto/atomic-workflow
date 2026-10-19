import { gitRepositoryAddress } from './repository-address.git.ts';

/**
 * Function that returns the address of the repository server of the repository that holds `directory`. Every
 * directory of one repository, its worktrees included, gives the same address.
 * If `directory` is not in a repository, rejects.
 */
export type RepositoryAddressFunction = (directory: string) => Promise<string>;

/**
 * Default `RepositoryAddressFunction`, which asks git for the repository.
 */
export const RepositoryAddress: RepositoryAddressFunction = gitRepositoryAddress;
