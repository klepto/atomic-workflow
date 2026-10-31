import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Skill } from '@/api/types.ts';
import {
  bestMatchIndex,
  commandOf,
  expandCommand,
  groupOf,
  insertSkill,
  isSlashWord,
  matchSkills,
  SKILL_GROUPS,
  skillOf,
  skillOptionId,
  workflowSkills,
} from '@/commands/skill-commands.ts';

/**
 * Returns the skill with the name `name`.
 */
const skill = (name: string): Skill => ({ name, description: '' });

/**
 * Returns the names of the skills `skills`.
 */
const namesOf = (skills: readonly Skill[]): readonly string[] => skills.map(({ name }) => name);

/**
 * Skills of a session, the helper skills before the main skills and the main skills out of the order of their steps.
 */
const SKILLS: readonly Skill[] = [
  skill('atomic-workflow:tasks'),
  skill('atomic-workflow:approve'),
  skill('atomic-workflow:plan-goals'),
  skill('atomic-workflow:implement'),
  skill('atomic-workflow:plan'),
  skill('atomic-workflow:implement-all'),
];

describe('SKILL_GROUPS', () => {
  it('shows the main skills before the helper skills', () => {
    assert.deepEqual(SKILL_GROUPS, ['main', 'helper']);
  });
});

describe('workflowSkills', () => {
  it('keeps only the skills of the atomic workflow, in their order', () => {
    const skills = [
      skill('atomic-workflow:plan'),
      skill('other:plan'),
      skill('review'),
      skill('atomic-workflow:tasks'),
    ];
    assert.deepEqual(namesOf(workflowSkills(skills)), ['atomic-workflow:plan', 'atomic-workflow:tasks']);
  });
});

describe('commandOf', () => {
  it('drops the prefix of the atomic workflow', () => {
    assert.equal(commandOf(skill('atomic-workflow:plan')), 'plan');
  });

  it('keeps the name of another skill as it is', () => {
    assert.equal(commandOf(skill('other:plan')), 'other:plan');
  });
});

describe('isSlashWord', () => {
  it('returns true for a slash alone or a slash and a word', () => {
    assert.equal(isSlashWord('/'), true);
    assert.equal(isSlashWord('/plan'), true);
  });

  it('returns false for a text with whitespace or without a leading slash', () => {
    assert.equal(isSlashWord('/plan 3'), false);
    assert.equal(isSlashWord(' /plan'), false);
    assert.equal(isSlashWord('plan'), false);
    assert.equal(isSlashWord(''), false);
  });
});

describe('groupOf', () => {
  it('puts plan, implement and approve in the main group', () => {
    for (const name of ['atomic-workflow:plan', 'atomic-workflow:implement', 'atomic-workflow:approve']) {
      assert.equal(groupOf(skill(name)), 'main');
    }
  });

  it('puts every other skill in the helper group', () => {
    assert.equal(groupOf(skill('atomic-workflow:plan-goals')), 'helper');
    assert.equal(groupOf(skill('other:plan')), 'helper');
  });
});

describe('matchSkills', () => {
  it('matches every skill for a slash alone, the main skills first in the order of their steps', () => {
    assert.deepEqual(namesOf(matchSkills('/', SKILLS)), [
      'atomic-workflow:plan',
      'atomic-workflow:implement',
      'atomic-workflow:approve',
      'atomic-workflow:tasks',
      'atomic-workflow:plan-goals',
      'atomic-workflow:implement-all',
    ]);
  });

  it('ranks the commands that start with the letters before the ones that hold them, within each group', () => {
    const skills = [
      skill('atomic-workflow:tasks-delete'),
      skill('atomic-workflow:delete-all'),
      skill('atomic-workflow:approve'),
    ];
    assert.deepEqual(namesOf(matchSkills('/del', skills)), [
      'atomic-workflow:delete-all',
      'atomic-workflow:tasks-delete',
    ]);
  });

  it('matches the letters in any case', () => {
    assert.deepEqual(namesOf(matchSkills('/IMPL', SKILLS)), [
      'atomic-workflow:implement',
      'atomic-workflow:implement-all',
    ]);
  });

  it('returns no skill when no command holds the letters', () => {
    assert.deepEqual(matchSkills('/zzz', SKILLS), []);
  });

  it('returns no skill for a text that is not a slash and a word', () => {
    assert.deepEqual(matchSkills('/plan 3', SKILLS), []);
    assert.deepEqual(matchSkills('plan', SKILLS), []);
  });
});

describe('bestMatchIndex', () => {
  it('returns the index of the first skill whose command starts with the letters', () => {
    const matches = [skill('atomic-workflow:tasks-delete'), skill('atomic-workflow:delete-all')];
    assert.equal(bestMatchIndex('/DEL', matches), 1);
  });

  it('returns 0 when no command starts with the letters', () => {
    assert.equal(bestMatchIndex('/all', [skill('atomic-workflow:plan'), skill('atomic-workflow:implement-all')]), 0);
  });
});

describe('skillOf', () => {
  it('finds the skill of the command at the start of the text', () => {
    assert.equal(skillOf('/plan 3', SKILLS)?.name, 'atomic-workflow:plan');
    assert.equal(skillOf('  /plan', SKILLS)?.name, 'atomic-workflow:plan');
  });

  it('finds the skill by its whole name', () => {
    assert.equal(skillOf('/atomic-workflow:implement 9', SKILLS)?.name, 'atomic-workflow:implement');
  });

  it('matches the exact command only', () => {
    assert.equal(skillOf('/pla 3', SKILLS), undefined);
    assert.equal(skillOf('/plan-goals', SKILLS)?.name, 'atomic-workflow:plan-goals');
  });

  it('returns undefined for a text that runs no skill', () => {
    assert.equal(skillOf('/compact', SKILLS), undefined);
    assert.equal(skillOf('plan 3', SKILLS), undefined);
  });
});

describe('expandCommand', () => {
  it('puts the whole name of the skill in place of its command', () => {
    assert.equal(expandCommand('/plan 3', skill('atomic-workflow:plan')), '/atomic-workflow:plan 3');
  });

  it('drops the whitespace before the slash', () => {
    assert.equal(expandCommand('  /plan', skill('atomic-workflow:plan')), '/atomic-workflow:plan');
  });
});

describe('insertSkill', () => {
  it('returns the slash, the command and a space', () => {
    assert.equal(insertSkill(skill('atomic-workflow:plan')), '/plan ');
  });
});

describe('skillOptionId', () => {
  it('joins the id of the menu and the name of the skill with a hyphen', () => {
    assert.equal(skillOptionId('menu', skill('atomic-workflow:plan')), 'menu-atomic-workflow:plan');
  });
});
