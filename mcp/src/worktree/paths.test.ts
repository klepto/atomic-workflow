import assert from 'node:assert/strict';
import { posix, win32 } from 'node:path';
import { describe, it } from 'node:test';
import { comparablePath, forwardSlashes, isBelow, platformPaths, relativeInside, samePath } from './paths.ts';

describe('forwardSlashes', () => {
  it('replaces every backslash with a forward slash', () => {
    assert.equal(forwardSlashes('C:\\work\\repository/main'), 'C:/work/repository/main');
  });
});

describe('comparablePath', () => {
  it('resolves the path and lowers its case on win32', () => {
    assert.equal(comparablePath('C:/Work/Repository/../Main', 'win32'), 'c:\\work\\main');
  });

  it('keeps the case of the path on another platform', () => {
    assert.equal(comparablePath('/Work/Repository/../Main', 'linux'), '/Work/Main');
  });
});

describe('samePath', () => {
  it('matches two spellings of one path on win32 that differ in their separators and their case', () => {
    assert.equal(samePath('C:\\Work\\Main', 'c:/work/main/', 'win32'), true);
  });

  it('tells apart two paths that differ only in their case on another platform', () => {
    assert.equal(samePath('/work/Main', '/work/main', 'linux'), false);
  });
});

describe('isBelow', () => {
  it('accepts the directory itself and a path below it', () => {
    assert.equal(isBelow('/work', '/work', 'linux'), true);
    assert.equal(isBelow('/work', '/work/task/main', 'linux'), true);
  });

  it('rejects a sibling whose name starts with the name of the directory', () => {
    assert.equal(isBelow('/work', '/workspace', 'linux'), false);
  });

  it('ignores the case of the paths on win32', () => {
    assert.equal(isBelow('C:\\Work', 'c:/work/task', 'win32'), true);
  });
});

describe('relativeInside', () => {
  it('returns the path relative to the directory, and an empty string for the directory itself', () => {
    assert.equal(relativeInside('/work', '/work/task/main', 'linux'), 'task/main');
    assert.equal(relativeInside('/work', '/work', 'linux'), '');
  });

  it('returns undefined for a path outside the directory', () => {
    assert.equal(relativeInside('/work', '/other', 'linux'), undefined);
    assert.equal(relativeInside('C:\\work', 'D:\\work', 'win32'), undefined);
  });
});

describe('platformPaths', () => {
  it('returns the path functions of Windows for win32, else the ones of POSIX', () => {
    assert.equal(platformPaths('win32'), win32);
    assert.equal(platformPaths('linux'), posix);
    assert.equal(platformPaths('darwin'), posix);
  });
});
