/**
 * Function that makes Claude Code fetch the usage limits of the account once, so that it writes them to the cache in
 * its global config file. It sends no request to a model, and leaves no session behind that another program sees.
 * Resolves once the fetch ended. Rejects when the fetch fails, or when Claude Code did not run it without a model.
 */
export type RefreshUsageFunction = () => Promise<void>;
