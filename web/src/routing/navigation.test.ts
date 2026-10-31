import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { currentPath, navigate, subscribePath } from '@/routing/navigation.ts';

/**
 * Part of the window of a browser that `navigation.ts` uses, with a history in memory.
 */
interface FakeWindow {
  /**
   * Location of the current history entry.
   */
  readonly location: { readonly pathname: string };

  /**
   * History of the window.
   */
  readonly history: {
    pushState(state: unknown, unused: string, url: string): void;
    replaceState(state: unknown, unused: string, url: string): void;
  };

  /**
   * Paths of the history entries, oldest first.
   */
  readonly entries: string[];

  /**
   * Adds `listener` to the listeners of the event `type`.
   */
  addEventListener(type: string, listener: () => void): void;

  /**
   * Removes `listener` from the listeners of the event `type`.
   */
  removeEventListener(type: string, listener: () => void): void;

  /**
   * Moves back one history entry, as the back button does, and fires `popstate`.
   */
  back(): void;
}

/**
 * Returns a window whose history holds one entry at `path`.
 */
const fakeWindow = (path: string): FakeWindow => {
  const entries = [path];
  let index = 0;
  const popListeners = new Set<() => void>();
  return {
    location: {
      get pathname() {
        return entries[index] ?? '/';
      },
    },
    history: {
      pushState: (_state, _unused, url) => {
        entries.splice(index + 1, entries.length, url);
        index += 1;
      },
      replaceState: (_state, _unused, url) => {
        entries[index] = url;
      },
    },
    entries,
    addEventListener: (type, listener) => {
      if (type === 'popstate') popListeners.add(listener);
    },
    removeEventListener: (type, listener) => {
      if (type === 'popstate') popListeners.delete(listener);
    },
    back: () => {
      index = Math.max(0, index - 1);
      for (const listener of popListeners) {
        listener();
      }
    },
  };
};

/**
 * Window of the current test, which each test starts afresh at `/`.
 */
let browser = fakeWindow('/');

beforeEach(() => {
  browser = fakeWindow('/');
  Object.defineProperty(globalThis, 'window', { value: browser, configurable: true, writable: true });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

describe('currentPath', () => {
  it('returns the path of the current URL', () => {
    navigate('/task/3');
    assert.equal(currentPath(), '/task/3');
  });
});

describe('navigate', () => {
  it('pushes a history entry for a new path', () => {
    navigate('/task/3');
    assert.deepEqual(browser.entries, ['/', '/task/3']);
  });

  it('replaces the current history entry with the option replace', () => {
    navigate('/task/3', { replace: true });
    assert.deepEqual(browser.entries, ['/task/3']);
  });

  it('replaces the current history entry for a move to the current path', () => {
    navigate('/task/3');
    navigate('/task/3');
    assert.deepEqual(browser.entries, ['/', '/task/3']);
  });
});

describe('subscribePath', () => {
  it('calls the listener on each move by navigate', () => {
    let calls = 0;
    const stop = subscribePath(() => {
      calls += 1;
    });
    navigate('/task/3');
    navigate('/task/3', { replace: true });
    stop();
    assert.equal(calls, 2);
  });

  it('calls the listener on a move back in the browser', () => {
    const paths: string[] = [];
    navigate('/task/3');
    const stop = subscribePath(() => paths.push(currentPath()));
    browser.back();
    stop();
    assert.deepEqual(paths, ['/']);
  });

  it('calls the listener no more once it stopped', () => {
    let calls = 0;
    const stop = subscribePath(() => {
      calls += 1;
    });
    stop();
    navigate('/task/3');
    browser.back();
    assert.equal(calls, 0);
  });
});
