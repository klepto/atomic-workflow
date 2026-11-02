import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bundledLanguagesInfo } from 'shiki/langs';
import { highlighterOf, languageOfFence, languageOfPath, tokenStyle } from '@/lib/code-highlight.ts';

/**
 * GDScript code with a comment line and the keyword `func`.
 */
const GDSCRIPT_SAMPLE = [
  'extends Node2D',
  '',
  '# Speed in pixels per second.',
  '@export var speed: float = 200.0',
  '',
  'func _process(delta: float) -> void:',
  '    position.x += speed * delta',
].join('\n');

describe('languageOfPath', () => {
  it('finds the language of a file by its extension, in any case', () => {
    assert.equal(languageOfPath('web/src/app.TS'), languageOfPath('main.ts'));
    assert.notEqual(languageOfPath('main.ts'), undefined);
  });

  it('finds the language of a file without an extension by its whole name', () => {
    assert.notEqual(languageOfPath('docker/Dockerfile'), undefined);
    assert.notEqual(languageOfPath('Makefile'), undefined);
  });

  it('finds a language of the index of Shiki by its identifier or an alias as the extension', () => {
    assert.notEqual(languageOfPath('scripts/player.gd'), undefined);
    assert.equal(languageOfPath('Player.GD'), languageOfPath('scripts/player.gd'));
    assert.notEqual(languageOfPath('main.zig'), undefined);
    assert.notEqual(languageOfPath('Main.hs'), undefined);
    assert.equal(languageOfPath('main.zig'), languageOfFence('zig'));
    assert.equal(languageOfPath('Main.hs'), languageOfFence('haskell'));
  });

  it('keeps the language of each extension that Shiki names no alias for', () => {
    assert.equal(languageOfPath('index.htm'), languageOfFence('html'));
    assert.equal(languageOfPath('icon.svg'), languageOfFence('xml'));
    assert.equal(languageOfPath('main.h'), languageOfFence('c'));
    assert.equal(languageOfPath('module.psm1'), languageOfFence('powershell'));
    assert.equal(languageOfPath('build.gradle'), languageOfFence('groovy'));
    assert.equal(languageOfPath('vector.hpp'), languageOfFence('cpp'));
    assert.notEqual(languageOfFence('cpp'), undefined);
  });

  it('keeps the language of a file without an extension', () => {
    assert.equal(languageOfPath('docker/Dockerfile'), languageOfFence('docker'));
    assert.equal(languageOfPath('Makefile'), languageOfFence('make'));
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

  it('finds GDScript by its name or its extension, in any case', () => {
    const gdscript = languageOfPath('player.gd');
    assert.notEqual(gdscript, undefined);
    assert.equal(languageOfFence('gdscript'), gdscript);
    assert.equal(languageOfFence('GDScript'), gdscript);
    assert.equal(languageOfFence('gd'), gdscript);
  });

  it('finds each language of the index of Shiki by its identifier and each alias', () => {
    for (const language of bundledLanguagesInfo) {
      assert.equal(languageOfFence(language.id), language.import, language.id);
      assert.equal(languageOfFence(language.id.toUpperCase()), language.import, language.id);
      for (const alias of language.aliases ?? []) {
        // The app names Shell by `console`, where Shiki names the shell session.
        if (alias !== 'console') assert.equal(languageOfFence(alias), language.import, alias);
      }
    }
  });

  it('keeps the language of each name that Shiki names no alias for, or another language', () => {
    assert.equal(languageOfFence('console'), languageOfPath('run.sh'));
    assert.equal(languageOfFence('shell'), languageOfPath('run.sh'));
    assert.equal(languageOfFence('golang'), languageOfPath('main.go'));
    assert.equal(languageOfFence('patch'), languageOfPath('change.diff'));
    assert.equal(languageOfFence('htm'), languageOfPath('index.html'));
    assert.notEqual(languageOfPath('main.go'), undefined);
    assert.notEqual(languageOfPath('change.diff'), undefined);
  });

  it('returns undefined for a language without colors', () => {
    assert.equal(languageOfFence('brainfuck'), undefined);
    assert.equal(languageOfFence(''), undefined);
  });

  it('returns undefined for a name of a property of an object', () => {
    assert.equal(languageOfFence('constructor'), undefined);
    assert.equal(languageOfFence('__proto__'), undefined);
    assert.equal(languageOfPath('main.toString'), undefined);
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

  it('colors the comments of GDScript apart from its keywords', async () => {
    const loader = languageOfPath('player.gd');
    assert.notEqual(loader, undefined);
    if (loader === undefined) return;
    const highlighter = await highlighterOf(loader);
    const lines = highlighter.tokenize(GDSCRIPT_SAMPLE);
    const colors = new Set(lines.flat().map(({ color }) => color));
    assert.equal(colors.size >= 2, true);
    const comment = lines[2]?.find(({ content }) => content.includes('Speed'));
    const keyword = lines[5]?.find(({ content }) => content.trim() === 'func');
    assert.notEqual(comment?.color, undefined);
    assert.notEqual(keyword?.color, undefined);
    assert.notEqual(comment?.color, keyword?.color);
  });
});
