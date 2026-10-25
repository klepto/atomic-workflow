import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Returns one class string from `inputs`. Conditional and nested values are
 * flattened, and a later Tailwind class wins over an earlier conflicting one.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
