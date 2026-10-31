import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { applyStoredTheme, getTheme, setTheme, subscribeTheme, THEMES } from '@/theme/theme.ts';

/**
 * Key of the local storage that holds the theme that the user picked.
 */
const KEY = 'atomic-workflow.theme';

/**
 * Part of the local storage of a browser that the app uses, kept in memory, or refused as a full or blocked store.
 */
interface FakeStorage {
  /**
   * Strings that the store holds by their keys.
   */
  readonly items: Map<string, string>;

  /**
   * Returns the string at `key`, or `null` for none.
   */
  getItem(key: string): string | null;

  /**
   * Keeps `value` at `key`.
   */
  setItem(key: string, value: string): void;

  /**
   * Removes the string at `key`.
   */
  removeItem(key: string): void;
}

/**
 * Root element of the page, with the parts that the theme sets.
 */
interface FakeRoot {
  /**
   * Data attributes of the element.
   */
  readonly dataset: Record<string, string | undefined>;

  /**
   * Classes of the element.
   */
  readonly classes: Set<string>;

  /**
   * Class list of the element, which adds to `classes`.
   */
  readonly classList: { add(name: string): void };
}

/**
 * Returns a local storage that holds `items`, which throws on each call when `refused` is true.
 */
const fakeStorage = (items: Readonly<Record<string, string>>, refused = false): FakeStorage => {
  const store = new Map(Object.entries(items));
  const check = (): void => {
    if (refused) throw new Error('The storage is refused');
  };
  return {
    items: store,
    getItem: (key) => {
      check();
      return store.get(key) ?? null;
    },
    setItem: (key, value) => {
      check();
      store.set(key, value);
    },
    removeItem: (key) => {
      check();
      store.delete(key);
    },
  };
};

/**
 * Returns a root element without a theme and without classes.
 */
const fakeRoot = (): FakeRoot => {
  const classes = new Set<string>();
  return { dataset: {}, classes, classList: { add: (name) => classes.add(name) } };
};

/**
 * Root element of the page of the current test.
 */
let root = fakeRoot();

/**
 * Installs the local storage `storage` and a new root element as the ones of the page.
 */
const installPage = (storage: FakeStorage): void => {
  root = fakeRoot();
  Object.defineProperty(globalThis, 'window', { value: { localStorage: storage }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', {
    value: { documentElement: root },
    configurable: true,
    writable: true,
  });
};

beforeEach(() => {
  installPage(fakeStorage({}));
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
});

describe('THEMES', () => {
  it('lists the default theme first', () => {
    assert.deepEqual(
      THEMES.map(({ name }) => name),
      ['zen', 'claude'],
    );
  });
});

describe('applyStoredTheme', () => {
  it('shows the dark variant of the theme that the user picked', () => {
    installPage(fakeStorage({ [KEY]: 'claude' }));
    applyStoredTheme();
    assert.equal(root.dataset.theme, 'claude');
    assert.deepEqual([...root.classes], ['dark']);
  });

  it('shows the default theme while the user picked none', () => {
    applyStoredTheme();
    assert.equal(root.dataset.theme, 'zen');
  });

  it('shows the default theme for a stored value that names no theme', () => {
    installPage(fakeStorage({ [KEY]: 'neon' }));
    applyStoredTheme();
    assert.equal(root.dataset.theme, 'zen');
  });

  it('shows the default theme when the browser refuses the store', () => {
    installPage(fakeStorage({ [KEY]: 'claude' }, true));
    applyStoredTheme();
    assert.equal(root.dataset.theme, 'zen');
  });
});

describe('getTheme', () => {
  it('returns the theme that the page shows', () => {
    root.dataset.theme = 'claude';
    assert.equal(getTheme(), 'claude');
  });

  it('returns the default theme while the page shows none or an unknown one', () => {
    assert.equal(getTheme(), 'zen');
    root.dataset.theme = 'neon';
    assert.equal(getTheme(), 'zen');
  });
});

describe('setTheme', () => {
  it('shows the theme and keeps it for the next visits', () => {
    const storage = fakeStorage({});
    installPage(storage);
    setTheme('claude');
    assert.equal(getTheme(), 'claude');
    assert.equal(storage.items.get(KEY), 'claude');
  });

  it('still shows the theme when the browser refuses the store', () => {
    installPage(fakeStorage({}, true));
    setTheme('claude');
    assert.equal(getTheme(), 'claude');
  });
});

describe('subscribeTheme', () => {
  it('calls the listener on each change of the theme', () => {
    const seen: string[] = [];
    const stop = subscribeTheme(() => seen.push(getTheme()));
    setTheme('claude');
    setTheme('zen');
    stop();
    assert.deepEqual(seen, ['claude', 'zen']);
  });

  it('calls the listener no more once it stopped', () => {
    let calls = 0;
    const stop = subscribeTheme(() => {
      calls += 1;
    });
    stop();
    setTheme('claude');
    assert.equal(calls, 0);
  });
});
