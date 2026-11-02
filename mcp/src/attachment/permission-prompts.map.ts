import type {
  CreatePermissionPromptsFunction,
  NewPermissionPrompt,
  OpenedPermissionPrompt,
  PermissionAnswer,
  PermissionPrompt,
} from './permission-prompts.ts';

/**
 * State of one open prompt.
 */
interface OpenPrompt {
  /**
   * Prompt as the registry holds it.
   */
  readonly prompt: PermissionPrompt;

  /**
   * Ends the wait for the answer of the prompt with `answer`, or with `undefined` once the prompt closes without one.
   */
  readonly settle: (answer: PermissionAnswer | undefined) => void;
}

/**
 * State of the registry: its open prompts, by identifier, in the order of their opening, and the number of the last
 * identifier.
 */
interface Registry {
  /**
   * Open prompts, by identifier, in the order of their opening.
   */
  readonly prompts: Map<string, OpenPrompt>;

  /**
   * Number of the last identifier that the registry gave.
   */
  lastId: number;
}

/**
 * `CreatePermissionPromptsFunction` that keeps the open prompts in a map, by identifier, in the order of their opening.
 * The identifiers are the numbers from 1, as strings.
 */
export const mapCreatePermissionPrompts: CreatePermissionPromptsFunction = () => {
  const registry: Registry = { prompts: new Map(), lastId: 0 };
  return {
    open: (prompt, closed) => open(registry, prompt, closed),
    get: (id) => registry.prompts.get(id)?.prompt,
    list: () => [...registry.prompts.values()].map(({ prompt }) => prompt),
    answer: (id, answer) => settle(registry, id, answer),
  };
};

/**
 * Opens `prompt` in `registry` with a new identifier, until `closed` resolves, and returns it with the wait for its
 * answer.
 */
const open = (registry: Registry, prompt: NewPermissionPrompt, closed: Promise<void>): OpenedPermissionPrompt => {
  registry.lastId += 1;
  const opened: PermissionPrompt = { id: String(registry.lastId), ...prompt };
  const { promise, resolve } = Promise.withResolvers<PermissionAnswer | undefined>();
  registry.prompts.set(opened.id, { prompt: opened, settle: resolve });
  void closed.then(() => settle(registry, opened.id, undefined));
  return { prompt: opened, answer: promise };
};

/**
 * Removes the open prompt `id` from `registry`, ends its wait with `answer`, and returns `true`. If `registry` holds
 * no such prompt, returns `false` instead.
 */
const settle = (registry: Registry, id: string, answer: PermissionAnswer | undefined): boolean => {
  const entry = registry.prompts.get(id);
  if (entry === undefined) return false;
  registry.prompts.delete(id);
  entry.settle(answer);
  return true;
};
