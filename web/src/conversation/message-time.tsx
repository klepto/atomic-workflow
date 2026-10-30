import { cn } from '@/lib/utils.ts';
import { formatFullTime, formatMessageTime } from '@/time/time-format.ts';
import { useNow } from '@/time/use-now.ts';

/**
 * Props of `MessageTime`.
 */
interface MessageTimeProps {
  /**
   * Time when the message was written, in ms since the epoch.
   */
  readonly time: number;

  /**
   * Classes added to the element, which win over its own on a conflict.
   */
  readonly className?: string;
}

/**
 * Time when a message was written, as a short muted label in local time. It names the date too when the message is
 * not from the day of the render, and shows the full date and time on hover. It reads the clock at each render, and
 * does not render again as the time passes.
 */
export const MessageTime = ({ time, className }: MessageTimeProps) => {
  const now = useNow(false);
  return (
    <time
      dateTime={new Date(time).toISOString()}
      title={formatFullTime(time)}
      className={cn('whitespace-nowrap text-[0.6875rem] text-muted-foreground tabular-nums leading-4', className)}
    >
      {formatMessageTime(time, now)}
    </time>
  );
};
