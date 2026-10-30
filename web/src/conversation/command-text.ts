/**
 * Command that a text of the user runs, such as `/clear` or `/plan 3`.
 */
interface CommandText {
  /**
   * Name of the command with its slash and without the plugin that holds it, such as `/plan` for
   * `/atomic-workflow:plan`.
   */
  readonly name: string;

  /**
   * Text after the name, without whitespace around it. Empty for a command without arguments.
   */
  readonly args: string;
}

/**
 * Pattern of a tag that Claude Code writes a command into the transcript with, such as
 * `<command-name>/clear</command-name>`. The kind of the tag, `name`, `message` or `args`, is its first group, and its
 * text the second.
 */
const COMMAND_TAG = /<command-(name|message|args)>([\s\S]*?)<\/command-\1>/g;

/**
 * Pattern of the plugin before the name of a command, such as `atomic-workflow:` of `atomic-workflow:plan`, up to
 * its first colon.
 */
const PLUGIN_PREFIX = /^[^:]*:/;

/**
 * Pattern of a text typed as a command: a slash and a word without whitespace, which is its first group, then
 * optionally whitespace and the arguments, its second group.
 */
const TYPED_COMMAND = /^(\/\S+)(?:\s+([\s\S]*))?$/;

/**
 * Returns the command that the tags of `text` hold. The tag `command-message` repeats the name, so only
 * `command-name` and `command-args` count. If `text` holds anything besides the tags, or no name, returns `undefined`
 * instead.
 */
const taggedCommand = (text: string): CommandText | undefined => {
  if (text.replace(COMMAND_TAG, '').trim() !== '') {
    return undefined;
  }
  const tags = new Map([...text.matchAll(COMMAND_TAG)].map(([, kind, value]) => [kind, value?.trim() ?? '']));
  const name = tags.get('name');
  if (name === undefined || name === '') {
    return undefined;
  }
  return { name: name.startsWith('/') ? name : `/${name}`, args: tags.get('args') ?? '' };
};

/**
 * Returns the command that `text` runs as the user typed it. If `text` does not start with a slash and a word, returns
 * `undefined` instead.
 */
const typedCommand = (text: string): CommandText | undefined => {
  const match = TYPED_COMMAND.exec(text);
  return match?.[1] === undefined ? undefined : { name: match[1], args: match[2]?.trim() ?? '' };
};

/**
 * Returns the command that the text `text` of the user runs: either the tags that Claude Code writes a command into
 * the transcript with, in any order and with nothing else around them, or a slash and a word at the start of the text,
 * as the user types a command. The name of the command drops the plugin that holds it. If the text runs no command,
 * returns `undefined` instead.
 */
export const parseCommand = (text: string): CommandText | undefined => {
  const trimmed = text.trim();
  const command = trimmed.startsWith('<command-') ? taggedCommand(trimmed) : typedCommand(trimmed);
  return command === undefined
    ? undefined
    : { ...command, name: `/${command.name.slice(1).replace(PLUGIN_PREFIX, '')}` };
};
