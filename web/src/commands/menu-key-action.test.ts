import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Skill } from '@/api/types.ts';
import { menuKeyAction } from '@/commands/menu-key-action.ts';

/**
 * Skill `plan` of the atomic workflow.
 */
const PLAN: Skill = { name: 'atomic-workflow:plan', description: '' };

/**
 * Skill `plan-goals` of the atomic workflow.
 */
const PLAN_GOALS: Skill = { name: 'atomic-workflow:plan-goals', description: '' };

/**
 * Skill `plan-design` of the atomic workflow.
 */
const PLAN_DESIGN: Skill = { name: 'atomic-workflow:plan-design', description: '' };

/**
 * Skills that the menu offers.
 */
const MATCHES: readonly Skill[] = [PLAN, PLAN_GOALS, PLAN_DESIGN];

describe('menuKeyAction', () => {
  it('moves the highlight down, and wraps from the last skill to the first', () => {
    assert.deepEqual(menuKeyAction('ArrowDown', '/p', MATCHES, 0), { kind: 'highlight', index: 1 });
    assert.deepEqual(menuKeyAction('ArrowDown', '/p', MATCHES, 2), { kind: 'highlight', index: 0 });
  });

  it('moves the highlight up, and wraps from the first skill to the last', () => {
    assert.deepEqual(menuKeyAction('ArrowUp', '/p', MATCHES, 1), { kind: 'highlight', index: 0 });
    assert.deepEqual(menuKeyAction('ArrowUp', '/p', MATCHES, 0), { kind: 'highlight', index: 2 });
  });

  it('picks the highlighted skill on Tab and on Enter', () => {
    assert.deepEqual(menuKeyAction('Tab', '/p', MATCHES, 1), { kind: 'pick', skill: PLAN_GOALS });
    assert.deepEqual(menuKeyAction('Enter', '/p', MATCHES, 1), { kind: 'pick', skill: PLAN_GOALS });
  });

  it('leaves Enter to the box when the text is the highlighted skill already', () => {
    assert.equal(menuKeyAction('Enter', '/plan', MATCHES, 0), undefined);
  });

  it('still picks on Tab when the text is the highlighted skill already', () => {
    assert.deepEqual(menuKeyAction('Tab', '/plan', MATCHES, 0), { kind: 'pick', skill: PLAN });
  });

  it('closes the menu on Escape, with matches or without', () => {
    assert.deepEqual(menuKeyAction('Escape', '/p', MATCHES, 0), { kind: 'dismiss' });
    assert.deepEqual(menuKeyAction('Escape', '/zzz', [], 0), { kind: 'dismiss' });
  });

  it('uses no key but Escape without a match', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Tab']) {
      assert.equal(menuKeyAction(key, '/zzz', [], 0), undefined);
    }
  });

  it('uses no other key', () => {
    assert.equal(menuKeyAction('a', '/p', MATCHES, 0), undefined);
  });
});
