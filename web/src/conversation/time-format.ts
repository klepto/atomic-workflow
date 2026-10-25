/**
 * Returns whether `left` and `right` fall on the same day of the local calendar.
 */
const sameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

/**
 * Returns the time `time`, a UTC ISO-8601 string, as a short label in local time: the hour and the minute alone when
 * it falls on the day of `now`, and the date before them otherwise. `locales` picks the language of the label, and the
 * language of the browser when it is not provided. Returns `time` as it is when it is not a valid time.
 */
export const formatMessageTime = (time: string, now: Date, locales?: Intl.LocalesArgument): string => {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) {
    return time;
  }
  return sameDay(date, now)
    ? date.toLocaleTimeString(locales, { timeStyle: 'short' })
    : date.toLocaleString(locales, { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * Returns the time `time`, a UTC ISO-8601 string, as a long label in local time, with the weekday, the full date and
 * the seconds. `locales` picks the language of the label, and the language of the browser when it is not provided.
 * Returns `time` as it is when it is not a valid time.
 */
export const formatFullTime = (time: string, locales?: Intl.LocalesArgument): string => {
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? time : date.toLocaleString(locales, { dateStyle: 'full', timeStyle: 'medium' });
};
