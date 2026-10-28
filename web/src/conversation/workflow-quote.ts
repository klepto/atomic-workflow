/**
 * Line that marks the quote block after it as text of the atomic-workflow server, such as the messages that an agent
 * quotes at the start of its reply, the prompt of a subagent, or the word that ends the turn of a subagent.
 */
const MARK = 'atomic-workflow:';

/**
 * Returns the text `text` without the marked quotes at its start: each line `atomic-workflow:`, the lines of the quote
 * block after it, which start with `>`, and the blank lines after them. A text that holds only marked quotes becomes
 * empty, and a text that starts with none stays as it is.
 */
export const withoutWorkflowQuotes = (text: string): string => {
  const lines = text.trimStart().split(/\r?\n/);
  let index = 0;
  while (lines[index]?.trim() === MARK) {
    index += 1;
    while (lines[index]?.trimStart().startsWith('>')) index += 1;
    while (lines[index]?.trim() === '') index += 1;
  }
  return index === 0 ? text : lines.slice(index).join('\n');
};
