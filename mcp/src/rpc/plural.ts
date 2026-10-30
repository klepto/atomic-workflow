/**
 * Returns `one` when `count` is 1, and `many` for every other count, such as `Ticket` or `Tickets` before a list of
 * identifiers.
 */
export const plural = (count: number, one: string, many: string): string => (count === 1 ? one : many);
