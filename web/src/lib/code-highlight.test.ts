import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { highlighterOf, languageOfFence, languageOfPath, tokenStyle } from '@/lib/code-highlight.ts';

describe('languageOfPath', () => {
  it('finds the language of a file by its extension, in any case', () => {
    assert.equal(languageOfPath('web/src/app.TS'), languageOfPath('main.ts'));
    assert.notEqual(languageOfPath('main.ts'), undefined);
  });

  it('finds the language of a file without an extension by its whole name', () => {
    assert.notEqual(languageOfPath('docker/Dockerfile'), undefined);
    assert.notEqual(languageOfPath('Makefile'), undefined);
  });

  it('returns undefined for a file of a language without colors', () => {
    assert.equal(languageOfPath('image.png'), undefined);
    assert.equal(languageOfPath('LICENSE'), undefined);
  });

  it('reads the extension of the file name, not of a directory', () => {
    assert.equal(languageOfPath('config.ts/LICENSE'), undefined);
  });
});

describe('languageOfFence', () => {
  it('finds the language of a fence by its extension or by its name, in any case', () => {
    assert.equal(languageOfFence('ts'), languageOfPath('main.ts'));
    assert.equal(languageOfFence('TypeScript'), languageOfPath('main.ts'));
    assert.equal(languageOfFence('console'), languageOfPath('run.sh'));
  });

  it('returns undefined for a language without colors', () => {
    assert.equal(languageOfFence('brainfuck'), undefined);
    assert.equal(languageOfFence(''), undefined);
  });
});

describe('tokenStyle', () => {
  it('gives a token its color and no font style without one', () => {
    assert.deepEqual(tokenStyle({ content: 'a', offset: 0, color: '#fff' }), {
      color: '#fff',
      fontStyle: undefined,
      fontWeight: undefined,
      textDecoration: undefined,
    });
  });

  it('reads italic, bold and underline from the bits of the font style', () => {
    const none = { color: undefined, fontStyle: undefined, fontWeight: undefined, textDecoration: undefined };
    assert.deepEqual(tokenStyle({ content: 'a', offset: 0, fontStyle: 1 }), { ...none, fontStyle: 'italic' });
    assert.deepEqual(tokenStyle({ content: 'a', offset: 0, fontStyle: 2 }), { ...none, fontWeight: 'bold' });
    assert.deepEqual(tokenStyle({ content: 'a', offset: 0, fontStyle: 4 }), { ...none, textDecoration: 'underline' });
  });
});

describe('highlighterOf', () => {
  it('colors each line of the code in the language of the loader', async () => {
    const loader = languageOfFence('json');
    assert.notEqual(loader, undefined);
    if (loader === undefined) return;
    const highlighter = await highlighterOf(loader);
    const lines = highlighter.tokenize('{\n  "a": 1\n}');
    assert.equal(lines.length, 3);
    assert.equal(lines.map((tokens) => tokens.map(({ content }) => content).join('')).join('\n'), '{\n  "a": 1\n}');
    assert.equal(
      lines.flat().every(({ color }) => color !== undefined),
      true,
    );
  });
});
