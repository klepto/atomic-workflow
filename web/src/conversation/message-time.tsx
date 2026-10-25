import { cn } from '@/lib/utils.ts';
import { formatFullTime, formatMessageTime } from './time-format.ts';

/**
 * Props of the time of a message.
 */
interface MessageTimeProps {
  /**
   * The time the message was written, as a UTC ISO-8601 string.
   */
  time: string;

  /**
   * Classes added to the element, which win over its own on a conflict.
   */
  className?: string;
}

/**
 * The time a message was written, as a short muted label in local time. It names the date too when the message is
 * not from today, and shows the full date and time on hover.
 */
export const MessageTime = ({ time, className }: MessageTimeProps) => (
  <time
    dateTime={time}
    title={formatFullTime(time)}
    className={cn('whitespace-nowrap text-[0.6875rem] text-muted-foreground tabular-nums leading-4', className)}
  >
    {formatMessageTime(time, new Date())}
  </time>
);
