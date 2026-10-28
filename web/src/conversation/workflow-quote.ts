/**
 * Line that marks the quote block after it as text of the atomic-workflow server, such as the messages that an agent
 * quotes at the start of its reply, the prompt of a subagent, or the word that ends the turn of a subagent.
 */
const MARK = 'atomic-workflow:';

/**
 * Returns the text `text` without the marked quotes at its start and at its end: each line `atomic-workflow:` and the
 * lines of the quote block after it, which start with `>`, with the blank lines around them. A text that holds only
 * marked quotes becomes empty, and a text that starts and ends with none stays as it is.
 */
export const withoutWorkflowQuotes = (text: string): string => {
  const lines = text.trim().split(/\r?\n/);
  const start = leadingQuotesEnd(lines);
  const end = trailingQuotesStart(lines, start);
  if (start === 0 && end === lines.length) return text;
  return lines.slice(start, end).join('\n');
};

/**
 * Returns the index of the first line of `lines` after the marked quotes at its start, and after the blank lines that
 * follow them. Without marked quotes at the start, returns 0.
 */
const leadingQuotesEnd = (lines: readonly string[]): number => {
  let index = 0;
  while (lines[index]?.trim() === MARK) {
    index += 1;
    while (lines[index]?.trimStart().startsWith('>')) index += 1;
    while (lines[index]?.trim() === '') index += 1;
  }
  return index;
};

/**
 * Returns the index of the first line of the marked quotes at the end of `lines`, and of the blank lines before them,
 * that lies at or after `start`. Without marked quotes at the end, returns the length of `lines`.
 */
const trailingQuotesStart = (lines: readonly string[], start: number): number => {
  let end = lines.length;
  for (;;) {
    let index = end;
    while (index > start && lines[index - 1].trimStart().startsWith('>')) index -= 1;
    if (index === end || index === start || lines[index - 1].trim() !== MARK) return end;
    end = index - 1;
    while (end > start && lines[end - 1].trim() === '') end -= 1;
  }
};
