/**
 * Function that returns the address of the repository server of the repository that holds `directory`. Every
 * directory of one repository, its worktrees included, gives the same address.
 * If `directory` is not in a repository, or git is missing or older than 2.31, which lacks `--path-format`, rejects.
 */
export type RepositoryAddressFunction = (directory: string) => Promise<string>;
