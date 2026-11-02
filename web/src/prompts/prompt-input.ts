/**
 * Input of a tool call as a permission prompt shows it.
 */
interface PromptInput {
  /**
   * How the input shows: `command` for the shell command of a call of `Bash`, and `json` for any other input, as
   * formatted JSON.
   */
  readonly kind: 'command' | 'json';

  /**
   * Text of the input.
   */
  readonly text: string;
}

/**
 * Name of the tool of Claude Code that runs a shell command.
 */
const BASH = 'Bash';

/**
 * Returns the input `toolInput` of a call of the tool `toolName` as a permission prompt shows it: the command of a call
 * of `Bash` that has one as a string, and any other input as JSON indented by 2 spaces. An input that JSON cannot
 * hold, such as `undefined`, shows as an empty text.
 */
export const promptInputOf = (toolName: string, toolInput: unknown): PromptInput => {
  if (toolName === BASH && typeof toolInput === 'object' && toolInput !== null && 'command' in toolInput) {
    const { command } = toolInput;
    if (typeof command === 'string') return { kind: 'command', text: command };
  }
  return { kind: 'json', text: JSON.stringify(toolInput, null, 2) ?? '' };
};
