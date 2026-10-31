/**
 * Output of a shell command that the user ran in the bash mode of Claude Code.
 */
interface BashOutput {
  /**
   * Standard output of the command, without whitespace at its end. Empty for none.
   */
  readonly stdout: string;

  /**
   * Standard error of the command, without whitespace at its end. Empty for none.
   */
  readonly stderr: string;
}

/**
 * Text of the bash mode of Claude Code: a shell command that the user ran with `!` before it, its output, or both.
 */
interface BashText {
  /**
   * Command as the user typed it, without whitespace around it, or `undefined` for a text that holds only output.
   */
  readonly command: string | undefined;

  /**
   * Output of the command, or `undefined` for a text that holds only the command.
   */
  readonly output: BashOutput | undefined;
}

/**
 * Pattern of a tag that Claude Code writes a command of the bash mode or its output into the transcript with, such as
 * `<bash-input>git status</bash-input>` or `<bash-stdout>done</bash-stdout>`. The kind of the tag, `input`, `stdout`
 * or `stderr`, is its first group, and its text the second.
 */
const BASH_TAG = /<bash-(input|stdout|stderr)>([\s\S]*?)<\/bash-\1>/g;

/**
 * Returns the text of the bash mode that the text `text` of the user is: the tag that Claude Code writes a command into
 * the transcript with, the tags of its standard output and its standard error, or all of them, in any order and with
 * nothing else around them. The text has output once it holds the tag of either stream. If the text holds anything
 * besides the tags, or none of them, returns `undefined` instead.
 */
export const parseBash = (text: string): BashText | undefined => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('<bash-') || trimmed.replace(BASH_TAG, '').trim() !== '') {
    return undefined;
  }
  const tags = new Map([...trimmed.matchAll(BASH_TAG)].map(([, kind, value]) => [kind, value ?? '']));
  const stdout = tags.get('stdout');
  const stderr = tags.get('stderr');
  return {
    command: tags.get('input')?.trim(),
    output:
      stdout === undefined && stderr === undefined
        ? undefined
        : { stdout: stdout?.trimEnd() ?? '', stderr: stderr?.trimEnd() ?? '' },
  };
};
