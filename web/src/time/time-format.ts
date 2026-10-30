/**
 * Returns whether `left` and `right` fall on the same day of the local calendar.
 */
const sameDay = (left: Date, right: Date): boolean =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

/**
 * Returns the time `time`, in ms since the epoch, as a short label in local time: the hour and the minute alone when it
 * falls on the day of `now`, also in ms since the epoch, and the date before them otherwise. `locales` picks the
 * language of the label, and the language of the browser when it is not provided. If `time` is not a valid time,
 * returns it as a string instead.
 */
export const formatMessageTime = (time: number, now: number, locales?: Intl.LocalesArgument): string => {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return String(time);
  }
  return sameDay(date, new Date(now))
    ? date.toLocaleTimeString(locales, { timeStyle: 'short' })
    : date.toLocaleString(locales, { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * Returns the time `time`, in ms since the epoch, as a long label in local time, with the weekday, the full date and
 * the seconds. `locales` picks the language of the label, and the language of the browser when it is not provided. If
 * `time` is not a valid time, returns it as a string instead.
 */
export const formatFullTime = (time: number, locales?: Intl.LocalesArgument): string => {
  const date = new Date(time);
  return Number.isNaN(date.getTime())
    ? String(time)
    : date.toLocaleString(locales, { dateStyle: 'full', timeStyle: 'medium' });
};
