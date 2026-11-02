import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { suggestionLabel } from '@/prompts/suggestion-label.ts';

describe('suggestionLabel', () => {
  it('names the rule of a suggestion that adds a rule, with its destination', () => {
    const suggestion = {
      type: 'addRules',
      rules: [{ toolName: 'Bash', ruleContent: 'npm test:*' }],
      behavior: 'allow',
      destination: 'localSettings',
    };
    assert.equal(suggestionLabel(suggestion), 'Always allow Bash(npm test:*) in local settings');
  });

  it('names a rule without content by its tool alone', () => {
    const suggestion = {
      type: 'addRules',
      rules: [{ toolName: 'WebSearch' }],
      behavior: 'allow',
      destination: 'session',
    };
    assert.equal(suggestionLabel(suggestion), 'Always allow WebSearch for this session');
  });

  it('names every rule of a suggestion, separated by commas', () => {
    const suggestion = {
      type: 'addRules',
      rules: [{ toolName: 'Read', ruleContent: '//c/repo/**' }, { toolName: 'Edit' }],
      behavior: 'allow',
      destination: 'projectSettings',
    };
    assert.equal(suggestionLabel(suggestion), 'Always allow Read(//c/repo/**), Edit in project settings');
  });

  it('names the mode of a suggestion that switches the mode', () => {
    const suggestion = { type: 'setMode', mode: 'acceptEdits', destination: 'session' };
    assert.equal(suggestionLabel(suggestion), 'Switch to the mode acceptEdits for this session');
  });

  it('names the directories of a suggestion that adds directories', () => {
    const suggestion = { type: 'addDirectories', directories: ['C:/data', 'C:/logs'], destination: 'userSettings' };
    assert.equal(suggestionLabel(suggestion), 'Always allow access to C:/data, C:/logs in user settings');
  });

  it('names a destination that it does not know by its name', () => {
    const suggestion = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow', destination: 'policy' };
    assert.equal(suggestionLabel(suggestion), 'Always allow Bash in policy');
  });

  it('leaves out the destination of a suggestion without one', () => {
    const suggestion = { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'allow' };
    assert.equal(suggestionLabel(suggestion), 'Always allow Bash');
  });

  it('shows a suggestion of a type that it does not know as JSON', () => {
    assert.equal(suggestionLabel({ type: 'grantAll', scope: 1 }), 'Always allow: {"type":"grantAll","scope":1}');
  });
});
