import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withoutWorkflowQuotes } from '@/conversation/workflow-quote.ts';

describe('withoutWorkflowQuotes', () => {
  it('keeps a text without marked quotes as it is', () => {
    const text = '  Plain reply\n\nwith two paragraphs\n';
    assert.equal(withoutWorkflowQuotes(text), text);
  });

  it('removes a marked quote at the start with the blank lines after it', () => {
    const text = 'atomic-workflow:\n> Message of the user\n> on two lines\n\nThe reply';
    assert.equal(withoutWorkflowQuotes(text), 'The reply');
  });

  it('removes several marked quotes at the start', () => {
    const text = 'atomic-workflow:\n> first\n\natomic-workflow:\n> second\n\nThe reply';
    assert.equal(withoutWorkflowQuotes(text), 'The reply');
  });

  it('removes a marked quote at the end with the blank lines before it', () => {
    const text = 'The reply\n\natomic-workflow:\n> done';
    assert.equal(withoutWorkflowQuotes(text), 'The reply');
  });

  it('removes marked quotes at both ends and keeps the text between them', () => {
    const text =
      'atomic-workflow:\n> prompt\n\nFirst line\n> a quote of the agent\nLast line\n\natomic-workflow:\n> done';
    assert.equal(withoutWorkflowQuotes(text), 'First line\n> a quote of the agent\nLast line');
  });

  it('turns a text that holds only marked quotes into an empty text', () => {
    assert.equal(withoutWorkflowQuotes('atomic-workflow:\n> first\n\natomic-workflow:\n> second'), '');
  });

  it('keeps a quote without the mark', () => {
    const text = '> A quote of the agent\n\nThe reply';
    assert.equal(withoutWorkflowQuotes(text), text);
  });

  it('keeps a marked quote in the middle of the text', () => {
    const text = 'Before\natomic-workflow:\n> middle\nAfter';
    assert.equal(withoutWorkflowQuotes(text), text);
  });

  it('keeps a mark at the end without a quote after it', () => {
    const text = 'The reply\natomic-workflow:';
    assert.equal(withoutWorkflowQuotes(text), text);
  });

  it('reads the lines of a text with Windows line breaks', () => {
    assert.equal(withoutWorkflowQuotes('atomic-workflow:\r\n> prompt\r\n\r\nThe reply'), 'The reply');
  });

  it('reads a mark and quote lines with whitespace before them', () => {
    assert.equal(withoutWorkflowQuotes('The reply\n\n  atomic-workflow:  \n  > done'), 'The reply');
  });

  it('removes an empty marked quote at the start', () => {
    assert.equal(withoutWorkflowQuotes('atomic-workflow:\n\nThe reply'), 'The reply');
  });
});
