import { z } from 'zod';

/**
 * Schema of a slug: the short name of a task or of a ticket, exactly three lowercase words joined by hyphens.
 */
export const SLUG = z
  .string()
  .max(60)
  .regex(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/, 'Must be three lowercase words joined by hyphens');
