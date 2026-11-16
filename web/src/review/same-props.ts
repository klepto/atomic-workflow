/**
 * Returns whether the values `first` and `second` of a prop are the same: the same value, or lists with the same items
 * in the same order.
 */
const sameValue = (first: unknown, second: unknown): boolean =>
  Object.is(first, second) ||
  (Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every((item, index) => Object.is(item, second[index])));

/**
 * Returns whether the props `previous` and `next` of a row are the same: each prop the same value, or a list with the
 * same items in the same order. A row that `memo` compares with it renders again only when what it shows changed,
 * even when its lists are new arrays.
 */
export const sameProps = <Props extends object>(previous: Props, next: Props): boolean => {
  const entries = Object.entries(next);
  return (
    Object.keys(previous).length === entries.length &&
    entries.every(([key, value]) => sameValue(Reflect.get(previous, key), value))
  );
};
