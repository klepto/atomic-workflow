import type { NewCommentIdFunction } from '@/review/comment-id.ts';

/**
 * `NewCommentIdFunction` that returns a random UUID of the Web Crypto API.
 */
export const cryptoNewCommentId: NewCommentIdFunction = () => crypto.randomUUID();
