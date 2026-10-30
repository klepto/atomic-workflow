/**
 * Returns the number `count` with the word `one` or `many` after it, such as `1 comment` or `3 comments`.
 */
export const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
