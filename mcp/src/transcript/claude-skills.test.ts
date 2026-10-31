import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSkillListing } from './claude-skills.ts';

/**
 * Returns an entry of a Claude Code transcript that lists the skills `names` with the text `content`, and the fields
 * of `attachment` on its attachment and of `fields` on the entry.
 */
const listing = (names: readonly string[], content: string, attachment: object = {}, fields: object = {}): object => ({
  type: 'attachment',
  attachment: { type: 'skill_listing', content, names, ...attachment },
  ...fields,
});

/**
 * Returns the list that `parseSkillListing` finds in the line of the entry `value`, with `sidechain`.
 */
const listingOf = (value: object, sidechain = false): ReturnType<typeof parseSkillListing> =>
  parseSkillListing(JSON.stringify(value), value, sidechain);

describe('parseSkillListing', () => {
  it('returns each skill of the list with its description, in the order of the names', () => {
    const value = listing(['plan', 'implement'], '- implement: Implements a ticket.\n- plan: Plans a task.', {
      isInitial: true,
    });
    assert.deepEqual(listingOf(value), {
      initial: true,
      skills: [
        { name: 'plan', description: 'Plans a task.' },
        { name: 'implement', description: 'Implements a ticket.' },
      ],
    });
  });

  it('returns a list that is not initial without isInitial', () => {
    assert.equal(listingOf(listing(['plan'], '- plan: Plans a task.'))?.initial, false);
  });

  it('continues a description over the lines that start no skill', () => {
    const value = listing(['plan'], '- plan: Plans a task.\nUse it first.');
    assert.deepEqual(listingOf(value)?.skills, [{ name: 'plan', description: 'Plans a task.\nUse it first.' }]);
  });

  it('takes the longest name that starts a line, for a name with a colon', () => {
    const value = listing(['atomic', 'atomic:plan'], '- atomic: Activates.\n- atomic:plan: Plans a task.');
    assert.deepEqual(listingOf(value)?.skills, [
      { name: 'atomic', description: 'Activates.' },
      { name: 'atomic:plan', description: 'Plans a task.' },
    ]);
  });

  it('gives a skill that the text does not describe an empty description', () => {
    assert.deepEqual(listingOf(listing(['plan'], ''))?.skills, [{ name: 'plan', description: '' }]);
  });

  it('counts the entries of a subagent with sidechain only', () => {
    const value = listing(['plan'], '- plan: Plans a task.', {}, { isSidechain: true });
    assert.equal(listingOf(value, false), undefined);
    assert.equal(listingOf(value, true)?.skills.length, 1);
  });

  it('returns undefined for another attachment, and for a value that is no list', () => {
    const value = { type: 'attachment', attachment: { type: 'file', content: 'skill_listing', names: [] } };
    assert.equal(listingOf(value), undefined);
    assert.equal(parseSkillListing('{"type":"skill_listing"', undefined, false), undefined);
  });
});
