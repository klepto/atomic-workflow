/**
 * Suggestion of Claude Code for an always-allow answer to a permission prompt, such as a rule to add to the settings,
 * passed through as Claude Code gave it.
 */
export type PermissionSuggestion = Record<string, unknown>;

/**
 * Permission prompt that an agent of the repository waits on, for a tool call that needs the approval of the user.
 */
export interface PermissionPrompt {
  /**
   * Identifier of the prompt, unique while the repository server runs.
   */
  readonly id: string;

  /**
   * Identifier of the session that asks: a subagent, or else the main session.
   */
  readonly sessionId: string;

  /**
   * Type of the agent that asks, as Claude Code names it, or `null` for the main thread of the session.
   */
  readonly agentType: string | null;

  /**
   * Name of the tool of the call, such as `Bash`, or `mcp__<server>__<tool>`.
   */
  readonly toolName: string;

  /**
   * Input of the tool call, as Claude Code gave it.
   */
  readonly toolInput: unknown;

  /**
   * Suggestions of Claude Code for an always-allow answer, empty for none.
   */
  readonly suggestions: readonly PermissionSuggestion[];

  /**
   * Time in ms since the epoch at which the prompt opened.
   */
  readonly openedAt: number;
}

/**
 * Permission prompt to open, every field of a `PermissionPrompt` but its identifier.
 */
export type NewPermissionPrompt = Omit<PermissionPrompt, 'id'>;

/**
 * Answer to a permission prompt: `allow`, with the suggestions to keep as rules for an always-allow answer, or `deny`,
 * with the message that the agent reads.
 */
export type PermissionAnswer =
  | { readonly behavior: 'allow'; readonly updatedPermissions?: readonly PermissionSuggestion[] }
  | { readonly behavior: 'deny'; readonly message: string };

/**
 * Permission prompt that was opened, with the wait for its answer.
 */
export interface OpenedPermissionPrompt {
  /**
   * Prompt as the registry holds it.
   */
  readonly prompt: PermissionPrompt;

  /**
   * Resolves with the answer once the prompt is answered, or with `undefined` once it closes without one.
   */
  readonly answer: Promise<PermissionAnswer | undefined>;
}

/**
 * Registry of the open permission prompts. A prompt stays open until it is answered, or until the client that waits
 * on it goes away.
 */
export interface PermissionPrompts {
  /**
   * Opens the prompt `prompt` with a new identifier, until `closed` resolves, and returns it with the wait for its
   * answer.
   */
  open(prompt: NewPermissionPrompt, closed: Promise<void>): OpenedPermissionPrompt;

  /**
   * Returns the open prompt `id`. If no such prompt is open, returns `undefined` instead.
   */
  get(id: string): PermissionPrompt | undefined;

  /**
   * Returns every open prompt, the oldest first.
   */
  list(): readonly PermissionPrompt[];

  /**
   * Answers the open prompt `id` with `answer`, which closes it, and returns `true`. If no such prompt is open,
   * returns `false` instead.
   */
  answer(id: string, answer: PermissionAnswer): boolean;
}

/**
 * Function that returns a new registry of permission prompts, with no prompt open.
 */
export type CreatePermissionPromptsFunction = () => PermissionPrompts;
