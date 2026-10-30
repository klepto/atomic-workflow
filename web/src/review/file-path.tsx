import { cn } from '@/lib/utils.ts';

/**
 * Props of `FilePath`.
 */
interface FilePathProps {
  /**
   * Path of the file.
   */
  readonly path: string;

  /**
   * Whether the path shows in full as its native tooltip too. Any value but `false` shows it.
   */
  readonly titled?: boolean;

  /**
   * Classes of the path, beside its own.
   */
  readonly className?: string;
}

/**
 * Path `path` with its directory muted and its name in full color, so the name stands out. While `titled` is not
 * `false`, the path shows in full as its native tooltip too, for a path that does not fit.
 */
export const FilePath = ({ path, titled, className }: FilePathProps) => {
  const slash = path.lastIndexOf('/');
  return (
    <span className={cn('min-w-0 truncate font-mono', className)} title={titled === false ? undefined : path}>
      <span className="text-muted-foreground">{path.slice(0, slash + 1)}</span>
      <span className="font-medium">{path.slice(slash + 1)}</span>
    </span>
  );
};
