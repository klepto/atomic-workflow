/**
 * Prefix of the identifier of every Claude model.
 */
const CLAUDE_PREFIX = 'claude-';

/**
 * Part of a model identifier that is a release date, such as `20250929`.
 */
const DATE_PART = /^\d{8}$/;

/**
 * Part of a model identifier that is a number of its version, such as `5`.
 */
const VERSION_PART = /^\d{1,2}$/;

/**
 * Returns the model identifier `model` in short: the family with a capital letter, then the version with its numbers
 * joined by dots, such as `Opus 5.5` for `claude-opus-5-5` and `Sonnet 3.5` for `claude-3-5-sonnet-20241022`. A
 * release date in the identifier is left out. If `model` is no Claude model identifier with one family and a version,
 * returns `model` as is instead.
 */
export const formatModel = (model: string): string => {
  if (!model.startsWith(CLAUDE_PREFIX)) {
    return model;
  }
  const parts = model
    .slice(CLAUDE_PREFIX.length)
    .split('-')
    .filter((part) => !DATE_PART.test(part));
  const version = parts.filter((part) => VERSION_PART.test(part));
  const [name, ...others] = parts.filter((part) => !VERSION_PART.test(part));
  if (name === undefined || others.length > 0 || version.length === 0) {
    return model;
  }
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${version.join('.')}`;
};
