import { z } from 'zod';

/**
 * Schema of the fields of the input of a hook of Claude Code that the hooks of the plugin read.
 */
const HOOK_INPUT = z.object({
  session_id: z.string().min(1),
  cwd: z.string().min(1),
});

/**
 * Fields of the input of a hook of Claude Code that the hooks of the plugin read.
 */
type HookInput = z.infer<typeof HOOK_INPUT>;

/**
 * Returns the fields of the input of a hook in `text`, the JSON that the hook reads on its standard input.
 * If `text` is not valid JSON, or lacks a field, throws.
 */
export const parseHookInput = (text: string): HookInput => HOOK_INPUT.parse(JSON.parse(text));

/**
 * Returns the directory of the project of the session of the hook input `input`: the variable `CLAUDE_PROJECT_DIR` of
 * `environment`, or else the working directory of the session.
 */
export const hookDirectory = (input: HookInput, environment: NodeJS.ProcessEnv): string =>
  environment.CLAUDE_PROJECT_DIR ?? input.cwd;
