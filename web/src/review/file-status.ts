import { Copy, FileDiff as FileDiffIcon, FileMinus, FilePlus, FileSymlink, type LucideIcon } from 'lucide-react';
import type { FileStatus } from '@/review/patch.ts';

/**
 * Icon and words that show a status of a file.
 */
interface FileStatusLook {
  /**
   * Icon of the status.
   */
  readonly icon: LucideIcon;

  /**
   * Word that names the status, such as `Added`.
   */
  readonly words: string;
}

/**
 * Icon and words of each status of a file.
 */
export const FILE_STATUSES: Readonly<Record<FileStatus, FileStatusLook>> = {
  added: { icon: FilePlus, words: 'Added' },
  deleted: { icon: FileMinus, words: 'Deleted' },
  modified: { icon: FileDiffIcon, words: 'Modified' },
  renamed: { icon: FileSymlink, words: 'Renamed' },
  copied: { icon: Copy, words: 'Copied' },
};
