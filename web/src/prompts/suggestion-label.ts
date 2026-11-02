import type { PermissionSuggestion } from '@/api/types.ts';

/**
 * Words of each destination of a suggestion, the settings that it changes, as they end the label of the suggestion.
 */
const DESTINATION_WORDS: Readonly<Record<string, string>> = {
  session: 'for this session',
  localSettings: 'in local settings',
  projectSettings: 'in project settings',
  userSettings: 'in user settings',
  cliArg: 'for this run',
};

/**
 * Returns the field `key` of `value` when it is a string. Otherwise returns `undefined` instead.
 */
const stringField = (value: unknown, key: string): string | undefined => {
  if (typeof value !== 'object' || value === null || !(key in value)) return undefined;
  const field: unknown = Reflect.get(value, key);
  return typeof field === 'string' ? field : undefined;
};

/**
 * Returns the field `key` of `value` when it is an array. Otherwise returns an empty array instead.
 */
const arrayField = (value: unknown, key: string): readonly unknown[] => {
  if (typeof value !== 'object' || value === null || !(key in value)) return [];
  const field: unknown = Reflect.get(value, key);
  return Array.isArray(field) ? field : [];
};

/**
 * Returns the rule `rule` of a suggestion as Claude Code writes it in its settings: the name of the tool, then the
 * content of the rule in parentheses when it has one, such as `Bash(npm test:*)`.
 */
const ruleText = (rule: unknown): string => {
  const toolName = stringField(rule, 'toolName') ?? '?';
  const content = stringField(rule, 'ruleContent');
  return content === undefined ? toolName : `${toolName}(${content})`;
};

/**
 * Returns the words of what the suggestion `suggestion` does, by its `type`, without its destination.
 */
const actionOf = (suggestion: PermissionSuggestion): string => {
  const type = stringField(suggestion, 'type');
  const rules = arrayField(suggestion, 'rules').map(ruleText).join(', ');
  const directories = arrayField(suggestion, 'directories')
    .filter((directory) => typeof directory === 'string')
    .join(', ');
  switch (type) {
    case 'addRules':
    case 'replaceRules':
      return `Always ${stringField(suggestion, 'behavior') ?? 'allow'} ${rules}`;
    case 'removeRules':
      return `Remove the rules ${rules}`;
    case 'setMode':
      return `Switch to the mode ${stringField(suggestion, 'mode') ?? '?'}`;
    case 'addDirectories':
      return `Always allow access to ${directories}`;
    case 'removeDirectories':
      return `Remove access to ${directories}`;
    default:
      return `Always allow: ${JSON.stringify(suggestion)}`;
  }
};

/**
 * Returns the label of the button that answers a permission prompt with always allow by the suggestion `suggestion`,
 * built from its fields as Claude Code gives them: what it does by its `type`, such as `Always allow Bash(npm test:*)`
 * for `addRules` or `Switch to the mode acceptEdits` for `setMode`, then where it applies by its `destination`, such
 * as `in local settings`. A suggestion of an unknown type shows as JSON.
 */
export const suggestionLabel = (suggestion: PermissionSuggestion): string => {
  const destination = stringField(suggestion, 'destination');
  const action = actionOf(suggestion);
  if (destination === undefined) return action;
  return `${action} ${DESTINATION_WORDS[destination] ?? `in ${destination}`}`;
};
